import type { Server, Socket } from 'socket.io';
import { prisma } from '@openliveslide/db';
import {
  isValidJoinCode,
  verifyPresenterToken,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SessionStateDTO,
  type SlideDTO,
} from '@openliveslide/shared';

import { env } from '../env.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const audienceRoom = (sessionId: string) => `session:${sessionId}:audience`;
const presenterRoom = (sessionId: string) => `session:${sessionId}:presenter`;

interface SocketContext {
  audienceSessionId?: string;
  participantId?: string;
  presenterSessionId?: string;
  presenterUserId?: string;
}

const contexts = new WeakMap<IOSocket, SocketContext>();
function ctx(socket: IOSocket): SocketContext {
  let c = contexts.get(socket);
  if (!c) {
    c = {};
    contexts.set(socket, c);
  }
  return c;
}

async function loadSlide(slideId: string): Promise<SlideDTO | null> {
  const slide = await prisma.slide.findUnique({ where: { id: slideId } });
  if (!slide) return null;
  return { id: slide.id, order: slide.order, type: slide.type, config: slide.config };
}

async function sessionState(sessionId: string): Promise<SessionStateDTO | null> {
  const s = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      joinCode: true,
      status: true,
      currentSlideId: true,
      _count: { select: { participants: true } },
    },
  });
  if (!s) return null;
  return {
    id: s.id,
    joinCode: s.joinCode,
    status: s.status,
    currentSlideId: s.currentSlideId,
    participantCount: s._count.participants,
  };
}

export function registerHandlers(io: IO): void {
  io.on('connection', (socket) => {
    socket.on('audience:join', async (payload, cb) => {
      try {
        const { joinCode, nickname, clientId } = payload ?? {};
        if (
          typeof joinCode !== 'string' ||
          !isValidJoinCode(joinCode) ||
          typeof clientId !== 'string' ||
          clientId.length < 4 ||
          typeof nickname !== 'string'
        ) {
          return cb({ ok: false, error: 'invalid_payload' });
        }

        const session = await prisma.session.findUnique({
          where: { joinCode: joinCode.toUpperCase() },
        });
        if (!session || session.status === 'ENDED') {
          return cb({ ok: false, error: 'session_not_found' });
        }

        const trimmed = nickname.trim().slice(0, 32) || `Guest-${clientId.slice(0, 4)}`;
        const participant = await prisma.participant.upsert({
          where: { sessionId_clientId: { sessionId: session.id, clientId } },
          update: { nickname: trimmed },
          create: { sessionId: session.id, clientId, nickname: trimmed },
        });

        await socket.join(audienceRoom(session.id));
        ctx(socket).audienceSessionId = session.id;
        ctx(socket).participantId = participant.id;

        const state = await sessionState(session.id);
        const slide = session.currentSlideId ? await loadSlide(session.currentSlideId) : null;

        io.to(presenterRoom(session.id)).emit('participant:joined', {
          participant: { id: participant.id, nickname: participant.nickname, score: participant.score },
        });

        cb({ ok: true, participantId: participant.id, session: state!, slide });
      } catch (err) {
        socket.data.error = err;
        cb({ ok: false, error: 'internal_error' });
      }
    });

    socket.on('audience:respond', async (_payload, cb) => {
      // milestone 5+ — slide-type-specific handlers
      cb({ ok: false, error: 'not_implemented' });
    });

    socket.on('presenter:join', async (payload, cb) => {
      try {
        const { sessionId, token } = payload ?? {};
        if (typeof sessionId !== 'string' || typeof token !== 'string') {
          return cb({ ok: false, error: 'invalid_payload' });
        }

        let claims;
        try {
          claims = await verifyPresenterToken(token, env.PRESENTER_TOKEN_SECRET);
        } catch {
          return cb({ ok: false, error: 'invalid_token' });
        }
        if (claims.sessionId !== sessionId) {
          return cb({ ok: false, error: 'token_session_mismatch' });
        }

        const session = await prisma.session.findUnique({
          where: { id: sessionId },
          include: { deck: { select: { ownerId: true } } },
        });
        if (!session) return cb({ ok: false, error: 'session_not_found' });
        if (session.deck.ownerId !== claims.userId) {
          return cb({ ok: false, error: 'forbidden' });
        }

        await socket.join([presenterRoom(sessionId), audienceRoom(sessionId)]);
        ctx(socket).presenterSessionId = sessionId;
        ctx(socket).presenterUserId = claims.userId;

        const state = await sessionState(sessionId);
        cb({ ok: true, session: state! });
      } catch {
        cb({ ok: false, error: 'internal_error' });
      }
    });

    socket.on('presenter:start', async ({ sessionId }) => {
      const c = ctx(socket);
      if (c.presenterSessionId !== sessionId) return;

      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { deck: { include: { slides: { orderBy: { order: 'asc' }, take: 1 } } } },
      });
      if (!session) return;
      const firstSlide = session.deck.slides[0];

      await prisma.session.update({
        where: { id: sessionId },
        data: {
          status: 'LIVE',
          startedAt: session.startedAt ?? new Date(),
          currentSlideId: session.currentSlideId ?? firstSlide?.id ?? null,
        },
      });

      const advanceTo = session.currentSlideId ?? firstSlide?.id;
      if (advanceTo) {
        const slide = await loadSlide(advanceTo);
        if (slide) {
          io.to([presenterRoom(sessionId), audienceRoom(sessionId)]).emit('slide:changed', {
            slide,
            startedAt: new Date().toISOString(),
          });
        }
      }
    });

    socket.on('presenter:advance', async ({ sessionId, slideId }) => {
      const c = ctx(socket);
      if (c.presenterSessionId !== sessionId) return;

      const slide = await prisma.slide.findFirst({
        where: { id: slideId, deck: { sessions: { some: { id: sessionId } } } },
      });
      if (!slide) return;

      await prisma.session.update({
        where: { id: sessionId },
        data: { currentSlideId: slide.id },
      });

      io.to([presenterRoom(sessionId), audienceRoom(sessionId)]).emit('slide:changed', {
        slide: { id: slide.id, order: slide.order, type: slide.type, config: slide.config },
        startedAt: new Date().toISOString(),
      });
    });

    socket.on('presenter:end', async ({ sessionId }) => {
      const c = ctx(socket);
      if (c.presenterSessionId !== sessionId) return;

      await prisma.session.update({
        where: { id: sessionId },
        data: { status: 'ENDED', endedAt: new Date() },
      });
      io.to([presenterRoom(sessionId), audienceRoom(sessionId)]).emit('session:ended', {
        sessionId,
      });
    });

    socket.on('disconnect', () => {
      const c = ctx(socket);
      if (c.audienceSessionId && c.participantId) {
        io.to(presenterRoom(c.audienceSessionId)).emit('participant:left', {
          participantId: c.participantId,
        });
      }
    });
  });
}
