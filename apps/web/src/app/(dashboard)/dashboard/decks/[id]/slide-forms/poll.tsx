'use client';

interface PollChoice {
  id: string;
  text: string;
}

interface PollConfig {
  question?: string;
  choices?: PollChoice[];
  multiSelect?: boolean;
}

function newChoiceId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function PollSlideForm({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const v = value as PollConfig;
  const choices = v.choices ?? [];

  function update(patch: Partial<PollConfig>) {
    onChange({ ...value, ...patch });
  }

  function updateChoice(i: number, patch: Partial<PollChoice>) {
    const next = choices.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
    update({ choices: next });
  }

  function addChoice() {
    if (choices.length >= 10) return;
    update({ choices: [...choices, { id: newChoiceId(), text: '' }] });
  }

  function removeChoice(i: number) {
    if (choices.length <= 2) return;
    update({ choices: choices.filter((_, idx) => idx !== i) });
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
          <span className="text-sm font-medium">Choices</span>
          {choices.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2">
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
            disabled={choices.length >= 10}
            className="self-start rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-slate-700"
          >
            + Add choice
          </button>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!v.multiSelect}
            onChange={(e) => update({ multiSelect: e.target.checked })}
          />
          Allow multi-select
        </label>
      </div>

      <div className="flex aspect-video flex-col items-center justify-center gap-4 overflow-hidden rounded-md border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-950">
        <h2 className="text-2xl font-bold">{v.question || 'Your question'}</h2>
        <ul className="grid w-full max-w-md gap-2">
          {choices.map((c, i) => (
            <li
              key={c.id}
              className="rounded-md border border-slate-200 px-4 py-2 text-left text-base dark:border-slate-700"
            >
              {String.fromCharCode(65 + i)}. {c.text || `Option ${i + 1}`}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
