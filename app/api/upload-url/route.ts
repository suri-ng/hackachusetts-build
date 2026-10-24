import { NextResponse } from 'next/server';

// POST /api/upload-url — validate intended file type/size, return a Supabase
// signed upload URL. Implemented in Task 7.1 (Req 13.2, 13.3).
export async function POST(): Promise<NextResponse> {
  return NextResponse.json({ error: 'not_implemented' }, { status: 501 });
}
