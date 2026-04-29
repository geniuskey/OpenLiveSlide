'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@openliveslide/db';
import { auth } from '@/auth';

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('UNAUTHORIZED');
  return session.user.id;
}

export async function createDeckAction(form: FormData) {
  const userId = await requireUserId();
  const title = z
    .string()
    .trim()
    .min(1)
    .max(120)
    .parse(form.get('title') ?? 'Untitled deck');

  const deck = await prisma.deck.create({
    data: {
      ownerId: userId,
      title,
      slides: {
        create: {
          order: 0,
          type: 'CONTENT',
          config: { title: 'Welcome', body: '' },
        },
      },
    },
  });

  redirect(`/dashboard/decks/${deck.id}`);
}

export async function renameDeckAction(form: FormData) {
  const userId = await requireUserId();
  const id = z.string().min(1).parse(form.get('id'));
  const title = z.string().trim().min(1).max(120).parse(form.get('title'));

  await prisma.deck.updateMany({
    where: { id, ownerId: userId },
    data: { title },
  });
  revalidatePath('/dashboard');
}

export async function deleteDeckAction(form: FormData) {
  const userId = await requireUserId();
  const id = z.string().min(1).parse(form.get('id'));

  await prisma.deck.deleteMany({ where: { id, ownerId: userId } });
  revalidatePath('/dashboard');
}
