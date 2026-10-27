import { NextResponse } from 'next/server';
import { isUuid } from '@/lib/domain';
import {
  approveHeldClaim,
  denyHeldClaim,
  listHeldForReview,
} from '@/lib/demo-store';
import { authorizeReviewer, type ReviewerIdentity } from '@/lib/reviewer-auth';
import { currentDataMode } from '@/lib/runtime-mode';
import {
  listSupabaseHeldClaims,
  LiveIntegrationError,
  resolveSupabaseHeldClaim,
  ReviewTransitionError,
} from '@/lib/supabase-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store, max-age=0' };

type Authorized = { reviewer: ReviewerIdentity; error: null };
type Unauthorized = { reviewer: null; error: NextResponse };

function requireReviewer(request: Request): Authorized | Unauthorized {
  const auth = authorizeReviewer(request);
  if (auth.status === 'authorized') return { reviewer: auth.reviewer, error: null };
  if (auth.status === 'disabled') {
    return {
      reviewer: null,
      error: NextResponse.json(
        { error: 'Human review is not configured.' },
        { status: 503, headers: noStore },
      ),
    };
  }
  return {
    reviewer: null,
    error: NextResponse.json(
      { error: 'Reviewer authorization required.' },
      {
        status: 401,
        headers: { ...noStore, 'WWW-Authenticate': 'Bearer realm="sprout-review"' },
      },
    ),
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  const auth = requireReviewer(request);
  if (auth.error) return auth.error;

  try {
    const held = currentDataMode() === 'supabase'
      ? await listSupabaseHeldClaims()
      : listHeldForReview();
    return NextResponse.json({ held }, { headers: noStore });
  } catch {
    return NextResponse.json(
      { error: 'Held claims are temporarily unavailable.' },
      { status: 503, headers: noStore },
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = requireReviewer(request);
  if (auth.error) return auth.error;

  let body: { action?: unknown; submissionId?: unknown; reviewId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400, headers: noStore });
  }
  if (!isUuid(body.submissionId) || !isUuid(body.reviewId)) {
    return NextResponse.json(
      { error: 'A valid claim id and review id are required.' },
      { status: 400, headers: noStore },
    );
  }
  if (body.action !== 'approve' && body.action !== 'deny') {
    return NextResponse.json(
      { error: 'Review action must be approve or deny.' },
      { status: 400, headers: noStore },
    );
  }

  try {
    const mode = currentDataMode();
    const result = mode === 'supabase'
      ? await resolveSupabaseHeldClaim(
          body.submissionId,
          body.reviewId,
          auth.reviewer.id,
          body.action === 'approve',
        )
      : body.action === 'approve'
        ? await approveHeldClaim(body.submissionId, body.reviewId, auth.reviewer.id, mode)
        : denyHeldClaim(body.submissionId, body.reviewId, auth.reviewer.id);
    return NextResponse.json(result, { headers: noStore });
  } catch (error) {
    if (error instanceof ReviewTransitionError) {
      return NextResponse.json({ error: error.message }, { status: 409, headers: noStore });
    }
    if (error instanceof LiveIntegrationError) {
      return NextResponse.json(
        { error: 'Review storage is temporarily unavailable.' },
        { status: 503, headers: noStore },
      );
    }
    return NextResponse.json(
      { error: 'The claim is no longer pending or could not be resolved.' },
      { status: 409, headers: noStore },
    );
  }
}
