import type { AssessorMode, DataMode } from './domain';

const FALLBACK_COOLDOWN_MS = 5 * 60 * 1_000;

interface LiveCircuit {
  disabledUntil: number;
  service: 'supabase' | 'claude' | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __sproutLiveCircuit: LiveCircuit | undefined;
}

function circuit(): LiveCircuit {
  globalThis.__sproutLiveCircuit ??= { disabledUntil: 0, service: null };
  return globalThis.__sproutLiveCircuit;
}

function usableSecret(value: string | undefined): value is string {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return Boolean(
    normalized &&
      !normalized.includes('your-') &&
      !normalized.includes('your_') &&
      !normalized.includes('<') &&
      normalized !== 'changeme',
  );
}

export function supabaseConfig(): { url: string; serviceRoleKey: string } | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!usableSecret(url) || !usableSecret(serviceRoleKey)) return null;
  return { url: url.trim(), serviceRoleKey: serviceRoleKey.trim() };
}

export function claudeConfig(): { apiKey: string; model: string } | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!usableSecret(apiKey)) return null;
  return {
    apiKey: apiKey.trim(),
    model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-5',
  };
}

export function liveStackConfigured(): boolean {
  const dataMode = (process.env.SPROUT_DATA_MODE || 'auto').toLowerCase();
  const aiMode = (process.env.SPROUT_AI_MODE || 'auto').toLowerCase();
  if (dataMode === 'demo' || aiMode === 'seeded') return false;
  return supabaseConfig() !== null && claudeConfig() !== null;
}

export function shouldUseLiveStack(): boolean {
  return liveStackConfigured() && Date.now() >= circuit().disabledUntil;
}

export function configuredAssessorMode(): AssessorMode {
  return shouldUseLiveStack() ? 'claude' : 'seeded';
}

export function currentDataMode(): DataMode {
  if (shouldUseLiveStack()) return 'supabase';
  return liveStackConfigured() ? 'fallback-demo' : 'seeded-demo';
}

export function markLiveServiceFailure(
  service: 'supabase' | 'claude',
  _error?: unknown,
): void {
  globalThis.__sproutLiveCircuit = {
    disabledUntil: Date.now() + FALLBACK_COOLDOWN_MS,
    service,
  };
  // Never include SDK errors here: they can contain URLs or request metadata.
  console.warn(`[Sprout] ${service} unavailable; using local demo mode for five minutes.`);
}

export function clearLiveCircuit(): void {
  globalThis.__sproutLiveCircuit = { disabledUntil: 0, service: null };
}

export function isSupabaseReference(value: string): boolean {
  return value.startsWith('supabase://cleanup-photos/');
}

export function storagePathFromReference(value: string): string {
  if (!isSupabaseReference(value)) {
    throw new Error('Invalid Supabase storage reference.');
  }
  const path = value.slice('supabase://cleanup-photos/'.length);
  if (!path || path.includes('..') || path.startsWith('/')) {
    throw new Error('Unsafe Supabase storage reference.');
  }
  return path;
}

export function referenceForStoragePath(path: string): string {
  return `supabase://cleanup-photos/${path}`;
}
