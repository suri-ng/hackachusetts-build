import { MissionContent } from '@/components/mission-content';
import { campaignWithFallback } from '@/lib/services';

export const dynamic = 'force-dynamic';

export default async function MissionDetailPage() {
  return <MissionContent data={await campaignWithFallback()} />;
}
