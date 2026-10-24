import { NextResponse } from 'next/server';
import { commitBeforeWithFallback } from '@/lib/services';

export const runtime = 'nodejs';

type CommitBody = { beforeRef?: unknown };

export async function POST(request: Request): Promise<NextResponse> {
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
    return NextResponse.json(await commitBeforeWithFallback(body.beforeRef), {
      status: 201,
    });
  } catch {
    return NextResponse.json(
      { error: 'The before photo could not be retained. Try again.' },
      { status: 400 },
    );
  }
}
