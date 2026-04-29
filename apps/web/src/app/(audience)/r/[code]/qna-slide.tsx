'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  QnaItem,
  ServerToClientEvents,
  SlideDTO,
} from '@openliveslide/shared';

type AudienceSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface QnaConfig {
  prompt: string;
  allowAnonymous?: boolean;
}

export function QnaSlide({
  slide,
  sessionId,
  socket,
}: {
  slide: SlideDTO;
  sessionId: string;
  socket: AudienceSocket | null;
}) {
  const cfg = slide.config as QnaConfig;
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<QnaItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems([]);
    setError(null);
  }, [slide.id]);

  useEffect(() => {
    if (!socket) return;
    const onItems = (payload: { slideId: string; items: QnaItem[] }) => {
      if (payload.slideId === slide.id) setItems(payload.items);
    };
    socket.on('qna:items', onItems);
    return () => {
      socket.off('qna:items', onItems);
    };
  }, [socket, slide.id]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!socket || !text.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    socket.emit(
      'audience:respond',
      { sessionId, slideId: slide.id, payload: { text: text.trim() } },
      (res) => {
        setSubmitting(false);
        if (res.ok) setText('');
        else setError(res.error);
      },
    );
  }

  function upvote(responseId: string) {
    socket?.emit('qna:upvote', { sessionId, responseId });
  }

  const sorted = [...items].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.highlighted !== b.highlighted) return a.highlighted ? -1 : 1;
    if (b.upvotes !== a.upvotes) return b.upvotes - a.upvotes;
    return a.createdAt < b.createdAt ? -1 : 1;
  });

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <h1 className="text-2xl font-semibold">{cfg.prompt}</h1>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Type your question…"
          className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          type="submit"
          disabled={!text.trim() || submitting}
          className="self-end rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'Sending…' : 'Submit'}
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>

      <ul className="flex flex-col gap-2">
        {sorted.map((q) => (
          <li
            key={q.id}
            className={`rounded-md border px-3 py-2 ${
              q.highlighted
                ? 'border-amber-400 bg-amber-50 dark:bg-amber-950'
                : q.completed
                  ? 'border-slate-300 bg-slate-50 line-through opacity-60 dark:border-slate-700 dark:bg-slate-900'
                  : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <p className="text-sm">{q.text}</p>
                <p className="mt-1 text-xs text-slate-500">— {q.nickname}</p>
              </div>
              <button
                type="button"
                onClick={() => upvote(q.id)}
                disabled={q.completed}
                className="flex shrink-0 items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-30 dark:border-slate-700"
              >
                ▲ {q.upvotes}
              </button>
            </div>
          </li>
        ))}
        {sorted.length === 0 ? (
          <li className="text-center text-sm text-slate-500">
            No questions yet. Be the first to ask!
          </li>
        ) : null}
      </ul>
    </div>
  );
}
