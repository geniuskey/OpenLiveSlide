import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@openliveslide/db';
import { auth } from '@/auth';
import { DeckEditor } from './editor';

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
    <div className="flex flex-col gap-4">
      <Link href="/dashboard" className="text-sm underline">
        ← Back to decks
      </Link>
      <DeckEditor
        deck={{
          id: deck.id,
          title: deck.title,
          slides: deck.slides.map((s) => ({
            id: s.id,
            order: s.order,
            type: s.type,
            config: s.config as Record<string, unknown>,
          })),
        }}
      />
    </div>
  );
}
