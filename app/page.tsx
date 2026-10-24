import { HomeClient } from '@/components/home-client';
import { campaignWithFallback } from '@/lib/services';

export const dynamic = 'force-dynamic';

export default async function CampaignHomePage() {
  return <HomeClient initialData={await campaignWithFallback()} />;
}
