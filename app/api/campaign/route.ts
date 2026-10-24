import { NextResponse } from 'next/server';

// GET /api/campaign — campaign state + latest-verified feed for Home/Impact.
// Implemented in Task 7.3 (Req 2.2, 17.2, 17.3).
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: 'not_implemented' }, { status: 501 });
}
