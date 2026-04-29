'use client';

import { useEffect, useState } from 'react';
import type { QuizReveal, QuizTally, SlideDTO } from '@openliveslide/shared';

interface QuizConfig {
  question: string;
  choices: { id: string; text: string }[];
  correctChoiceId: string;
  timeLimitMs: number;
  pointsBase: number;
}

export function QuizView({
  slide,
  startedAt,
  tally,
  reveal,
  joinCode,
}: {
  slide: SlideDTO;
  startedAt: number;
  tally: QuizTally | null;
  reveal: QuizReveal | null;
  joinCode: string;
}) {
  const cfg = slide.config as QuizConfig;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  const remainingMs = Math.max(0, startedAt + cfg.timeLimitMs - now);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const answeredCount = tally?.slideId === slide.id ? tally.answeredCount : 0;
  const ended = !!reveal && reveal.slideId === slide.id;

  if (ended && reveal) {
    const totalAnswers = Object.values(reveal.totals).reduce((a, b) => a + b, 0);
    const max = Math.max(1, ...Object.values(reveal.totals));
    return (
      <div className="flex w-full max-w-5xl flex-col gap-6">
        <header className="flex items-center justify-between text-sm text-slate-400">
          <span className="font-mono">Code {joinCode}</span>
          <span>{totalAnswers} answered</span>
        </header>
        <h1 className="text-4xl font-bold">{cfg.question}</h1>
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {cfg.choices.map((c, i) => {
            const count = reveal.totals[c.id] ?? 0;
            const widthPct = (count / max) * 100;
            const isCorrect = c.id === reveal.correctChoiceId;
            return (
              <li
                key={c.id}
                className={`relative overflow-hidden rounded-md border ${
                  isCorrect ? 'border-emerald-500' : 'border-slate-700'
                } bg-slate-900`}
              >
                <div
                  className={`absolute inset-y-0 left-0 transition-[width] duration-300 ${
                    isCorrect ? 'bg-emerald-700/60' : 'bg-slate-700/40'
                  }`}
                  style={{ width: `${widthPct}%` }}
                />
                <div className="relative flex items-center justify-between px-4 py-3">
                  <span>
                    <span className="mr-2 font-mono text-xs text-slate-400">
                      {String.fromCharCode(65 + i)}
                    </span>
                    {c.text}
                    {isCorrect ? (
                      <span className="ml-2 text-xs uppercase tracking-wider text-emerald-400">
                        correct
                      </span>
                    ) : null}
                  </span>
                  <span className="font-mono text-base text-slate-200">{count}</span>
                </div>
              </li>
            );
          })}
        </ul>

        <section className="mt-2 rounded-md border border-slate-700 p-4">
          <h2 className="mb-2 text-sm uppercase tracking-wider text-slate-400">Leaderboard</h2>
          {reveal.top.length === 0 ? (
            <p className="text-slate-500">No participants yet.</p>
          ) : (
            <ol className="flex flex-col gap-1 text-base">
              {reveal.top.map((entry, i) => (
                <li
                  key={entry.participantId}
                  className="flex items-center justify-between rounded px-2 py-1"
                >
                  <span>
                    <span className="mr-3 font-mono text-slate-400">{i + 1}.</span>
                    {entry.nickname}
                  </span>
                  <span className="font-mono">{entry.score}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-5xl flex-col items-center gap-8 text-center">
      <header className="flex w-full items-center justify-between text-sm text-slate-400">
        <span className="font-mono">Code {joinCode}</span>
        <span className={remainingSec <= 5 ? 'text-red-400' : ''}>{remainingSec}s</span>
      </header>
      <h1 className="text-5xl font-bold">{cfg.question}</h1>
      <ul className="grid w-full grid-cols-1 gap-3 md:grid-cols-2">
        {cfg.choices.map((c, i) => (
          <li
            key={c.id}
            className="rounded-md border border-slate-700 bg-slate-900 px-4 py-4 text-left text-xl"
          >
            <span className="mr-2 font-mono text-sm text-slate-400">
              {String.fromCharCode(65 + i)}
            </span>
            {c.text}
          </li>
        ))}
      </ul>
      <p className="text-2xl text-slate-300">{answeredCount} answered</p>
    </div>
  );
}
