import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@openliveslide/shared';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

export function registerHandlers(io: IO): void {
  io.on('connection', (socket) => {
    socket.on('audience:join', async (_payload, cb) => {
      // milestone 5: implement
      cb({ ok: false, error: 'not_implemented' });
    });

    socket.on('audience:respond', async (_payload, cb) => {
      cb({ ok: false, error: 'not_implemented' });
    });

    socket.on('presenter:join', async (_payload, cb) => {
      cb({ ok: false, error: 'not_implemented' });
    });
  });
}
