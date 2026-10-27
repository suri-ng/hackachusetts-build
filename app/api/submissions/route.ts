import { NextResponse } from 'next/server';
import { isUuid } from '@/lib/domain';
import { DemoOwnershipError, DemoTransitionError } from '@/lib/demo-store';
import { commitBeforeWithFallback, retryHeldWithFallback } from '@/lib/services';
import { ResourceOwnershipError, ReviewTransitionError } from '@/lib/supabase-store';
import { getRequestIdentity } from '@/lib/supabase/server';

export const runtime = 'nodejs';

type CommitBody = { beforeRef?: unknown };

export async function POST(request: Request): Promise<NextResponse> {
  const identity = await getRequestIdentity();
  if (!identity) return NextResponse.json({ error: 'Log in to continue.' }, { status: 401 });

  let body: CommitBody;
  try {
    body = (await request.json()) as CommitBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (
    typeof body.beforeRef !== 'string' ||
    (!body.beforeRef.startsWith('demo://uploads/') &&
      !body.beforeRef.startsWith('supabase://cleanup-photos/'))
  ) {
    return NextResponse.json({ error: 'Upload a before photo first.' }, { status: 400 });
  }

  try {
    return NextResponse.json(await commitBeforeWithFallback(identity, body.beforeRef), {
      status: 201,
    });
  } catch {
    return NextResponse.json(
      { error: 'The before photo could not be retained. Try again.' },
      { status: 400 },
    );
  }
}


type RetryBody = { submissionId?: unknown; reviewId?: unknown };

/** Withdraw an owner-scoped pending review and reopen its after-photo step. */
export async function PATCH(request: Request): Promise<NextResponse> {
  const identity = await getRequestIdentity();
  if (!identity) return NextResponse.json({ error: 'Log in to continue.' }, { status: 401 });

  let body: RetryBody;
  try {
    body = (await request.json()) as RetryBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  if (!isUuid(body.submissionId) || !isUuid(body.reviewId)) {
    return NextResponse.json({ error: 'A valid submission and review are required.' }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await retryHeldWithFallback(identity, body.submissionId, body.reviewId),
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    if (error instanceof ResourceOwnershipError || error instanceof DemoOwnershipError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof ReviewTransitionError || error instanceof DemoTransitionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: 'Review withdrawal is temporarily unavailable.' },
      { status: 503 },
    );
  }
}
