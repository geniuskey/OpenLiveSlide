import type { Server } from 'socket.io';
import type { Redis } from 'ioredis';
import { prisma } from '@openliveslide/db';
import {
  WordCloudResponseSchema,
  WordCloudSlideConfigSchema,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type WordCloudAggregate,
} from '@openliveslide/shared';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

const audienceRoom = (sessionId: string) => `session:${sessionId}:audience`;
const presenterRoom = (sessionId: string) => `session:${sessionId}:presenter`;

const countsKey = (slideId: string) => `wordcloud:${slideId}:counts`;
const submissionsKey = (slideId: string, participantId: string) =>
  `wordcloud:${slideId}:p:${participantId}`;

const THROTTLE_MS = 250;
interface Slot {
  lastEmit: number;
  pending: NodeJS.Timeout | null;
}
const throttle = new Map<string, Slot>();

function normalizeWord(raw: string): string | null {
  const w = raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40);
  if (!w) return null;
  return w;
}

export async function recordWordCloudResponse(
  io: IO,
  redis: Redis,
  input: { sessionId: string; slideId: string; participantId: string; payload: unknown },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = WordCloudResponseSchema.safeParse(input.payload);
  if (!parsed.success) return { ok: false, error: 'invalid_payload' };

  const slide = await prisma.slide.findFirst({
    where: { id: input.slideId, deck: { sessions: { some: { id: input.sessionId } } } },
  });
  if (!slide || slide.type !== 'WORDCLOUD') return { ok: false, error: 'slide_not_found' };
  const cfg = WordCloudSlideConfigSchema.safeParse(slide.config);
  if (!cfg.success) return { ok: false, error: 'invalid_slide_config' };

  const session = await prisma.session.findUnique({
    where: { id: input.sessionId },
    select: { status: true, currentSlideId: true },
  });
  if (!session || session.status !== 'LIVE') return { ok: false, error: 'session_not_live' };
  if (session.currentSlideId !== input.slideId) return { ok: false, error: 'slide_not_active' };

  const max = cfg.data.maxWordsPerParticipant;
  const incoming = Array.from(
    new Set(
      parsed.data.words
        .map(normalizeWord)
        .filter((w): w is string => w !== null),
    ),
  ).slice(0, max);
  if (incoming.length === 0) return { ok: false, error: 'no_valid_words' };

  // Replace this participant's prior submission with the new one (idempotent re-submit).
  const priorRaw = await redis.smembers(submissionsKey(input.slideId, input.participantId));
  const prior = new Set(priorRaw);
  const next = new Set(incoming);

  const toRemove = [...prior].filter((w) => !next.has(w));
  const toAdd = [...next].filter((w) => !prior.has(w));

  const m = redis.multi();
  for (const w of toRemove) m.hincrby(countsKey(input.slideId), w, -1);
  for (const w of toAdd) m.hincrby(countsKey(input.slideId), w, 1);
  if (toRemove.length) m.srem(submissionsKey(input.slideId, input.participantId), ...toRemove);
  if (toAdd.length) m.sadd(submissionsKey(input.slideId, input.participantId), ...toAdd);
  await m.exec();

  await prisma.response.create({
    data: {
      sessionId: input.sessionId,
      slideId: input.slideId,
      participantId: input.participantId,
      payload: { words: incoming },
    },
  });

  scheduleBroadcast(io, redis, input.sessionId, input.slideId);
  return { ok: true };
}

function scheduleBroadcast(io: IO, redis: Redis, sessionId: string, slideId: string): void {
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

export async function snapshotWordCloud(redis: Redis, slideId: string): Promise<WordCloudAggregate> {
  const counts = await redis.hgetall(countsKey(slideId));
  const words = Object.entries(counts)
    .map(([word, v]) => ({ word, count: Number(v) || 0 }))
    .filter((w) => w.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 60);
  return { slideId, words };
}

async function emitAggregate(
  io: IO,
  redis: Redis,
  sessionId: string,
  slideId: string,
): Promise<void> {
  const agg = await snapshotWordCloud(redis, slideId);
  io.to([audienceRoom(sessionId), presenterRoom(sessionId)]).emit('wordcloud:aggregate', agg);
}

export function disposeWordCloudState(slideId: string): void {
  const slot = throttle.get(slideId);
  if (slot?.pending) clearTimeout(slot.pending);
  throttle.delete(slideId);
}
