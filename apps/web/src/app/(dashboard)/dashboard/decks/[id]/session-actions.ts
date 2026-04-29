'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@openliveslide/db';
import { generateJoinCode } from '@openliveslide/shared';
import { auth } from '@/auth';

async function requireDeckOwnership(deckId: string): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error('UNAUTHORIZED');
  const deck = await prisma.deck.findFirst({
    where: { id: deckId, ownerId: userId },
    select: { id: true },
  });
  if (!deck) throw new Error('NOT_FOUND');
  return userId;
}

export async function startSessionAction(form: FormData) {
  const deckId = z.string().min(1).parse(form.get('deckId'));
  await requireDeckOwnership(deckId);

  // Try a few times to dodge join-code collisions on the unique index.
  let session;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      session = await prisma.session.create({
        data: { deckId, joinCode: generateJoinCode() },
      });
      break;
    } catch {
      if (attempt === 4) throw new Error('Could not allocate join code');
    }
  }

  redirect(`/p/${session!.id}`);
}
