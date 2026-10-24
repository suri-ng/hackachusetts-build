'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { publicSupabaseConfig } from './public-config';

let browserClient: SupabaseClient | null = null;
let browserClientIdentity = '';

export function getBrowserSupabaseClient(): SupabaseClient | null {
  const config = publicSupabaseConfig();
  if (!config) return null;

  const identity = `${config.url}:${config.anonKey.slice(-6)}`;
  if (!browserClient || browserClientIdentity !== identity) {
    browserClient = createBrowserClient(config.url, config.anonKey);
    browserClientIdentity = identity;
  }
  return browserClient;
}
