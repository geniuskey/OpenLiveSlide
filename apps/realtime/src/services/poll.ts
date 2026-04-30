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
import { audienceRoom, presenterRoom } from '../rooms.js';

const countsKey = (slideId: string) => `poll:${slideId}:counts`;
const participantsKey = (slideId: string) => `poll:${slideId}:participants`;
const selectionKey = (slideId: string, participantId: string) =>
  `poll:${slideId}:sel:${participantId}`;

const THROTTLE_MS = 200;

interface ThrottleSlot {
  lastEmit: number;
  pending: NodeJS.Timeout | null;
}
const throttle = new Map<string, ThrottleSlot>();

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

// Lua script for an atomic poll selection swap. Reads the participant's
// prior choices from Redis (not DB), decrements old counts, increments new
// counts, saves the new selection — all in a single round-trip with no
// read-modify-write race across replicas.
const SWAP_SCRIPT = `
local selKey    = KEYS[1]
local countsKey = KEYS[2]
local partKey   = KEYS[3]
local newJson   = ARGV[1]
local partId    = ARGV[2]

local priorRaw = redis.call('GET', selKey)
if priorRaw then
  local prior = cjson.decode(priorRaw)
  for _, choiceId in ipairs(prior) do
    redis.call('HINCRBY', countsKey, choiceId, -1)
  end
end

local incoming = cjson.decode(newJson)
for _, choiceId in ipairs(incoming) do
  redis.call('HINCRBY', countsKey, choiceId, 1)
end

redis.call('SET', selKey, newJson)
redis.call('SADD', partKey, partId)
return 1
` as const;

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

  // Atomically swap the participant's selection in Redis. This is a single
  // round-trip that reads prior choices and applies the diff with no race.
  await redis.eval(
    SWAP_SCRIPT,
    3,
    selectionKey(input.slideId, input.participantId),
    countsKey(input.slideId),
    participantsKey(input.slideId),
    JSON.stringify(incoming),
    input.participantId,
  );

  // Persist to DB for audit trail. We upsert in a single transaction rather
  // than read-then-write to avoid a second read-modify-write race.
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

// Reuses snapshotPollAggregate to avoid duplicating the read-and-format logic.
async function emitAggregate(io: IO, redis: Redis, sessionId: string, slideId: string): Promise<void> {
  const aggregate = await snapshotPollAggregate(redis, slideId);
  io.to([audienceRoom(sessionId), presenterRoom(sessionId)]).emit('poll:aggregate', aggregate);
}

export async function disposePollState(redis: Redis, slideId: string): Promise<void> {
  const slot = throttle.get(slideId);
  if (slot?.pending) clearTimeout(slot.pending);
  throttle.delete(slideId);

  // Remove static keys and scan for per-participant selection keys.
  const keysToDelete: string[] = [countsKey(slideId), participantsKey(slideId)];
  const stream = redis.scanStream({ match: `poll:${slideId}:sel:*`, count: 200 });
  for await (const batch of stream) {
    for (const key of batch as string[]) keysToDelete.push(key);
  }
  if (keysToDelete.length > 0) {
    await redis.del(...keysToDelete);
  }
}
