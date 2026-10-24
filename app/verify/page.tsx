import { VerifyClient } from '@/components/verify-client';
import { campaignWithFallback } from '@/lib/services';

export const dynamic = 'force-dynamic';

export default async function VerifyPage({
  searchParams,
}: {
  searchParams?: { fresh?: string; scenario?: string };
}) {
  const data = await campaignWithFallback();
  const fraudDemo = searchParams?.scenario === 'fraud';
  return (
    <VerifyClient
      data={data}
      startFresh={!fraudDemo && (searchParams?.fresh === '1' || !data.pendingSubmissionId)}
      fraudDemo={fraudDemo}
    />
  );
}
