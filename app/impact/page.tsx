import { ImpactClient } from '@/components/impact-client';
import { campaignWithFallback } from '@/lib/services';
import { requirePageIdentity } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ImpactPage() {
  const identity = await requirePageIdentity();
  return <ImpactClient initialData={await campaignWithFallback(identity)} />;
}
