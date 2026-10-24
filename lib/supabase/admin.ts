import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseConfig } from '@/lib/runtime-mode';

let adminClient: SupabaseClient | null = null;
let adminClientIdentity = '';

export function getSupabaseAdminClient(): SupabaseClient {
  const config = supabaseConfig();
  if (!config) throw new Error('Supabase server credentials are not configured.');

  const identity = `${config.url}:${config.serviceRoleKey.slice(-6)}`;
  if (!adminClient || adminClientIdentity !== identity) {
    adminClient = createClient(config.url, config.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    adminClientIdentity = identity;
  }
  return adminClient;
}
