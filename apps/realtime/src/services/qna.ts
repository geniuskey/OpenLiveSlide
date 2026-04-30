import type { Server } from 'socket.io';
import type { Redis } from 'ioredis';
import { prisma } from '@openliveslide/db';
import {
  QnaResponseSchema,
  type ClientToServerEvents,
  type QnaItem,
  type ServerToClientEvents,
} from '@openliveslide/shared';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

const audienceRoom = (sessionId: string) => `session:${sessionId}:audience`;
const presenterRoom = (sessionId: string) => `session:${sessionId}:presenter`;

const upvotesKey = (slideId: string) => `qna:${slideId}:upvotes`;
const upvotersKey = (slideId: string, responseId: string) => `qna:${slideId}:up:${responseId}`;
const flagsKey = (slideId: string, kind: 'highlight' | 'complete') =>
  `qna:${slideId}:${kind}`;
const cooldownKey = (slideId: string, participantId: string) =>
  `qna:${slideId}:cooldown:${participantId}`;

const THROTTLE_MS = 250;
const SUBMIT_COOLDOWN_MS = 2_000;

interface Slot {
  lastEmit: number;
  pending: NodeJS.Timeout | null;
}
const throttle = new Map<string, Slot>();

interface RecordInput {
  sessionId: string;
  slideId: string;
  participantId: string;
  payload: unknown;
}

export async function recordQnaQuestion(
  io: IO,
  redis: Redis,
  input: RecordInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = QnaResponseSchema.safeParse(input.payload);
  if (!parsed.success) return { ok: false, error: 'invalid_payload' };

  const slide = await prisma.slide.findFirst({
    where: { id: input.slideId, deck: { sessions: { some: { id: input.sessionId } } } },
  });
  if (!slide || slide.type !== 'QNA') return { ok: false, error: 'slide_not_found' };

  const session = await prisma.session.findUnique({
    where: { id: input.sessionId },
    select: { status: true, currentSlideId: true },
  });
  if (!session || session.status !== 'LIVE') return { ok: false, error: 'session_not_live' };
  if (session.currentSlideId !== input.slideId) return { ok: false, error: 'slide_not_active' };

  // Atomic cross-instance cooldown: SET NX with PX TTL ensures only the first
  // submit within the window succeeds, regardless of which realtime server
  // received it.
  const cdKey = cooldownKey(input.slideId, input.participantId);
  const acquired = await redis.set(cdKey, '1', 'PX', SUBMIT_COOLDOWN_MS, 'NX');
  if (acquired !== 'OK') {
    return { ok: false, error: 'too_fast' };
  }

  await prisma.response.create({
    data: {
      sessionId: input.sessionId,
      slideId: input.slideId,
      participantId: input.participantId,
      payload: { text: parsed.data.text.trim().slice(0, 500) },
    },
  });

  scheduleBroadcast(io, redis, input.sessionId, input.slideId);
  return { ok: true };
}

export async function upvoteQuestion(
  io: IO,
  redis: Redis,
  input: { sessionId: string; slideId: string; responseId: string; participantId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await prisma.response.findFirst({
    where: { id: input.responseId, slideId: input.slideId, sessionId: input.sessionId },
    select: { id: true, participantId: true },
  });
  if (!response) return { ok: false, error: 'question_not_found' };
  if (response.participantId === input.participantId) {
    return { ok: false, error: 'cannot_upvote_own' };
  }

  const added = await redis.sadd(
    upvotersKey(input.slideId, input.responseId),
    input.participantId,
  );
  if (added > 0) {
    await redis.hincrby(upvotesKey(input.slideId), input.responseId, 1);
  }
  scheduleBroadcast(io, redis, input.sessionId, input.slideId);
  return { ok: true };
}

export async function setQnaFlag(
  io: IO,
  redis: Redis,
  input: {
    sessionId: string;
    slideId: string;
    responseId: string;
    kind: 'highlight' | 'complete';
    value: boolean;
  },
): Promise<void> {
  const key = flagsKey(input.slideId, input.kind);
  if (input.value) await redis.sadd(key, input.responseId);
  else await redis.srem(key, input.responseId);
  scheduleBroadcast(io, redis, input.sessionId, input.slideId);
}

function scheduleBroadcast(io: IO, redis: Redis, sessionId: string, slideId: string): void {
  const slot = throttle.get(slideId) ?? { lastEmit: 0, pending: null };
  const now = Date.now();
  const dueIn = Math.max(0, slot.lastEmit + THROTTLE_MS - now);
  if (dueIn === 0) {
    slot.lastEmit = now;
    throttle.set(slideId, slot);
    void emitItems(io, redis, sessionId, slideId);
    return;
  }
  if (slot.pending) return;
  slot.pending = setTimeout(() => {
    const cur = throttle.get(slideId);
    if (cur) {
      cur.pending = null;
      cur.lastEmit = Date.now();
    }
    void emitItems(io, redis, sessionId, slideId);
  }, dueIn);
  throttle.set(slideId, slot);
}

export async function snapshotQnaItems(redis: Redis, slideId: string): Promise<QnaItem[]> {
  const responses = await prisma.response.findMany({
    where: { slideId },
    orderBy: { createdAt: 'asc' },
    include: { participant: { select: { nickname: true } } },
  });

  const [counts, highlighted, completed] = await Promise.all([
    redis.hgetall(upvotesKey(slideId)),
    redis.smembers(flagsKey(slideId, 'highlight')),
    redis.smembers(flagsKey(slideId, 'complete')),
  ]);
  const highlightSet = new Set(highlighted);
  const completeSet = new Set(completed);

  return responses.map((r) => {
    const text = (r.payload as { text?: string } | null)?.text ?? '';
    const upvotes = Number(counts[r.id] ?? 0);
    return {
      id: r.id,
      text,
      nickname: r.participant.nickname,
      upvotes: Number.isFinite(upvotes) ? upvotes : 0,
      highlighted: highlightSet.has(r.id),
      completed: completeSet.has(r.id),
      createdAt: r.createdAt.toISOString(),
    };
  });
}

async function emitItems(io: IO, redis: Redis, sessionId: string, slideId: string): Promise<void> {
  const items = await snapshotQnaItems(redis, slideId);
  io.to([audienceRoom(sessionId), presenterRoom(sessionId)]).emit('qna:items', {
    slideId,
    items,
  });
}

export async function disposeQnaState(redis: Redis, slideId: string): Promise<void> {
  const slot = throttle.get(slideId);
  if (slot?.pending) clearTimeout(slot.pending);
  throttle.delete(slideId);

  // Clean Redis keys for this slide so they don't accumulate across many
  // sessions. Cooldown keys self-expire via PX, but everything else is
  // unbounded without explicit removal.
  const keysToDelete: string[] = [
    upvotesKey(slideId),
    flagsKey(slideId, 'highlight'),
    flagsKey(slideId, 'complete'),
  ];
  // Sweep upvoter sets (one per response) and any pending cooldown keys.
  const stream = redis.scanStream({ match: `qna:${slideId}:*`, count: 200 });
  for await (const batch of stream) {
    for (const key of batch as string[]) keysToDelete.push(key);
  }
  if (keysToDelete.length > 0) {
    await redis.del(...new Set(keysToDelete));
  }
}
