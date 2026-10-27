import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';

export interface ReviewerIdentity {
  id: string;
}

export type ReviewerAuthResult =
  | { status: 'authorized'; reviewer: ReviewerIdentity }
  | { status: 'disabled' }
  | { status: 'unauthorized' };

const MIN_REVIEW_TOKEN_LENGTH = 32;
const DEFAULT_REVIEWER_ID = 'sprout-reviewer';

function configuredToken(): string | null {
  const token = process.env.SPROUT_REVIEW_TOKEN?.trim();
  if (!token || token.length < MIN_REVIEW_TOKEN_LENGTH) return null;
  const normalized = token.toLowerCase();
  if (
    normalized.includes('your-') ||
    normalized.includes('your_') ||
    normalized.includes('changeme') ||
    normalized.includes('replace-with') ||
    normalized.includes('example') ||
    normalized.includes('<')
  ) {
    return null;
  }
  return token;
}

function reviewerId(): string {
  const configured = process.env.SPROUT_REVIEWER_ID?.trim();
  if (!configured || !/^[a-zA-Z0-9._@-]{1,80}$/.test(configured)) {
    return DEFAULT_REVIEWER_ID;
  }
  return configured;
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function authorizeReviewer(request: Request): ReviewerAuthResult {
  const expected = configuredToken();
  if (!expected) return { status: 'disabled' };

  const authorization = request.headers.get('authorization');
  const supplied = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!supplied || !timingSafeEqual(digest(supplied), digest(expected))) {
    return { status: 'unauthorized' };
  }

  return { status: 'authorized', reviewer: { id: reviewerId() } };
}
