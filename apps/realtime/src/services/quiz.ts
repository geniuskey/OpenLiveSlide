import type { Server, Socket } from 'socket.io';
import { prisma } from '@openliveslide/db';
import {
  QuizResponseSchema,
  QuizSlideConfigSchema,
  type ClientToServerEvents,
  type LeaderboardEntry,
  type QuizReveal,
  type ServerToClientEvents,
} from '@openliveslide/shared';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const audienceRoom = (sessionId: string) => `session:${sessionId}:audience`;
const presenterRoom = (sessionId: string) => `session:${sessionId}:presenter`;

interface AnswerRecord {
  participantId: string;
  choiceId: string;
  elapsedMs: number;
  scoreEarned: number;
  correct: boolean;
}

interface Round {
  sessionId: string;
  slideId: string;
  startedAt: number;
  deadlineAt: number;
  timeLimitMs: number;
  pointsBase: number;
  correctChoiceId: string;
  answers: Map<string, AnswerRecord>; // by participantId
  timer: NodeJS.Timeout | null;
  ended: boolean;
  lastTallyEmit: number;
  pendingTally: NodeJS.Timeout | null;
}

const TALLY_THROTTLE_MS = 200;
const rounds = new Map<string, Round>(); // by sessionId

function computeScore(correct: boolean, elapsedMs: number, timeLimitMs: number, pointsBase: number): number {
  if (!correct) return 0;
  const ratio = Math.min(1, Math.max(0, elapsedMs / timeLimitMs));
  return Math.round(pointsBase * (1 - ratio / 2));
}

export async function startQuizRound(
  io: IO,
  sessionId: string,
  slide: { id: string; config: unknown },
): Promise<void> {
  endRound(io, sessionId, /*reason*/ 'replaced');

  const cfg = QuizSlideConfigSchema.safeParse(slide.config);
  if (!cfg.success) return;

  const startedAt = Date.now();
  const round: Round = {
    sessionId,
    slideId: slide.id,
    startedAt,
    deadlineAt: startedAt + cfg.data.timeLimitMs,
    timeLimitMs: cfg.data.timeLimitMs,
    pointsBase: cfg.data.pointsBase,
    correctChoiceId: cfg.data.correctChoiceId,
    answers: new Map(),
    timer: null,
    ended: false,
    lastTallyEmit: 0,
    pendingTally: null,
  };
  rounds.set(sessionId, round);

  round.timer = setTimeout(() => {
    void revealRound(io, sessionId).catch(() => undefined);
  }, cfg.data.timeLimitMs);
}

export function endRound(io: IO, sessionId: string, reason: 'replaced' | 'session_ended'): void {
  const round = rounds.get(sessionId);
  if (!round) return;
  if (round.timer) clearTimeout(round.timer);
  if (round.pendingTally) clearTimeout(round.pendingTally);
  if (!round.ended) {
    // Always reveal so audience sees their score, regardless of cause.
    void revealRound(io, sessionId).catch(() => undefined);
    return;
  }
  rounds.delete(sessionId);
  void reason; // intentionally unused now that both paths reveal
}

export function getActiveSlideId(sessionId: string): string | null {
  return rounds.get(sessionId)?.slideId ?? null;
}

export async function recordQuizAnswer(
  io: IO,
  socket: IOSocket,
  input: {
    sessionId: string;
    slideId: string;
    participantId: string;
    payload: unknown;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const round = rounds.get(input.sessionId);
  if (!round || round.ended) return { ok: false, error: 'no_active_round' };
  if (round.slideId !== input.slideId) return { ok: false, error: 'slide_not_active' };
  if (Date.now() > round.deadlineAt) return { ok: false, error: 'time_expired' };
  if (round.answers.has(input.participantId)) return { ok: false, error: 'already_answered' };

  const parsed = QuizResponseSchema.safeParse(input.payload);
  if (!parsed.success) return { ok: false, error: 'invalid_payload' };

  // Trust server clock for elapsed; the client-supplied value is ignored to
  // prevent score manipulation.
  const elapsedMs = Math.max(0, Date.now() - round.startedAt);
  const correct = parsed.data.choiceId === round.correctChoiceId;
  const scoreEarned = computeScore(correct, elapsedMs, round.timeLimitMs, round.pointsBase);

  // Validate the choice is one of the slide's choices.
  const slide = await prisma.slide.findUnique({ where: { id: input.slideId } });
  if (!slide) return { ok: false, error: 'slide_not_found' };
  const slideCfg = QuizSlideConfigSchema.safeParse(slide.config);
  if (!slideCfg.success) return { ok: false, error: 'invalid_slide_config' };
  if (!slideCfg.data.choices.some((c) => c.id === parsed.data.choiceId)) {
    return { ok: false, error: 'invalid_choice' };
  }

  const record: AnswerRecord = {
    participantId: input.participantId,
    choiceId: parsed.data.choiceId,
    elapsedMs,
    scoreEarned,
    correct,
  };
  round.answers.set(input.participantId, record);

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

  scheduleTally(io, input.sessionId);
  return { ok: true };
}

function scheduleTally(io: IO, sessionId: string): void {
  const round = rounds.get(sessionId);
  if (!round || round.ended) return;
  const now = Date.now();
  const dueIn = Math.max(0, round.lastTallyEmit + TALLY_THROTTLE_MS - now);
  if (dueIn === 0) {
    round.lastTallyEmit = now;
    emitTally(io, round);
    return;
  }
  if (round.pendingTally) return;
  round.pendingTally = setTimeout(() => {
    const r = rounds.get(sessionId);
    if (!r || r.ended) return;
    r.pendingTally = null;
    r.lastTallyEmit = Date.now();
    emitTally(io, r);
  }, dueIn);
}

function emitTally(io: IO, round: Round): void {
  io.to([audienceRoom(round.sessionId), presenterRoom(round.sessionId)]).emit('quiz:tally', {
    slideId: round.slideId,
    answeredCount: round.answers.size,
  });
}

async function revealRound(io: IO, sessionId: string): Promise<void> {
  const round = rounds.get(sessionId);
  if (!round || round.ended) return;
  round.ended = true;
  if (round.timer) clearTimeout(round.timer);
  if (round.pendingTally) clearTimeout(round.pendingTally);

  const totals: Record<string, number> = {};
  for (const a of round.answers.values()) {
    totals[a.choiceId] = (totals[a.choiceId] ?? 0) + 1;
  }

  const top = await prisma.participant.findMany({
    where: { sessionId },
    orderBy: { score: 'desc' },
    take: 10,
    select: { id: true, nickname: true, score: true },
  });

  const payload: QuizReveal = {
    slideId: round.slideId,
    totals,
    correctChoiceId: round.correctChoiceId,
    top: top.map<LeaderboardEntry>((p) => ({
      participantId: p.id,
      nickname: p.nickname,
      score: p.score,
    })),
  };

  io.to([audienceRoom(sessionId), presenterRoom(sessionId)]).emit('quiz:revealed', payload);
  rounds.delete(sessionId);
}
