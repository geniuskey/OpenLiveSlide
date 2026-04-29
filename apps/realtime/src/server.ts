import Fastify from 'fastify';
import { Server as IOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { ClientToServerEvents, ServerToClientEvents } from '@openliveslide/shared';

import { env } from './env.js';
import { registerHandlers } from './handlers/index.js';

async function main() {
  const app = Fastify({ logger: true });

  app.get('/healthz', async () => ({ ok: true }));

  await app.listen({ port: env.PORT, host: '0.0.0.0' });

  const io = new IOServer<ClientToServerEvents, ServerToClientEvents>(app.server, {
    cors: { origin: env.WEB_ORIGIN, credentials: true },
  });

  const pubClient = new Redis(env.REDIS_URL);
  const subClient = pubClient.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

  registerHandlers(io, pubClient);

  app.log.info(`socket.io listening on :${env.PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
