import { NextResponse } from 'next/server';

// POST /api/verify — the single server-enforced verification pipeline.
// The ONLY path that can move the funded bar. Implemented in Task 7.2 (Req 4.1).
export async function POST(): Promise<NextResponse> {
  return NextResponse.json({ error: 'not_implemented' }, { status: 501 });
}
