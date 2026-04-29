'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma, type SlideType } from '@openliveslide/db';
import {
  ContentSlideConfigSchema,
  PollSlideConfigSchema,
  QuizSlideConfigSchema,
  QnaSlideConfigSchema,
  WordCloudSlideConfigSchema,
} from '@openliveslide/shared';
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

async function requireSlideOwnership(slideId: string): Promise<{ userId: string; deckId: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error('UNAUTHORIZED');
  const slide = await prisma.slide.findFirst({
    where: { id: slideId, deck: { ownerId: userId } },
    select: { id: true, deckId: true },
  });
  if (!slide) throw new Error('NOT_FOUND');
  return { userId, deckId: slide.deckId };
}

function defaultConfigFor(type: SlideType): unknown {
  switch (type) {
    case 'CONTENT':
      return { title: 'New slide', body: '' };
    case 'POLL':
      return {
        question: 'Your question',
        choices: [
          { id: 'a', text: 'Option A' },
          { id: 'b', text: 'Option B' },
        ],
        multiSelect: false,
      };
    case 'QUIZ':
      return {
        question: 'Your question',
        choices: [
          { id: 'a', text: 'Option A' },
          { id: 'b', text: 'Option B' },
        ],
        correctChoiceId: 'a',
        timeLimitMs: 20_000,
        pointsBase: 1000,
      };
    case 'QNA':
      return { prompt: 'Ask a question', allowAnonymous: true };
    case 'WORDCLOUD':
      return { prompt: 'One word that describes…', maxWordsPerParticipant: 3 };
  }
}

const SlideTypeEnum = z.enum(['CONTENT', 'POLL', 'QUIZ', 'QNA', 'WORDCLOUD']);

export async function addSlideAction(input: { deckId: string; type: SlideType }) {
  await requireDeckOwnership(input.deckId);
  const type = SlideTypeEnum.parse(input.type);

  const last = await prisma.slide.findFirst({
    where: { deckId: input.deckId },
    orderBy: { order: 'desc' },
    select: { order: true },
  });

  const slide = await prisma.slide.create({
    data: {
      deckId: input.deckId,
      type,
      order: (last?.order ?? -1) + 1,
      config: defaultConfigFor(type) as object,
    },
  });
  await prisma.deck.update({ where: { id: input.deckId }, data: { updatedAt: new Date() } });
  revalidatePath(`/dashboard/decks/${input.deckId}`);
  return { id: slide.id };
}

export async function deleteSlideAction(input: { slideId: string }) {
  const { deckId } = await requireSlideOwnership(input.slideId);
  await prisma.slide.delete({ where: { id: input.slideId } });

  const remaining = await prisma.slide.findMany({
    where: { deckId },
    orderBy: { order: 'asc' },
    select: { id: true },
  });
  await prisma.$transaction(
    remaining.map((s, i) =>
      prisma.slide.update({ where: { id: s.id }, data: { order: i } }),
    ),
  );
  await prisma.deck.update({ where: { id: deckId }, data: { updatedAt: new Date() } });
  revalidatePath(`/dashboard/decks/${deckId}`);
  return { ok: true };
}

export async function reorderSlidesAction(input: { deckId: string; orderedIds: string[] }) {
  await requireDeckOwnership(input.deckId);

  const owned = await prisma.slide.findMany({
    where: { deckId: input.deckId },
    select: { id: true },
  });
  const ownedSet = new Set(owned.map((s) => s.id));
  if (
    input.orderedIds.length !== owned.length ||
    !input.orderedIds.every((id) => ownedSet.has(id))
  ) {
    throw new Error('INVALID_ORDER');
  }

  await prisma.$transaction(
    input.orderedIds.map((id, i) =>
      prisma.slide.update({ where: { id }, data: { order: i } }),
    ),
  );
  await prisma.deck.update({ where: { id: input.deckId }, data: { updatedAt: new Date() } });
  revalidatePath(`/dashboard/decks/${input.deckId}`);
  return { ok: true };
}

export async function updateSlideAction(input: {
  slideId: string;
  type: SlideType;
  config: unknown;
}) {
  const { deckId } = await requireSlideOwnership(input.slideId);
  const type = SlideTypeEnum.parse(input.type);

  let validated: unknown;
  switch (type) {
    case 'CONTENT':
      validated = ContentSlideConfigSchema.parse(input.config);
      break;
    case 'POLL':
      validated = PollSlideConfigSchema.parse(input.config);
      break;
    case 'QUIZ':
      validated = QuizSlideConfigSchema.parse(input.config);
      break;
    case 'QNA':
      validated = QnaSlideConfigSchema.parse(input.config);
      break;
    case 'WORDCLOUD':
      validated = WordCloudSlideConfigSchema.parse(input.config);
      break;
  }

  await prisma.slide.update({
    where: { id: input.slideId },
    data: { config: validated as object },
  });
  await prisma.deck.update({ where: { id: deckId }, data: { updatedAt: new Date() } });
  return { ok: true };
}

export async function renameDeckTitleAction(input: { deckId: string; title: string }) {
  const userId = await requireDeckOwnership(input.deckId);
  const title = z.string().trim().min(1).max(120).parse(input.title);
  await prisma.deck.updateMany({
    where: { id: input.deckId, ownerId: userId },
    data: { title },
  });
  revalidatePath(`/dashboard/decks/${input.deckId}`);
  return { ok: true };
}
