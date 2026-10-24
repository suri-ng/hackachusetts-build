import { VerifyClient } from '@/components/verify-client';
import { campaignWithFallback } from '@/lib/services';
import { requirePageIdentity } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function VerifyPage({
  searchParams,
}: {
  searchParams?: { fresh?: string; scenario?: string };
}) {
  const identity = await requirePageIdentity();
  const data = await campaignWithFallback(identity);
  const fraudDemo = searchParams?.scenario === 'fraud';
  return (
    <VerifyClient
      data={data}
      startFresh={!fraudDemo && (searchParams?.fresh === '1' || !data.pendingSubmissionId)}
      fraudDemo={fraudDemo}
    />
  );
}
