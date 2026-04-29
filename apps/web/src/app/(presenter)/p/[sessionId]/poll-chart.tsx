'use client';

import type { PollAggregate, SlideDTO } from '@openliveslide/shared';

interface PollConfig {
  question: string;
  choices: { id: string; text: string }[];
  multiSelect?: boolean;
}

export function PollChart({
  slide,
  aggregate,
  joinCode,
}: {
  slide: SlideDTO;
  aggregate: PollAggregate | null;
  joinCode: string;
}) {
  const cfg = slide.config as PollConfig;
  const totals = aggregate?.totals ?? {};
  const max = Math.max(1, ...Object.values(totals));
  const totalResponses = aggregate?.totalResponses ?? 0;

  return (
    <div className="flex w-full max-w-4xl flex-col gap-6">
      <header className="flex items-center justify-between text-sm text-slate-400">
        <span className="font-mono">Code {joinCode}</span>
        <span>{totalResponses} response{totalResponses === 1 ? '' : 's'}</span>
      </header>
      <h1 className="text-5xl font-bold">{cfg.question}</h1>
      <ul className="flex flex-col gap-3">
        {cfg.choices.map((c, i) => {
          const count = totals[c.id] ?? 0;
          const widthPct = (count / max) * 100;
          const sharePct = totalResponses > 0 ? Math.round((count / totalResponses) * 100) : 0;
          return (
            <li
              key={c.id}
              className="relative overflow-hidden rounded-md border border-slate-700 bg-slate-900"
            >
              <div
                className="absolute inset-y-0 left-0 bg-emerald-700/40 transition-[width] duration-300"
                style={{ width: `${widthPct}%` }}
              />
              <div className="relative flex items-center justify-between px-4 py-4 text-lg">
                <span>
                  <span className="mr-3 font-mono text-sm text-slate-400">
                    {String.fromCharCode(65 + i)}
                  </span>
                  {c.text}
                </span>
                <span className="font-mono text-base text-slate-200">
                  {count} · {sharePct}%
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
