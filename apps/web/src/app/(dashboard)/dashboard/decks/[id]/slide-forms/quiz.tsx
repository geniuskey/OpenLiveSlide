'use client';

interface QuizChoice {
  id: string;
  text: string;
}

interface QuizConfig {
  question?: string;
  choices?: QuizChoice[];
  correctChoiceId?: string;
  timeLimitMs?: number;
  pointsBase?: number;
}

function newChoiceId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function QuizSlideForm({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const v = value as QuizConfig;
  const choices = v.choices ?? [];
  const seconds = Math.round((v.timeLimitMs ?? 20_000) / 1000);

  function update(patch: Partial<QuizConfig>) {
    onChange({ ...value, ...patch });
  }

  function updateChoice(i: number, patch: Partial<QuizChoice>) {
    update({ choices: choices.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) });
  }

  function addChoice() {
    if (choices.length >= 6) return;
    update({ choices: [...choices, { id: newChoiceId(), text: '' }] });
  }

  function removeChoice(i: number) {
    if (choices.length <= 2) return;
    const removed = choices[i]!.id;
    const next = choices.filter((_, idx) => idx !== i);
    update({
      choices: next,
      correctChoiceId: v.correctChoiceId === removed ? next[0]?.id : v.correctChoiceId,
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Question
          <input
            value={v.question ?? ''}
            onChange={(e) => update({ question: e.target.value })}
            className="rounded-md border border-slate-300 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Choices (mark the correct one)</span>
          {choices.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2">
              <input
                type="radio"
                name="correctChoice"
                checked={v.correctChoiceId === c.id}
                onChange={() => update({ correctChoiceId: c.id })}
                aria-label="Mark as correct"
              />
              <input
                value={c.text}
                onChange={(e) => updateChoice(i, { text: e.target.value })}
                placeholder={`Option ${i + 1}`}
                className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
              <button
                type="button"
                onClick={() => removeChoice(i)}
                disabled={choices.length <= 2}
                className="text-sm text-red-600 disabled:opacity-30"
                aria-label="Remove choice"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addChoice}
            disabled={choices.length >= 6}
            className="self-start rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-slate-700"
          >
            + Add choice
          </button>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          Time limit (seconds)
          <input
            type="number"
            min={5}
            max={120}
            value={seconds}
            onChange={(e) => update({ timeLimitMs: Number(e.target.value) * 1000 })}
            className="rounded-md border border-slate-300 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Base points
          <input
            type="number"
            min={0}
            step={100}
            value={v.pointsBase ?? 1000}
            onChange={(e) => update({ pointsBase: Number(e.target.value) })}
            className="rounded-md border border-slate-300 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
      </div>

      <div className="flex aspect-video flex-col items-center justify-center gap-4 overflow-hidden rounded-md border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-950">
        <div className="text-xs uppercase tracking-wider text-slate-500">
          {seconds}s · up to {v.pointsBase ?? 1000} pts
        </div>
        <h2 className="text-2xl font-bold">{v.question || 'Your question'}</h2>
        <ul className="grid w-full max-w-md grid-cols-2 gap-2">
          {choices.map((c, i) => (
            <li
              key={c.id}
              className={`rounded-md border px-3 py-2 text-left text-sm ${
                v.correctChoiceId === c.id
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              {String.fromCharCode(65 + i)}. {c.text || `Option ${i + 1}`}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
