import type { User } from '@supabase/supabase-js';

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 24;
export const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
const INTERNAL_EMAIL_DOMAIN = 'users.sprout.example.com';

export interface AuthIdentity {
  id: string;
  username: string;
  displayName: string;
}

export const DEMO_AUTH_IDENTITY: AuthIdentity = Object.freeze({
  id: '00000000-0000-0000-0000-0000000000a1',
  username: 'alex',
  displayName: 'Alex Morgan',
});

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function usernameError(value: string): string | null {
  const normalized = normalizeUsername(value);
  if (normalized.length < USERNAME_MIN_LENGTH || normalized.length > USERNAME_MAX_LENGTH) {
    return `Use ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} characters.`;
  }
  if (!USERNAME_PATTERN.test(normalized)) {
    return 'Use only lowercase letters, numbers, and underscores.';
  }
  return null;
}

export function displayNameForUsername(username: string): string {
  return username
    .split('_')
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}

export function usernameToInternalEmail(username: string): string {
  const normalized = normalizeUsername(username);
  if (usernameError(normalized)) throw new Error('Invalid username.');
  return `${normalized}@${INTERNAL_EMAIL_DOMAIN}`;
}

export function identityFromUser(user: User): AuthIdentity {
  const metadataUsername = typeof user.user_metadata?.username === 'string'
    ? normalizeUsername(user.user_metadata.username)
    : '';
  const emailUsername = normalizeUsername(user.email?.split('@')[0] ?? '');
  const username = USERNAME_PATTERN.test(metadataUsername)
    ? metadataUsername
    : USERNAME_PATTERN.test(emailUsername)
      ? emailUsername
      : `user_${user.id.replaceAll('-', '').slice(0, 8)}`;
  return {
    id: user.id,
    username,
    displayName: displayNameForUsername(username),
  };
}

export function initialsForIdentity(identity: AuthIdentity): string {
  const initials = identity.displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return initials || identity.username.slice(0, 2).toUpperCase();
}
