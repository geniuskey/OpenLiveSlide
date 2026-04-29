import { env } from '@/env';
import { AudienceView } from './audience-view';

export const dynamic = 'force-dynamic';

export default async function AudienceJoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <AudienceView realtimeUrl={env.NEXT_PUBLIC_REALTIME_URL} joinCode={code.toUpperCase()} />;
}
