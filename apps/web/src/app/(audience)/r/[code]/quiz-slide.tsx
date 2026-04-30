'use client';

import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  QuizReveal,
  QuizScoreFeedback,
  ServerToClientEvents,
  SlideDTO,
} from '@openliveslide/shared';

type AudienceSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface QuizConfig {
  question: string;
  choices: { id: string; text: string }[];
  correctChoiceId: string;
  timeLimitMs: number;
  pointsBase: number;
}

interface Props {
  slide: SlideDTO;
  sessionId: string;
  startedAt: number;
  socket: AudienceSocket | null;
}

export function QuizSlide({ slide, sessionId, startedAt, socket }: Props) {
  const cfg = slide.config as QuizConfig;
  const [now, setNow] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [answeredId, setAnsweredId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<QuizScoreFeedback | null>(null);
  const [reveal, setReveal] = useState<QuizReveal | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAnsweredId(null);
    setFeedback(null);
    setReveal(null);
    setError(null);
    setSubmitting(false);
  }, [slide.id]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onScore = (f: QuizScoreFeedback) => {
      if (f.slideId === slide.id) setFeedback(f);
    };
    const onReveal = (r: QuizReveal) => {
      if (r.slideId === slide.id) setReveal(r);
    };
    socket.on('quiz:score', onScore);
    socket.on('quiz:revealed', onReveal);
    return () => {
      socket.off('quiz:score', onScore);
      socket.off('quiz:revealed', onReveal);
    };
  }, [socket, slide.id]);

  const remainingMs = Math.max(0, startedAt + cfg.timeLimitMs - now);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const expired = remainingMs <= 0;

  function submit(choiceId: string) {
    if (!socket || answeredId || submitting || expired) return;
    setAnsweredId(choiceId);
    setSubmitting(true);
    setError(null);
    socket.emit(
      'audience:respond',
      { sessionId, slideId: slide.id, payload: { choiceId } },
      (res) => {
        setSubmitting(false);
        if (!res.ok) {
          setError(res.error);
          setAnsweredId(null);
        }
      },
    );
  }

  if (reveal) {
    const correct = answeredId === reveal.correctChoiceId;
    const correctChoice = cfg.choices.find((c) => c.id === reveal.correctChoiceId);
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-3 text-center">
        <p
          className={`text-3xl font-bold ${
            answeredId == null ? 'text-slate-500' : correct ? 'text-emerald-600' : 'text-red-600'
          }`}
        >
          {answeredId == null ? 'No answer' : correct ? 'Correct!' : 'Wrong'}
        </p>
        <p className="text-sm text-slate-500">
          Answer: <strong>{correctChoice?.text ?? '—'}</strong>
        </p>
        {feedback ? (
          <p className="text-sm">
            +{feedback.scoreEarned} points · total {feedback.totalScore}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-mono text-slate-500">Quiz</span>
        <span className={`font-mono ${remainingSec <= 5 ? 'text-red-500' : 'text-slate-500'}`}>
          {remainingSec}s
        </span>
      </div>
      <h1 className="text-2xl font-semibold">{cfg.question}</h1>
      <ul className="grid grid-cols-1 gap-2">
        {cfg.choices.map((c, i) => {
          const isAnswered = answeredId === c.id;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => submit(c.id)}
                disabled={!!answeredId || submitting || expired}
                className={`w-full rounded-md border px-4 py-3 text-left transition disabled:opacity-50 ${
                  isAnswered
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
      {answeredId && !error ? (
        <p className="text-center text-sm text-slate-500">Locked in. Waiting for results…</p>
      ) : null}
      {expired && !answeredId ? (
        <p className="text-center text-sm text-slate-500">Time's up.</p>
      ) : null}
      {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
