'use client';

interface ContentConfig {
  title?: string;
  body?: string;
  imageUrl?: string | null;
}

export function ContentSlideForm({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const v = value as ContentConfig;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Title
          <input
            value={v.title ?? ''}
            onChange={(e) => onChange({ ...value, title: e.target.value })}
            className="rounded-md border border-slate-300 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Body
          <textarea
            rows={8}
            value={v.body ?? ''}
            onChange={(e) => onChange({ ...value, body: e.target.value })}
            className="rounded-md border border-slate-300 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Image URL (optional)
          <input
            value={v.imageUrl ?? ''}
            onChange={(e) =>
              onChange({ ...value, imageUrl: e.target.value.trim() ? e.target.value.trim() : null })
            }
            placeholder="https://…"
            className="rounded-md border border-slate-300 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
      </div>

      <div className="flex aspect-video items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-950">
        <ContentSlidePreview {...v} />
      </div>
    </div>
  );
}

function ContentSlidePreview({ title, body, imageUrl }: ContentConfig) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className="max-h-1/2 max-w-full rounded-md object-contain"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : null}
      {title ? <h1 className="text-3xl font-bold">{title}</h1> : null}
      {body ? (
        <p className="max-w-prose whitespace-pre-wrap text-slate-600 dark:text-slate-400">{body}</p>
      ) : null}
      {!title && !body && !imageUrl ? (
        <p className="text-slate-400">Empty slide — start typing on the left.</p>
      ) : null}
    </div>
  );
}
