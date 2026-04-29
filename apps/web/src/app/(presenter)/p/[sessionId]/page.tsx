import { notFound, redirect } from 'next/navigation';
import { prisma } from '@openliveslide/db';
import { signPresenterToken } from '@openliveslide/shared';
import { auth } from '@/auth';
import { env } from '@/env';
import { PresenterView } from './presenter-view';

export const dynamic = 'force-dynamic';

export default async function PresenterPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const authSession = await auth();
  if (!authSession?.user?.id) redirect(`/login?callbackUrl=/p/${sessionId}`);

  const session = await prisma.session.findFirst({
    where: { id: sessionId, deck: { ownerId: authSession.user.id } },
    include: {
      deck: {
        include: { slides: { orderBy: { order: 'asc' } } },
      },
    },
  });
  if (!session) notFound();

  const token = await signPresenterToken(
    { sessionId: session.id, userId: authSession.user.id },
    env.PRESENTER_TOKEN_SECRET,
  );

  return (
    <PresenterView
      realtimeUrl={env.NEXT_PUBLIC_REALTIME_URL}
      token={token}
      session={{
        id: session.id,
        joinCode: session.joinCode,
        status: session.status,
        currentSlideId: session.currentSlideId,
      }}
      slides={session.deck.slides.map((s) => ({
        id: s.id,
        order: s.order,
        type: s.type,
        config: s.config as Record<string, unknown>,
      }))}
    />
  );
}
