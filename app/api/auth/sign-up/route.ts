import { NextResponse } from 'next/server';
import {
  displayNameForUsername,
  initialsForIdentity,
  normalizeUsername,
  usernameError,
  usernameToInternalEmail,
} from '@/lib/auth';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { publicSupabaseConfig } from '@/lib/supabase/public-config';
import { supabaseConfig } from '@/lib/runtime-mode';

export const runtime = 'nodejs';

const WINDOW_MS = 10 * 60 * 1_000;
const MAX_ATTEMPTS = 6;

declare global {
  // eslint-disable-next-line no-var
  var __sproutSignupAttempts: Map<string, number[]> | undefined;
}

function allowSignup(request: Request): boolean {
  globalThis.__sproutSignupAttempts ??= new Map();
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const key = (forwarded || request.headers.get('x-real-ip') || 'local').slice(0, 100);
  const cutoff = Date.now() - WINDOW_MS;
  const recent = (globalThis.__sproutSignupAttempts.get(key) ?? [])
    .filter((timestamp) => timestamp >= cutoff);
  if (recent.length >= MAX_ATTEMPTS) return false;
  recent.push(Date.now());
  globalThis.__sproutSignupAttempts.set(key, recent);
  return true;
}

export async function POST(request: Request): Promise<NextResponse> {
  const publicConfig = publicSupabaseConfig();
  const serverConfig = supabaseConfig();
  if (
    !publicConfig ||
    !serverConfig ||
    publicConfig.url.replace(/\/$/, '') !== serverConfig.url.replace(/\/$/, '')
  ) {
    return NextResponse.json(
      { error: 'Supabase account creation is not configured on this server.' },
      { status: 503 },
    );
  }
  if (!allowSignup(request)) {
    return NextResponse.json(
      { error: 'Too many sign-up attempts. Wait a few minutes and try again.' },
      { status: 429 },
    );
  }
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > 2_048) {
    return NextResponse.json({ error: 'Account details are too large.' }, { status: 413 });
  }

  let body: { username?: unknown; password?: unknown };
  try {
    body = await request.json() as { username?: unknown; password?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid account details.' }, { status: 400 });
  }

  if (typeof body.username !== 'string' || typeof body.password !== 'string') {
    return NextResponse.json({ error: 'Enter a username and password.' }, { status: 400 });
  }

  const username = normalizeUsername(body.username);
  const invalidUsername = usernameError(username);
  if (invalidUsername) {
    return NextResponse.json({ error: invalidUsername }, { status: 400 });
  }
  if (body.password.length < 8 || body.password.length > 72) {
    return NextResponse.json(
      { error: 'Use a password between 8 and 72 characters.' },
      { status: 400 },
    );
  }

  const displayName = displayNameForUsername(username);
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: usernameToInternalEmail(username),
    password: body.password,
    email_confirm: true,
    user_metadata: { username, display_name: displayName },
  });

  if (error || !data.user) {
    return NextResponse.json(
      { error: 'That username is unavailable, or the account could not be created.' },
      { status: 409 },
    );
  }

  const identity = { id: data.user.id, username, displayName };
  const { error: profileError } = await admin.from('demo_user').upsert(
    {
      id: identity.id,
      auth_user_id: identity.id,
      username,
      display_name: displayName,
      first_name: displayName.split(' ')[0] || username,
      initials: initialsForIdentity(identity),
      verified_count: 0,
      points_balance: 0,
      actions_completed: 0,
      coupon_awarded: false,
    },
    { onConflict: 'id' },
  );

  if (profileError) {
    await admin.from('demo_user').delete().eq('id', data.user.id);
    await admin.auth.admin.deleteUser(data.user.id);
    return NextResponse.json(
      { error: 'Account storage is not ready. Apply the latest Supabase schema and try again.' },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
