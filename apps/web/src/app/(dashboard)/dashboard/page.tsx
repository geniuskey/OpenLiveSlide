import Link from 'next/link';
import { prisma } from '@openliveslide/db';
import { auth } from '@/auth';
import { createDeckAction, deleteDeckAction, renameDeckAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;

  const decks = await prisma.deck.findMany({
    where: { ownerId: userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      _count: { select: { slides: true } },
    },
  });

  return (
    <div className="flex flex-col gap-8">
      <section className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your decks</h1>
        <form action={createDeckAction} className="flex items-center gap-2">
          <input
            name="title"
            placeholder="Untitled deck"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-slate-900"
          >
            New deck
          </button>
        </form>
      </section>

      {decks.length === 0 ? (
        <p className="text-slate-600 dark:text-slate-400">
          No decks yet. Create your first one above.
        </p>
      ) : (
        <ul className="grid gap-3">
          {decks.map((deck) => (
            <li
              key={deck.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-slate-200 p-4 dark:border-slate-800"
            >
              <div className="flex flex-col gap-1">
                <Link
                  href={`/dashboard/decks/${deck.id}`}
                  className="text-lg font-medium hover:underline"
                >
                  {deck.title}
                </Link>
                <span className="text-xs text-slate-500">
                  {deck._count.slides} slide{deck._count.slides === 1 ? '' : 's'} · updated{' '}
                  {new Date(deck.updatedAt).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <form action={renameDeckAction} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={deck.id} />
                  <input
                    name="title"
                    defaultValue={deck.title}
                    className="rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
                  <button type="submit" className="text-sm underline">
                    Rename
                  </button>
                </form>
                <form action={deleteDeckAction}>
                  <input type="hidden" name="id" value={deck.id} />
                  <button type="submit" className="text-sm text-red-600 underline">
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
