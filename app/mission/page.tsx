import { MissionContent } from '@/components/mission-content';
import { campaignWithFallback } from '@/lib/services';
import { requirePageIdentity } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function MissionDetailPage() {
  const identity = await requirePageIdentity();
  return <MissionContent data={await campaignWithFallback(identity)} />;
}
