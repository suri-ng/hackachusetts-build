import { NextResponse } from 'next/server';
import { currentDataMode } from '@/lib/runtime-mode';
import { campaignWithFallback, resetLocalDemo } from '@/lib/services';
import { getRequestIdentity } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET(): Promise<NextResponse> {
  const identity = await getRequestIdentity();
  if (!identity) return NextResponse.json({ error: 'Log in to continue.' }, { status: 401 });
  return NextResponse.json(await campaignWithFallback(identity), {
    headers: noStoreHeaders,
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const identity = await getRequestIdentity();
  if (!identity) return NextResponse.json({ error: 'Log in to continue.' }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('action' in body) ||
    body.action !== 'reset'
  ) {
    return NextResponse.json({ error: 'Unsupported campaign action.' }, { status: 400 });
  }
  if (currentDataMode() === 'supabase') {
    return NextResponse.json(
      { error: 'Live Supabase data cannot be reset from the public app.' },
      { status: 409 },
    );
  }

  return NextResponse.json(resetLocalDemo(identity), { headers: noStoreHeaders });
}
