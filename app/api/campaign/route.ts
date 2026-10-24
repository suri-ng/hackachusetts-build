import { NextResponse } from 'next/server';
import { currentDataMode } from '@/lib/runtime-mode';
import { campaignWithFallback, resetLocalDemo } from '@/lib/services';

export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(await campaignWithFallback(), {
    headers: noStoreHeaders,
  });
}

export async function POST(request: Request): Promise<NextResponse> {
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

  return NextResponse.json(resetLocalDemo(), { headers: noStoreHeaders });
}
