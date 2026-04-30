import type { Server, Socket } from 'socket.io';
import type { Redis } from 'ioredis';
import { prisma } from '@openliveslide/db';
import {
  QuizResponseSchema,
  QuizSlideConfigSchema,
  type ClientToServerEvents,
  type LeaderboardEntry,
  type QuizReveal,
  type ServerToClientEvents,
} from '@openliveslide/shared';

import { audienceRoom, presenterRoom } from '../rooms.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

// Redis-backed round state — survives realtime restarts and is consistent
// across multiple realtime replicas. Each replica still arms a local timer,
// but reveal is gated by an atomic SET-NX lock so only one replica fires it.
const roundKey = (sessionId: string) => `quiz:${sessionId}:round`;
const answersKey = (sessionId: string) => `quiz:${sessionId}:answers`;
const revealLockKey = (sessionId: string) => `quiz:${sessionId}:reveal-lock`;

const ROUND_TTL_SECONDS = 60 * 60; // round state is auto-expired as a safety net
const TALLY_THROTTLE_MS = 200;

interface RoundMeta {
  slideId: string;
  startedAt: number;
  deadlineAt: number;
  timeLimitMs: number;
  pointsBase: number;
  correctChoiceId: string;
}

interface AnswerRecord {
  participantId: string;
  choiceId: string;
  elapsedMs: number;
  scoreEarned: number;
  correct: boolean;
}

// Per-process scaffolding: timers + throttle. Multiple replicas may arm their
// own timers; that's fine because reveal is idempotent via the lock.
interface LocalSlot {
  timer: NodeJS.Timeout | null;
  pendingTally: NodeJS.Timeout | null;
  lastTallyEmit: number;
}
const localSlots = new Map<string, LocalSlot>(); // by sessionId

function localSlot(sessionId: string): LocalSlot {
  let s = localSlots.get(sessionId);
  if (!s) {
    s = { timer: null, pendingTally: null, lastTallyEmit: 0 };
    localSlots.set(sessionId, s);
  }
  return s;
}

function clearLocal(sessionId: string): void {
  const s = localSlots.get(sessionId);
  if (!s) return;
  if (s.timer) clearTimeout(s.timer);
  if (s.pendingTally) clearTimeout(s.pendingTally);
  localSlots.delete(sessionId);
}

function computeScore(correct: boolean, elapsedMs: number, timeLimitMs: number, pointsBase: number): number {
  if (!correct) return 0;
  const ratio = Math.min(1, Math.max(0, elapsedMs / timeLimitMs));
  return Math.round(pointsBase * (1 - ratio / 2));
}

async function loadRoundMeta(redis: Redis, sessionId: string): Promise<RoundMeta | null> {
  const h = await redis.hgetall(roundKey(sessionId));
  if (!h.slideId) return null;
  return {
    slideId: h.slideId,
    startedAt: Number(h.startedAt),
    deadlineAt: Number(h.deadlineAt),
    timeLimitMs: Number(h.timeLimitMs),
    pointsBase: Number(h.pointsBase),
    correctChoiceId: h.correctChoiceId,
  };
}

export async function startQuizRound(
  io: IO,
  redis: Redis,
  sessionId: string,
  slide: { id: string; config: unknown },
): Promise<void> {
  // Ensure any prior round in this session is revealed before starting a new one.
  await endRound(io, redis, sessionId);

  const cfg = QuizSlideConfigSchema.safeParse(slide.config);
  if (!cfg.success) return;

  const startedAt = Date.now();
  const meta: RoundMeta = {
    slideId: slide.id,
    startedAt,
    deadlineAt: startedAt + cfg.data.timeLimitMs,
    timeLimitMs: cfg.data.timeLimitMs,
    pointsBase: cfg.data.pointsBase,
    correctChoiceId: cfg.data.correctChoiceId,
  };

  const m = redis.multi();
  m.del(roundKey(sessionId), answersKey(sessionId), revealLockKey(sessionId));
  m.hset(roundKey(sessionId), {
    slideId: meta.slideId,
    startedAt: String(meta.startedAt),
    deadlineAt: String(meta.deadlineAt),
    timeLimitMs: String(meta.timeLimitMs),
    pointsBase: String(meta.pointsBase),
    correctChoiceId: meta.correctChoiceId,
  });
  m.expire(roundKey(sessionId), ROUND_TTL_SECONDS);
  await m.exec();

  const slot = localSlot(sessionId);
  if (slot.timer) clearTimeout(slot.timer);
  slot.timer = setTimeout(() => {
    void revealRound(io, redis, sessionId).catch(() => undefined);
  }, cfg.data.timeLimitMs);
}

export async function endRound(io: IO, redis: Redis, sessionId: string): Promise<void> {
  const meta = await loadRoundMeta(redis, sessionId);
  if (!meta) {
    clearLocal(sessionId);
    return;
  }
  // Always reveal so audience sees their score, regardless of cause.
  await revealRound(io, redis, sessionId);
}

