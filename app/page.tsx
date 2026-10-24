import { HomeClient } from '@/components/home-client';
import { campaignWithFallback } from '@/lib/services';
import { requirePageIdentity } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function CampaignHomePage() {
  const identity = await requirePageIdentity();
  return <HomeClient initialData={await campaignWithFallback(identity)} />;
}
