import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@openliveslide/db';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

export default async function DeckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user.id;

  const deck = await prisma.deck.findFirst({
    where: { id, ownerId: userId },
    include: { slides: { orderBy: { order: 'asc' } } },
  });
  if (!deck) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/dashboard" className="text-sm underline">
        ← Back to decks
      </Link>
      <h1 className="text-2xl font-semibold">{deck.title}</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Slide editor lands in milestone 3. For now, this deck has{' '}
        <strong>{deck.slides.length}</strong> slide{deck.slides.length === 1 ? '' : 's'}.
      </p>
      <ul className="grid gap-2">
        {deck.slides.map((slide) => (
          <li
            key={slide.id}
            className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800"
          >
            #{slide.order + 1} · {slide.type}
          </li>
        ))}
      </ul>
    </div>
  );
}
