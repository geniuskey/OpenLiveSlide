import type { Server } from 'socket.io';
import type { Redis } from 'ioredis';
import { prisma } from '@openliveslide/db';
import {
  PollResponseSchema,
  PollSlideConfigSchema,
  type ClientToServerEvents,
  type PollAggregate,
  type ServerToClientEvents,
} from '@openliveslide/shared';

const audienceRoom = (sessionId: string) => `session:${sessionId}:audience`;
const presenterRoom = (sessionId: string) => `session:${sessionId}:presenter`;

const countsKey = (slideId: string) => `poll:${slideId}:counts`;
const participantsKey = (slideId: string) => `poll:${slideId}:participants`;

const THROTTLE_MS = 200;

interface ThrottleSlot {
  lastEmit: number;
  pending: NodeJS.Timeout | null;
}
const throttle = new Map<string, ThrottleSlot>();

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

export interface PollResponseInput {
  sessionId: string;
  slideId: string;
  participantId: string;
  payload: unknown;
}

export async function recordPollResponse(
  io: IO,
  redis: Redis,
  input: PollResponseInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = PollResponseSchema.safeParse(input.payload);
  if (!parsed.success) return { ok: false, error: 'invalid_payload' };

  const slide = await prisma.slide.findFirst({
    where: { id: input.slideId, deck: { sessions: { some: { id: input.sessionId } } } },
  });
  if (!slide || slide.type !== 'POLL') return { ok: false, error: 'slide_not_found' };

  const config = PollSlideConfigSchema.safeParse(slide.config);
  if (!config.success) return { ok: false, error: 'invalid_slide_config' };

  const validIds = new Set(config.data.choices.map((c) => c.id));
  const incoming = Array.from(new Set(parsed.data.choiceIds.filter((id) => validIds.has(id))));
  if (incoming.length === 0) return { ok: false, error: 'no_valid_choices' };
  if (!config.data.multiSelect && incoming.length > 1) return { ok: false, error: 'multi_not_allowed' };

  const session = await prisma.session.findUnique({
    where: { id: input.sessionId },
    select: { status: true, currentSlideId: true },
  });
  if (!session) return { ok: false, error: 'session_not_found' };
  if (session.status !== 'LIVE') return { ok: false, error: 'session_not_live' };
  if (session.currentSlideId !== input.slideId) return { ok: false, error: 'slide_not_active' };

  const prior = await prisma.response.findMany({
    where: { participantId: input.participantId, slideId: input.slideId },
    select: { id: true, payload: true },
  });
  const priorChoiceIds = prior
    .flatMap((r) => {
      const p = r.payload as { choiceIds?: string[] } | null;
      return p?.choiceIds ?? [];
    })
    .filter((id) => validIds.has(id));

  await prisma.$transaction([
    prisma.response.deleteMany({
      where: { participantId: input.participantId, slideId: input.slideId },
    }),
    prisma.response.create({
      data: {
        sessionId: input.sessionId,
        slideId: input.slideId,
        participantId: input.participantId,
        payload: { choiceIds: incoming },
      },
    }),
  ]);

  const m = redis.multi();
  for (const id of priorChoiceIds) m.hincrby(countsKey(input.slideId), id, -1);
  for (const id of incoming) m.hincrby(countsKey(input.slideId), id, 1);
  m.sadd(participantsKey(input.slideId), input.participantId);
  await m.exec();

  scheduleAggregate(io, redis, input.sessionId, input.slideId);
  return { ok: true };
}

export function scheduleAggregate(io: IO, redis: Redis, sessionId: string, slideId: string): void {
  const slot = throttle.get(slideId) ?? { lastEmit: 0, pending: null };
  const now = Date.now();
  const dueIn = Math.max(0, slot.lastEmit + THROTTLE_MS - now);

  if (dueIn === 0) {
    slot.lastEmit = now;
    throttle.set(slideId, slot);
    void emitAggregate(io, redis, sessionId, slideId);
    return;
  }

  if (slot.pending) return;
  slot.pending = setTimeout(() => {
    const cur = throttle.get(slideId);
    if (cur) {
      cur.pending = null;
      cur.lastEmit = Date.now();
    }
    void emitAggregate(io, redis, sessionId, slideId);
  }, dueIn);
  throttle.set(slideId, slot);
}

async function emitAggregate(io: IO, redis: Redis, sessionId: string, slideId: string): Promise<void> {
  const [counts, totalResponses] = await Promise.all([
    redis.hgetall(countsKey(slideId)),
    redis.scard(participantsKey(slideId)),
  ]);
  const totals: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) totals[k] = n;
  }
  const aggregate: PollAggregate = { slideId, totals, totalResponses };
  io.to([audienceRoom(sessionId), presenterRoom(sessionId)]).emit('poll:aggregate', aggregate);
}

export async function snapshotPollAggregate(
  redis: Redis,
  slideId: string,
): Promise<PollAggregate> {
  const [counts, totalResponses] = await Promise.all([
    redis.hgetall(countsKey(slideId)),
    redis.scard(participantsKey(slideId)),
  ]);
  const totals: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) totals[k] = n;
  }
  return { slideId, totals, totalResponses };
}

export function disposePollState(slideId: string): void {
  const slot = throttle.get(slideId);
  if (slot?.pending) clearTimeout(slot.pending);
  throttle.delete(slideId);
}
