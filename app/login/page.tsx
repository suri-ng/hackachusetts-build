import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
import { getCurrentAuthIdentity } from '@/lib/supabase/server';
import { supabaseAuthConfigured } from '@/lib/supabase/public-config';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Log in',
  description: 'Log in or create a Sprout account.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const configured = supabaseAuthConfigured();
  if (configured && await getCurrentAuthIdentity()) redirect('/');

  const params = await searchParams;
  const requestedPath = typeof params.next === 'string' ? params.next : '/';
  const nextPath = requestedPath.startsWith('/') && !requestedPath.startsWith('//')
    ? requestedPath
    : '/';

  return <AuthForm configured={configured} nextPath={nextPath} />;
}
