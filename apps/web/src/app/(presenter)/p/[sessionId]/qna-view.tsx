'use client';

import type { Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  QnaItem,
  ServerToClientEvents,
  SlideDTO,
} from '@openliveslide/shared';

type PresenterSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface QnaConfig {
  prompt: string;
}

export function QnaView({
  slide,
  sessionId,
  joinCode,
  items,
  socket,
}: {
  slide: SlideDTO;
  sessionId: string;
  joinCode: string;
  items: QnaItem[];
  socket: PresenterSocket | null;
}) {
  const cfg = slide.config as QnaConfig;

  const sorted = [...items].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.highlighted !== b.highlighted) return a.highlighted ? -1 : 1;
    if (b.upvotes !== a.upvotes) return b.upvotes - a.upvotes;
    return a.createdAt < b.createdAt ? -1 : 1;
  });

  return (
    <div className="flex w-full max-w-4xl flex-col gap-6">
      <header className="flex items-center justify-between text-sm text-slate-400">
        <span className="font-mono">Code {joinCode}</span>
        <span>{items.length} question{items.length === 1 ? '' : 's'}</span>
      </header>
      <h1 className="text-4xl font-bold">{cfg.prompt}</h1>
      <ul className="flex flex-col gap-2">
        {sorted.map((q) => (
          <li
            key={q.id}
            className={`flex items-start justify-between gap-3 rounded-md border px-4 py-3 ${
              q.highlighted
                ? 'border-amber-400 bg-amber-950/40'
                : q.completed
                  ? 'border-slate-800 bg-slate-900/40 opacity-60 line-through'
                  : 'border-slate-700 bg-slate-900'
            }`}
          >
            <div className="flex-1">
              <p className="text-lg">{q.text}</p>
              <p className="mt-1 text-xs text-slate-500">— {q.nickname}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-md bg-slate-800 px-2 py-1 text-xs">▲ {q.upvotes}</span>
              <button
                type="button"
                onClick={() =>
                  socket?.emit('presenter:qnaHighlight', {
                    sessionId,
                    responseId: q.id,
                    highlighted: !q.highlighted,
                  })
                }
                className={`rounded-md border px-2 py-1 text-xs ${
                  q.highlighted ? 'border-amber-400 text-amber-200' : 'border-slate-700'
                }`}
              >
                {q.highlighted ? 'Unhighlight' : 'Highlight'}
              </button>
              <button
                type="button"
                onClick={() =>
                  socket?.emit('presenter:qnaComplete', {
                    sessionId,
                    responseId: q.id,
                    completed: !q.completed,
                  })
                }
                className="rounded-md border border-slate-700 px-2 py-1 text-xs"
              >
                {q.completed ? 'Reopen' : 'Done'}
              </button>
            </div>
          </li>
        ))}
        {sorted.length === 0 ? (
          <li className="rounded-md border border-dashed border-slate-700 px-4 py-8 text-center text-slate-500">
            Waiting for questions…
          </li>
        ) : null}
      </ul>
    </div>
  );
}
