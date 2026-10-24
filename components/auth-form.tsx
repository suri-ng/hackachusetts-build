'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  normalizeUsername,
  usernameError,
  usernameToInternalEmail,
} from '@/lib/auth';
import { getBrowserSupabaseClient } from '@/lib/supabase/client';
import { Icon, SproutLogo, SproutMark } from './icons';

type AuthMode = 'login' | 'signup';
type SignupResponse = { ok?: boolean; error?: string };

function safeDestination(value: string): string {
  return value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

export function AuthForm({
  configured,
  nextPath,
}: {
  configured: boolean;
  nextPath: string;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setPassword('');
    setError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeUsername(username);
    const invalidUsername = usernameError(normalized);
    if (invalidUsername) {
      setError(invalidUsername);
      return;
    }
    if (password.length < 8 || password.length > 72) {
      setError('Use a password between 8 and 72 characters.');
      return;
    }

    const supabase = getBrowserSupabaseClient();
    if (!supabase) {
      setError('Supabase Auth is not configured yet.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      if (mode === 'signup') {
        const response = await fetch('/api/auth/sign-up', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: normalized, password }),
        });
        const payload = (await response.json()) as SignupResponse;
        if (!response.ok) throw new Error(payload.error || 'Could not create your account.');
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: usernameToInternalEmail(normalized),
        password,
      });
      if (signInError) {
        throw new Error(
          mode === 'login'
            ? 'That username or password did not match.'
            : 'Your account was created, but sign-in failed. Try logging in.',
        );
      }

      router.replace(safeDestination(nextPath));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Authentication failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <motion.section
        className="auth-card"
        initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 230, damping: 24 }}
      >
        <div className="auth-brand-row">
          <SproutLogo height={39} />
          <span className="auth-secure-pill">
            <Icon name={configured ? 'lock' : 'info'} size={14} />
            {configured ? 'Supabase secured' : 'Setup needed'}
          </span>
        </div>

        <div className="auth-heading">
          <motion.span
            className="auth-sprout-bubble"
            animate={reduceMotion ? undefined : { y: [0, -5, 0], rotate: [-3, 3, -3] }}
            transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
          >
            <SproutMark size={32} />
          </motion.span>
          <span className="eyebrow">YOUR IMPACT, SAVED</span>
          <h1>{mode === 'login' ? 'Welcome back.' : 'Start growing good.'}</h1>
          <p>
            {mode === 'login'
              ? 'Log in to pick up where you left off.'
              : 'Create an account to keep your points and cleanup history.'}
          </p>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Account action">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={mode === 'login' ? 'active' : ''}
            onClick={() => switchMode('login')}
          >
            Log in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            className={mode === 'signup' ? 'active' : ''}
            onClick={() => switchMode('signup')}
          >
            Sign up
          </button>
        </div>

        <form className="auth-form" onSubmit={submit} noValidate>
          <label htmlFor="username">Username</label>
          <div className="auth-input-wrap">
            <Icon name="users" size={19} />
            <input
              id="username"
              name="username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              minLength={3}
              maxLength={24}
              pattern="[A-Za-z0-9_]{3,24}"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="green_helper"
              disabled={!configured || busy}
              required
            />
          </div>
          <p className="auth-field-hint">3–24 letters, numbers, or underscores</p>

          <label htmlFor="password">Password</label>
          <div className="auth-input-wrap">
            <Icon name="lock" size={19} />
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              maxLength={72}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="At least 8 characters"
              disabled={!configured || busy}
              required
            />
            <button
              className="password-toggle"
              type="button"
              onClick={() => setShowPassword((shown) => !shown)}
              disabled={!configured || busy}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>

          {!configured && (
            <div className="auth-setup-note" role="status">
              <Icon name="info" size={18} />
              <span>
                <strong>Connect Supabase to enable accounts.</strong>
                Add the public URL, anon key, and server service-role key to <code>.env.local</code>.
              </span>
            </div>
          )}
          {error && <p className="auth-error" role="alert">{error}</p>}

          <button
            className="button button-primary button-large button-full auth-submit"
            type="submit"
            disabled={!configured || busy}
          >
            {busy ? <span className="button-spinner" /> : <Icon name={mode === 'login' ? 'arrowRight' : 'leaf'} size={19} />}
            {busy ? (mode === 'login' ? 'Logging in…' : 'Creating account…') : (mode === 'login' ? 'Log in to Sprout' : 'Create my account')}
          </button>
          {!configured && <Link className="auth-demo-link" href="/">Continue with the seeded demo</Link>}
        </form>

        <p className="auth-footnote">
          <Icon name="shield" size={15} /> Passwords are handled by Supabase Auth, never stored by Sprout.
        </p>
      </motion.section>

      <aside className="auth-side-note" aria-label="Account benefits">
        <span className="auth-side-icon"><Icon name="trend" size={25} /></span>
        <div><strong>Come back to real progress.</strong><small>Your profile, points, and submissions stay connected to your username.</small></div>
      </aside>
    </main>
  );
}
