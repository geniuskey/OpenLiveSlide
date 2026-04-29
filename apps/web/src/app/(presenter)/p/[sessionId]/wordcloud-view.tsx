'use client';

import type { SlideDTO, WordCloudAggregate } from '@openliveslide/shared';

interface WordCloudConfig {
  prompt: string;
}

export function WordCloudView({
  slide,
  aggregate,
  joinCode,
}: {
  slide: SlideDTO;
  aggregate: WordCloudAggregate | null;
  joinCode: string;
}) {
  const cfg = slide.config as WordCloudConfig;
  const words = aggregate?.slideId === slide.id ? aggregate.words : [];
  const max = Math.max(1, ...words.map((w) => w.count));

  return (
    <div className="flex w-full max-w-5xl flex-col gap-6 text-center">
      <header className="flex items-center justify-between text-sm text-slate-400">
        <span className="font-mono">Code {joinCode}</span>
        <span>{words.reduce((a, b) => a + b.count, 0)} submissions</span>
      </header>
      <h1 className="text-4xl font-bold">{cfg.prompt}</h1>
      <div className="flex min-h-[40vh] flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-md border border-slate-700 bg-slate-900 p-8">
        {words.length === 0 ? (
          <p className="text-slate-500">Waiting for words…</p>
        ) : (
          words.map((w) => (
            <span
              key={w.word}
              className="text-slate-100"
              style={{
                fontSize: `${(w.count / max) * 4 + 1}rem`,
                opacity: 0.55 + 0.45 * (w.count / max),
              }}
            >
              {w.word}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
