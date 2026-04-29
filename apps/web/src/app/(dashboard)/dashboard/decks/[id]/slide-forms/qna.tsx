'use client';

interface QnaConfig {
  prompt?: string;
  allowAnonymous?: boolean;
}

export function QnaSlideForm({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const v = value as QnaConfig;
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
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={v.allowAnonymous ?? true}
            onChange={(e) => onChange({ ...value, allowAnonymous: e.target.checked })}
          />
          Allow anonymous questions
        </label>
      </div>
      <div className="flex aspect-video flex-col items-center justify-center gap-3 overflow-hidden rounded-md border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-950">
        <h2 className="text-2xl font-bold">{v.prompt || 'Ask a question'}</h2>
        <p className="text-sm text-slate-500">Audience submits questions; others can upvote.</p>
      </div>
    </div>
  );
}
