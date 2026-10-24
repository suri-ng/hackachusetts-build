import { NextResponse } from 'next/server';
import { PipelineError } from '@/lib/pipeline';
import { verifyWithFallback } from '@/lib/services';
import { getRequestIdentity } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type VerifyBody = {
  submissionId?: unknown;
  afterRef?: unknown;
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

  if (typeof body.submissionId !== 'string' || body.submissionId.length < 8) {
    return NextResponse.json({ error: 'A valid submission is required.' }, { status: 400 });
  }
  if (
    typeof body.afterRef !== 'string' ||
    (!body.afterRef.startsWith('demo://') &&
      !body.afterRef.startsWith('supabase://cleanup-photos/'))
  ) {
    return NextResponse.json({ error: 'Upload an after photo first.' }, { status: 400 });
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
    return NextResponse.json(
      { error: 'Verification could not finish. Try again.' },
      { status: 400 },
    );
  }
}
