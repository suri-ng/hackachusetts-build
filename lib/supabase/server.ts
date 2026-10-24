import 'server-only';

import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  DEMO_AUTH_IDENTITY,
  identityFromUser,
  type AuthIdentity,
} from '@/lib/auth';
import { publicSupabaseConfig, supabaseAuthConfigured } from './public-config';

export async function getServerSupabaseClient(): Promise<SupabaseClient | null> {
  const config = publicSupabaseConfig();
  if (!config) return null;

  const cookieStore = await cookies();
  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies. The root proxy refreshes
          // the session before rendering and writes any changed cookies.
        }
      },
    },
  });
}

export async function getCurrentAuthIdentity(): Promise<AuthIdentity | null> {
  const supabase = await getServerSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return identityFromUser(data.user);
}

export async function getRequestIdentity(): Promise<AuthIdentity | null> {
  if (!supabaseAuthConfigured()) return DEMO_AUTH_IDENTITY;
  return getCurrentAuthIdentity();
}

export async function requirePageIdentity(): Promise<AuthIdentity> {
  if (!supabaseAuthConfigured()) return DEMO_AUTH_IDENTITY;
  const identity = await getCurrentAuthIdentity();
  if (!identity) redirect('/login');
  return identity;
}
