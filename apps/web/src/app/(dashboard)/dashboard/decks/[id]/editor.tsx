'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { SlideType } from '@openliveslide/db';
import {
  addSlideAction,
  deleteSlideAction,
  renameDeckTitleAction,
  reorderSlidesAction,
  updateSlideAction,
} from './actions';
import { ContentSlideForm } from './slide-forms/content';
import { PollSlideForm } from './slide-forms/poll';
import { QuizSlideForm } from './slide-forms/quiz';
import { QnaSlideForm } from './slide-forms/qna';
import { WordCloudSlideForm } from './slide-forms/wordcloud';

export interface EditorSlide {
  id: string;
  order: number;
  type: SlideType;
  config: Record<string, unknown>;
}

export interface EditorDeck {
  id: string;
  title: string;
  slides: EditorSlide[];
}

const SLIDE_TYPES: { value: SlideType; label: string; ready: boolean }[] = [
  { value: 'CONTENT', label: 'Content', ready: true },
  { value: 'POLL', label: 'Poll', ready: true },
  { value: 'QUIZ', label: 'Quiz', ready: true },
  { value: 'QNA', label: 'Q&A', ready: true },
  { value: 'WORDCLOUD', label: 'Word Cloud', ready: true },
];

export function DeckEditor({ deck }: { deck: EditorDeck }) {
  const [slides, setSlides] = useState<EditorSlide[]>(deck.slides);
  const [selectedId, setSelectedId] = useState<string | null>(deck.slides[0]?.id ?? null);
  const [title, setTitle] = useState(deck.title);
  const [, startTransition] = useTransition();

  const selected = useMemo(
    () => slides.find((s) => s.id === selectedId) ?? null,
    [slides, selectedId],
  );

  const onAdd = useCallback(
    (type: SlideType) => {
      startTransition(async () => {
        const created = await addSlideAction({ deckId: deck.id, type });
        setSlides((prev) => [...prev, created]);
        setSelectedId(created.id);
      });
    },
    [deck.id],
  );

  const onDelete = useCallback(
    (slideId: string) => {
      if (slides.length <= 1) return;
      startTransition(async () => {
        await deleteSlideAction({ slideId });
        setSlides((prev) => {
          const next = prev.filter((s) => s.id !== slideId).map((s, i) => ({ ...s, order: i }));
          if (selectedId === slideId) setSelectedId(next[0]?.id ?? null);
          return next;
        });
      });
    },
    [slides.length, selectedId],
  );

  const onMove = useCallback(
    (slideId: string, dir: -1 | 1) => {
      setSlides((prev) => {
        const idx = prev.findIndex((s) => s.id === slideId);
        const swap = idx + dir;
        if (idx < 0 || swap < 0 || swap >= prev.length) return prev;
        const next = [...prev];
        [next[idx], next[swap]] = [next[swap]!, next[idx]!];
        const ordered = next.map((s, i) => ({ ...s, order: i }));
        const orderedIds = ordered.map((s) => s.id);
        startTransition(() => {
          reorderSlidesAction({ deckId: deck.id, orderedIds }).catch(() => undefined);
        });
        return ordered;
      });
    },
    [deck.id],
  );

  const onTitleBlur = useCallback(() => {
    if (title.trim() && title !== deck.title) {
      startTransition(() => {
        renameDeckTitleAction({ deckId: deck.id, title }).catch(() => undefined);
      });
    }
  }, [title, deck.id, deck.title]);

  return (
    <div className="grid grid-cols-[260px_1fr] gap-6">
      <aside className="flex flex-col gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={onTitleBlur}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900"
        />

        <ul className="flex flex-col gap-1">
          {slides.map((slide, i) => (
            <li
              key={slide.id}
              className={`flex items-center justify-between rounded-md border px-2 py-2 text-sm ${
                slide.id === selectedId
                  ? 'border-slate-900 bg-slate-100 dark:border-slate-200 dark:bg-slate-800'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <button
                type="button"
                onClick={() => setSelectedId(slide.id)}
                className="flex-1 text-left"
              >
                <span className="font-mono text-xs text-slate-500">#{i + 1}</span>{' '}
                <span>{labelFor(slide)}</span>
              </button>
              <div className="flex items-center gap-1 text-slate-500">
                <button
                  type="button"
                  onClick={() => onMove(slide.id, -1)}
                  disabled={i === 0}
                  className="px-1 disabled:opacity-30"
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => onMove(slide.id, 1)}
                  disabled={i === slides.length - 1}
                  className="px-1 disabled:opacity-30"
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(slide.id)}
                  disabled={slides.length <= 1}
                  className="px-1 text-red-600 disabled:opacity-30"
                  aria-label="Delete slide"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-1 rounded-md border border-dashed border-slate-300 p-2 text-xs dark:border-slate-700">
          <span className="font-medium">Add slide</span>
          <div className="flex flex-wrap gap-1">
            {SLIDE_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => t.ready && onAdd(t.value)}
                disabled={!t.ready}
                title={t.ready ? '' : 'Coming in a later milestone'}
                className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40 dark:border-slate-700"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="rounded-md border border-slate-200 p-6 dark:border-slate-800">
        {selected ? (
          <SlideEditorPanel
            key={selected.id}
            slide={selected}
            onPersist={(config) => {
              setSlides((prev) =>
                prev.map((s) => (s.id === selected.id ? { ...s, config } : s)),
              );
            }}
          />
        ) : (
          <p className="text-slate-500">No slide selected.</p>
        )}
      </main>
    </div>
  );
}

function labelFor(s: EditorSlide): string {
  if (s.type === 'CONTENT') {
    const title = (s.config?.title as string | undefined) ?? '';
    return title.trim() || 'Untitled';
  }
  if (s.type === 'POLL') {
    const q = (s.config?.question as string | undefined) ?? '';
    return q.trim() ? `Poll · ${q.slice(0, 24)}` : 'Poll';
  }
  if (s.type === 'QUIZ') {
    const q = (s.config?.question as string | undefined) ?? '';
    return q.trim() ? `Quiz · ${q.slice(0, 24)}` : 'Quiz';
  }
  return s.type;
}

function SlideEditorPanel({
  slide,
  onPersist,
}: {
  slide: EditorSlide;
  onPersist: (config: Record<string, unknown>) => void;
}) {
  const [config, setConfig] = useState<Record<string, unknown>>(slide.config);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initialRef = useRef(slide.config);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (configEquals(config, initialRef.current)) return;
    timer.current = setTimeout(async () => {
      try {
        await updateSlideAction({ slideId: slide.id, type: slide.type, config });
        initialRef.current = config;
        onPersist(config);
        setSavedAt(Date.now());
      } catch {
        // visible "save error" UX comes in a later milestone
      }
    }, 1500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [config, slide.id, slide.type, onPersist]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between text-sm text-slate-500">
        <span className="font-mono">{slide.type}</span>
        <span>{savedAt ? `Saved ${secondsAgo(savedAt)}s ago` : 'Edits autosave'}</span>
      </header>

      {slide.type === 'CONTENT' ? (
        <ContentSlideForm value={config} onChange={setConfig} />
      ) : slide.type === 'POLL' ? (
        <PollSlideForm value={config} onChange={setConfig} />
      ) : slide.type === 'QUIZ' ? (
        <QuizSlideForm value={config} onChange={setConfig} />
      ) : slide.type === 'QNA' ? (
        <QnaSlideForm value={config} onChange={setConfig} />
      ) : slide.type === 'WORDCLOUD' ? (
        <WordCloudSlideForm value={config} onChange={setConfig} />
      ) : (
        <p className="text-slate-500">Unknown slide type.</p>
      )}
    </div>
  );
}

function configEquals(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function secondsAgo(ts: number): number {
  return Math.max(0, Math.round((Date.now() - ts) / 1000));
}
