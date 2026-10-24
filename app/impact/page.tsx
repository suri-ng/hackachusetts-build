import { ImpactClient } from '@/components/impact-client';
import { campaignWithFallback } from '@/lib/services';

export const dynamic = 'force-dynamic';

export default async function ImpactPage() {
  return <ImpactClient initialData={await campaignWithFallback()} />;
}
