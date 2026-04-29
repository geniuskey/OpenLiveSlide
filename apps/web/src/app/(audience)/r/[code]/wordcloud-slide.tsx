'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SlideDTO,
  WordCloudAggregate,
} from '@openliveslide/shared';

type AudienceSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface WordCloudConfig {
  prompt: string;
  maxWordsPerParticipant?: number;
}

export function WordCloudSlide({
  slide,
  sessionId,
  socket,
}: {
  slide: SlideDTO;
  sessionId: string;
  socket: AudienceSocket | null;
}) {
  const cfg = slide.config as WordCloudConfig;
  const max = cfg.maxWordsPerParticipant ?? 3;
  const [inputs, setInputs] = useState<string[]>(() => Array(max).fill(''));
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agg, setAgg] = useState<WordCloudAggregate | null>(null);

  useEffect(() => {
    setInputs(Array(max).fill(''));
    setSubmitted(false);
    setError(null);
    setAgg(null);
  }, [slide.id, max]);

  useEffect(() => {
    if (!socket) return;
    const onAgg = (payload: WordCloudAggregate) => {
      if (payload.slideId === slide.id) setAgg(payload);
    };
    socket.on('wordcloud:aggregate', onAgg);
    return () => {
      socket.off('wordcloud:aggregate', onAgg);
    };
  }, [socket, slide.id]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!socket) return;
    const words = inputs.map((w) => w.trim()).filter((w) => w.length > 0);
    if (words.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    socket.emit(
      'audience:respond',
      { sessionId, slideId: slide.id, payload: { words } },
      (res) => {
        setSubmitting(false);
        if (res.ok) setSubmitted(true);
        else setError(res.error);
      },
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <h1 className="text-2xl font-semibold">{cfg.prompt}</h1>
      <form onSubmit={submit} className="flex flex-col gap-2">
        {inputs.map((v, i) => (
          <input
            key={i}
            value={v}
            onChange={(e) =>
              setInputs((prev) => prev.map((x, idx) => (idx === i ? e.target.value : x)))
            }
            maxLength={40}
            placeholder={`Word ${i + 1}${i === 0 ? '' : ' (optional)'}`}
            className="rounded-md border border-slate-300 px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-900"
          />
        ))}
        <button
          type="submit"
          disabled={submitting || inputs.every((v) => !v.trim())}
          className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'Sending…' : submitted ? 'Update' : 'Submit'}
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {submitted && !error ? (
          <p className="text-center text-sm text-emerald-600">Thanks — your words are in.</p>
        ) : null}
      </form>

      {agg && agg.words.length > 0 ? (
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
          {agg.words.slice(0, 30).map((w) => (
            <span
              key={w.word}
              className="text-slate-600 dark:text-slate-300"
              style={{ fontSize: `${Math.min(2, 0.85 + Math.log2(w.count) * 0.25)}rem` }}
            >
              {w.word}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