export async function recordQuizAnswer(
  io: IO,
  redis: Redis,
  socket: IOSocket,
  input: {
    sessionId: string;
    slideId: string;
    participantId: string;
    payload: unknown;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const meta = await loadRoundMeta(redis, input.sessionId);
  if (!meta) return { ok: false, error: 'no_active_round' };
  if (meta.slideId !== input.slideId) return { ok: false, error: 'slide_not_active' };
  if (Date.now() > meta.deadlineAt) return { ok: false, error: 'time_expired' };

  // Atomic dedupe across replicas: HSETNX returns 0 if the participant
  // already has an answer recorded in Redis.
  const placeholder = '1';
  const reserved = await redis.hsetnx(answersKey(input.sessionId), input.participantId, placeholder);
  if (reserved === 0) return { ok: false, error: 'already_answered' };

  const parsed = QuizResponseSchema.safeParse(input.payload);
  if (!parsed.success) {
    await redis.hdel(answersKey(input.sessionId), input.participantId);
    return { ok: false, error: 'invalid_payload' };
  }

  const slide = await prisma.slide.findUnique({ where: { id: input.slideId } });
  if (!slide) {
    await redis.hdel(answersKey(input.sessionId), input.participantId);
    return { ok: false, error: 'slide_not_found' };
  }
  const slideCfg = QuizSlideConfigSchema.safeParse(slide.config);
  if (!slideCfg.success) {
    await redis.hdel(answersKey(input.sessionId), input.participantId);
    return { ok: false, error: 'invalid_slide_config' };
  }
  if (!slideCfg.data.choices.some((c) => c.id === parsed.data.choiceId)) {
    await redis.hdel(answersKey(input.sessionId), input.participantId);
    return { ok: false, error: 'invalid_choice' };
  }

  // Trust server clock for elapsed; the client-supplied value is ignored to
  // prevent score manipulation.
  const elapsedMs = Math.max(0, Date.now() - meta.startedAt);
  const correct = parsed.data.choiceId === meta.correctChoiceId;
  const scoreEarned = computeScore(correct, elapsedMs, meta.timeLimitMs, meta.pointsBase);

  const record: AnswerRecord = {
    participantId: input.participantId,
    choiceId: parsed.data.choiceId,
    elapsedMs,
    scoreEarned,
    correct,
  };
  await redis.hset(answersKey(input.sessionId), input.participantId, JSON.stringify(record));
  await redis.expire(answersKey(input.sessionId), ROUND_TTL_SECONDS);

  await prisma.$transaction([
    prisma.response.create({
      data: {
        sessionId: input.sessionId,
        slideId: input.slideId,
        participantId: input.participantId,
        payload: { choiceId: record.choiceId, elapsedMs, scoreEarned, correct },
      },
    }),
    prisma.participant.update({
      where: { id: input.participantId },
      data: { score: { increment: scoreEarned } },
    }),
  ]);

  const total = await prisma.participant.findUnique({
    where: { id: input.participantId },
    select: { score: true },
  });
  socket.emit('quiz:score', {
    slideId: input.slideId,
    correct,
    scoreEarned,
    totalScore: total?.score ?? 0,
  });

  scheduleTally(io, redis, input.sessionId, input.slideId);
  return { ok: true };
}

function scheduleTally(io: IO, redis: Redis, sessionId: string, slideId: string): void {
  const slot = localSlot(sessionId);
  const now = Date.now();
  const dueIn = Math.max(0, slot.lastTallyEmit + TALLY_THROTTLE_MS - now);
  if (dueIn === 0) {
    slot.lastTallyEmit = now;
    void emitTally(io, redis, sessionId, slideId);
    return;
  }
  if (slot.pendingTally) return;
  slot.pendingTally = setTimeout(() => {
    slot.pendingTally = null;
    slot.lastTallyEmit = Date.now();
    void emitTally(io, redis, sessionId, slideId);
  }, dueIn);
}

async function emitTally(io: IO, redis: Redis, sessionId: string, slideId: string): Promise<void> {
  const answeredCount = await redis.hlen(answersKey(sessionId));
  io.to([audienceRoom(sessionId), presenterRoom(sessionId)]).emit('quiz:tally', {
    slideId,
    answeredCount,
  });
}

async function revealRound(io: IO, redis: Redis, sessionId: string): Promise<void> {
  // Atomic single-fire across replicas: only the first to acquire the lock
  // proceeds. The TTL acts as an automatic cleanup if reveal aborts.
  const acquired = await redis.set(revealLockKey(sessionId), '1', 'EX', 60, 'NX');
  if (acquired !== 'OK') {
    // Another replica is handling reveal; just clear our local timers.
    clearLocal(sessionId);
    return;
  }

  const meta = await loadRoundMeta(redis, sessionId);
  if (!meta) {
    clearLocal(sessionId);
    return;
  }

  const raw = await redis.hgetall(answersKey(sessionId));
  const totals: Record<string, number> = {};
  for (const value of Object.values(raw)) {
    if (value === '1') continue; // unfilled placeholder (shouldn't happen post-validation)
    try {
      const a = JSON.parse(value) as AnswerRecord;
      totals[a.choiceId] = (totals[a.choiceId] ?? 0) + 1;
    } catch {
      // skip malformed
    }
  }

  const top = await prisma.participant.findMany({
    where: { sessionId },
    orderBy: { score: 'desc' },
    take: 10,
    select: { id: true, nickname: true, score: true },
  });

  const payload: QuizReveal = {
    slideId: meta.slideId,
    totals,
    correctChoiceId: meta.correctChoiceId,
    top: top.map<LeaderboardEntry>((p) => ({
      participantId: p.id,
      nickname: p.nickname,
      score: p.score,
    })),
  };

  io.to([audienceRoom(sessionId), presenterRoom(sessionId)]).emit('quiz:revealed', payload);

  await redis.del(roundKey(sessionId), answersKey(sessionId));
  clearLocal(sessionId);
}

export async function disposeQuizState(redis: Redis, sessionId: string): Promise<void> {
  clearLocal(sessionId);
  await redis.del(roundKey(sessionId), answersKey(sessionId), revealLockKey(sessionId));
}
