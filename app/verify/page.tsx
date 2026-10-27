import { VerifyClient } from '@/components/verify-client';
import { campaignWithFallback } from '@/lib/services';
import { requirePageIdentity } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function VerifyPage({
  searchParams,
}: {
  searchParams?: { fresh?: string; review?: string; scenario?: string };
}) {
  const identity = await requirePageIdentity();
  const data = await campaignWithFallback(identity);
  const fraudDemo = searchParams?.scenario === 'fraud';
  const showReviewStatus = Boolean(
    !fraudDemo &&
    data.reviewStatus?.status === 'pending' &&
    searchParams?.fresh !== '1',
  );
  return (
    <VerifyClient
      data={data}
      startFresh={
        !fraudDemo &&
        !showReviewStatus &&
        (searchParams?.fresh === '1' || !data.pendingSubmissionId)
      }
      fraudDemo={fraudDemo}
      showReviewStatus={showReviewStatus}
    />
  );
}
