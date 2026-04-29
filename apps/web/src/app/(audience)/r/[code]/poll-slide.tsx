'use client';

import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SlideDTO,
} from '@openliveslide/shared';

type AudienceSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface PollConfig {
  question: string;
  choices: { id: string; text: string }[];
  multiSelect?: boolean;
}

export function PollSlide({
  slide,
  sessionId,
  socket,
}: {
  slide: SlideDTO;
  sessionId: string;
  socket: AudienceSocket | null;
}) {
  const cfg = slide.config as PollConfig;
  const multi = !!cfg.multiSelect;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submittedFor, setSubmittedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset on slide change
  useEffect(() => {
    setSelected(new Set());
    setSubmittedFor(null);
    setError(null);
    setSubmitting(false);
  }, [slide.id]);

  function toggle(id: string) {
    if (multi) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    } else {
      setSelected(new Set([id]));
    }
  }

  function submit() {
    if (!socket || selected.size === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    socket.emit(
      'audience:respond',
      { sessionId, slideId: slide.id, payload: { choiceIds: Array.from(selected) } },
      (res) => {
        setSubmitting(false);
        if (res.ok) {
          setSubmittedFor(slide.id);
        } else {
          setError(res.error);
        }
      },
    );
  }

  const hasSubmitted = submittedFor === slide.id;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <h1 className="text-2xl font-semibold">{cfg.question}</h1>
      <ul className="flex flex-col gap-2">
        {cfg.choices.map((c, i) => {
          const isSelected = selected.has(c.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => toggle(c.id)}
                className={`w-full rounded-md border px-4 py-3 text-left transition ${
                  isSelected
                    ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                    : 'border-slate-300 hover:border-slate-500 dark:border-slate-700'
                }`}
              >
                <span className="mr-2 font-mono text-xs opacity-60">
                  {String.fromCharCode(65 + i)}
                </span>
                {c.text}
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={submit}
        disabled={selected.size === 0 || submitting}
        className="rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 hover:bg-emerald-700"
      >
        {submitting
          ? 'Sending…'
          : hasSubmitted
            ? multi
              ? 'Update vote'
              : 'Change vote'
            : 'Submit'}
      </button>
      {hasSubmitted && !error ? (
        <p className="text-center text-sm text-emerald-600">Thanks — vote recorded.</p>
      ) : null}
      {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
