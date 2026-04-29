'use client';

interface WordCloudConfig {
  prompt?: string;
  maxWordsPerParticipant?: number;
}

export function WordCloudSlideForm({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const v = value as WordCloudConfig;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Prompt
          <input
            value={v.prompt ?? ''}
            onChange={(e) => onChange({ ...value, prompt: e.target.value })}
            className="rounded-md border border-slate-300 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Max words per participant
          <input
            type="number"
            min={1}
            max={5}
            value={v.maxWordsPerParticipant ?? 3}
            onChange={(e) =>
              onChange({ ...value, maxWordsPerParticipant: Number(e.target.value) })
            }
            className="rounded-md border border-slate-300 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
      </div>
      <div className="flex aspect-video flex-col items-center justify-center gap-3 overflow-hidden rounded-md border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-950">
        <h2 className="text-2xl font-bold">{v.prompt || 'One word that describes…'}</h2>
        <div className="flex flex-wrap items-center justify-center gap-3 text-slate-500">
          <span className="text-3xl">excited</span>
          <span className="text-2xl">curious</span>
          <span className="text-xl">tired</span>
          <span className="text-base">hopeful</span>
        </div>
      </div>
    </div>
  );
}
