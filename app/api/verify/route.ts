import { NextResponse } from 'next/server';
import { AI_CONSENT_VERSION, isUuid } from '@/lib/domain';
import { DemoOwnershipError, DemoTransitionError } from '@/lib/demo-store';
import { PipelineError } from '@/lib/pipeline';
import { shouldUseLiveStack } from '@/lib/runtime-mode';
import { verifyWithFallback } from '@/lib/services';
import { getRequestIdentity } from '@/lib/supabase/server';
import { ResourceOwnershipError, ReviewTransitionError } from '@/lib/supabase-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type VerifyBody = {
  submissionId?: unknown;
  afterRef?: unknown;
  aiConsent?: unknown;
  aiConsentVersion?: unknown;
};

export async function POST(request: Request): Promise<NextResponse> {
  const identity = await getRequestIdentity();
  if (!identity) return NextResponse.json({ error: 'Log in to continue.' }, { status: 401 });

  let body: VerifyBody;
  try {
    body = (await request.json()) as VerifyBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!isUuid(body.submissionId)) {
    return NextResponse.json({ error: 'A valid submission is required.' }, { status: 400 });
  }
  if (
    typeof body.afterRef !== 'string' ||
    (!body.afterRef.startsWith('demo://') &&
      !body.afterRef.startsWith('supabase://cleanup-photos/'))
  ) {
    return NextResponse.json({ error: 'Upload an after photo first.' }, { status: 400 });
  }

  if (
    body.afterRef.startsWith('supabase://cleanup-photos/') &&
    shouldUseLiveStack() &&
    (body.aiConsent !== true || body.aiConsentVersion !== AI_CONSENT_VERSION)
  ) {
    return NextResponse.json(
      {
        error: 'Agree to the AI photo notice before Claude analyzes your photos.',
        code: 'AI_CONSENT_REQUIRED',
      },
      { status: 428 },
    );
  }

  try {
    const result = await verifyWithFallback(identity, body.submissionId, body.afterRef);
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    if (error instanceof PipelineError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    if (error instanceof DemoOwnershipError || error instanceof ResourceOwnershipError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof DemoTransitionError || error instanceof ReviewTransitionError) {
      return NextResponse.json(
        { error: error.message, code: 'review_conflict' },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: 'Verification is temporarily unavailable. Try again.' },
      { status: 503 },
    );
  }
}
