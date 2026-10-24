function usablePublicValue(value: string | undefined): value is string {
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

export function publicSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!usablePublicValue(url) || !usablePublicValue(anonKey)) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  } catch {
    return null;
  }

  return { url: url.trim(), anonKey: anonKey.trim() };
}

export function supabaseAuthConfigured(): boolean {
  return publicSupabaseConfig() !== null;
}
