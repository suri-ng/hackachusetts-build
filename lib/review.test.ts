import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { runVerification } from './pipeline';
import {
  approveHeldClaim,
  attachDemoAfter,
  createDemoPipelineDeps,
  createDemoSubmission,
  denyHeldClaim,
  getDemoSnapshot,
  listHeldForReview,
  resetDemoStore,
  retryHeldClaim,
} from './demo-store';
import { DEMO_AUTH_IDENTITY } from './auth';
import { DEMO_IDS } from './demo-data';
import { authorizeReviewer } from './reviewer-auth';
import { verifyWithFallback } from './services';
import { GET as reviewGET, POST as reviewPOST } from '../app/api/review/route';

const originalReviewToken = process.env.SPROUT_REVIEW_TOKEN;
const originalReviewerId = process.env.SPROUT_REVIEWER_ID;
const originalDataMode = process.env.SPROUT_DATA_MODE;

afterEach(() => {
  if (originalReviewToken === undefined) delete process.env.SPROUT_REVIEW_TOKEN;
  else process.env.SPROUT_REVIEW_TOKEN = originalReviewToken;
  if (originalReviewerId === undefined) delete process.env.SPROUT_REVIEWER_ID;
  else process.env.SPROUT_REVIEWER_ID = originalReviewerId;
  if (originalDataMode === undefined) delete process.env.SPROUT_DATA_MODE;
  else process.env.SPROUT_DATA_MODE = originalDataMode;
});

beforeEach(() => {
  resetDemoStore();
});

function currentReviewId(): string {
  const reviewId = listHeldForReview()[0]?.reviewId;
  if (!reviewId) throw new Error('Expected a held review fixture.');
  return reviewId;
}

describe('hold for review — borderline claims', () => {
  it('holds the seeded borderline claim: no points, bar unchanged, state pending_review', async () => {
    const before = getDemoSnapshot().campaign.progress;
    const result = await runVerification(
      { submissionId: DEMO_IDS.reviewSubmission },
      createDemoPipelineDeps(),
    );

    expect(result.outcome).toBe('review');
    expect(result.pass).toBe(false);
    expect(result.pointsAwarded).toBe(0);
    expect(result.couponAwarded).toBe(false);
    expect(result.progress).toBe(before);
    expect(getDemoSnapshot().campaign.progress).toBe(before);

    const held = listHeldForReview();
    expect(result.reviewId).toBe(held[0]?.reviewId);
    expect(held.map((h) => h.id)).toContain(DEMO_IDS.reviewSubmission);
  });

  it('approving a held claim counts it exactly once and moves the bar by one', async () => {
    const before = getDemoSnapshot().campaign.progress;
    await runVerification(
      { submissionId: DEMO_IDS.reviewSubmission },
      createDemoPipelineDeps(),
    );

    const approved = await approveHeldClaim(DEMO_IDS.reviewSubmission, currentReviewId());
    expect(approved.outcome).toBe('pass');
    expect(approved.wasCounted).toBe(true);
    expect(getDemoSnapshot().campaign.progress).toBe(before + 1);

    // No longer in the held queue.
    expect(listHeldForReview().map((h) => h.id)).not.toContain(
      DEMO_IDS.reviewSubmission,
    );
  });

  it('denying a held claim awards nothing and leaves the bar unchanged', async () => {
    const before = getDemoSnapshot().campaign.progress;
    await runVerification(
      { submissionId: DEMO_IDS.reviewSubmission },
      createDemoPipelineDeps(),
    );

    const denied = denyHeldClaim(
      DEMO_IDS.reviewSubmission,
      currentReviewId(),
    );
    expect(denied.decision).toBe('denied');
    expect(denied.pointsAwarded).toBe(0);
    expect(attachDemoAfter(DEMO_IDS.reviewSubmission, 'demo://photos/clearer-after')).toBe(true);
    expect(getDemoSnapshot().campaign.progress).toBe(before);
    expect(listHeldForReview().map((h) => h.id)).not.toContain(
      DEMO_IDS.reviewSubmission,
    );
  });

  it('freezes held evidence until the reviewer or owner resolves it', async () => {
    await runVerification(
      { submissionId: DEMO_IDS.reviewSubmission },
      createDemoPipelineDeps(),
    );

    expect(() =>
      attachDemoAfter(DEMO_IDS.reviewSubmission, 'demo://photos/replacement'),
    ).toThrow(/evidence is frozen/i);
    expect(listHeldForReview()).toHaveLength(1);
  });

  it('repeating an approved decision is idempotent', async () => {
    const before = getDemoSnapshot().campaign.progress;
    await runVerification(
      { submissionId: DEMO_IDS.reviewSubmission },
      createDemoPipelineDeps(),
    );

    const reviewId = currentReviewId();
    const first = await approveHeldClaim(DEMO_IDS.reviewSubmission, reviewId);
    const repeated = await approveHeldClaim(DEMO_IDS.reviewSubmission, reviewId);
    expect(first.wasCounted).toBe(true);
    expect(repeated.wasCounted).toBe(false);
    expect(repeated.pointsAwarded).toBe(0);
    expect(getDemoSnapshot().campaign.progress).toBe(before + 1);
  });

  it('lets the owner withdraw, replace the after photo, and receive a demo pass', async () => {
    await runVerification(
      { submissionId: DEMO_IDS.reviewSubmission },
      createDemoPipelineDeps(),
    );

    expect(
      retryHeldClaim(DEMO_IDS.reviewSubmission, currentReviewId()).state,
    ).toBe('before_committed');
    expect(attachDemoAfter(DEMO_IDS.reviewSubmission, 'demo://photos/clearer-after')).toBe(true);
    const result = await runVerification(
      { submissionId: DEMO_IDS.reviewSubmission },
      createDemoPipelineDeps(),
    );
    expect(result.outcome).toBe('pass');
    expect(result.pointsAwarded).toBeGreaterThan(0);
  });
  it('rejects a stale review id without mutating the held evidence', async () => {
    await runVerification(
      { submissionId: DEMO_IDS.reviewSubmission },
      createDemoPipelineDeps(),
    );
    const held = listHeldForReview()[0];
    await expect(
      approveHeldClaim(DEMO_IDS.reviewSubmission, 'stale-review-id'),
    ).rejects.toThrow();
    expect(listHeldForReview()[0]).toEqual(held);
  });
});

describe('demo verification fails closed', () => {
  it('does not mint a passing fallback for an unknown demo submission', async () => {
    process.env.SPROUT_DATA_MODE = 'demo';
    const before = getDemoSnapshot().campaign.progress;
    await expect(
      verifyWithFallback(
        DEMO_AUTH_IDENTITY,
        '00000000-0000-0000-0000-00000000dead',
        'demo://photos/unknown-after',
      ),
    ).rejects.toThrow(/could not find/i);
    expect(getDemoSnapshot().campaign.progress).toBe(before);
  });

  it('does not replace or reward a pending-review demo submission', async () => {
    process.env.SPROUT_DATA_MODE = 'demo';
    await runVerification(
      { submissionId: DEMO_IDS.reviewSubmission },
      createDemoPipelineDeps(),
    );
    const before = getDemoSnapshot().campaign.progress;
    await expect(
      verifyWithFallback(
        DEMO_AUTH_IDENTITY,
        DEMO_IDS.reviewSubmission,
        'demo://photos/replacement',
      ),
    ).rejects.toThrow(/awaiting review/i);
    expect(getDemoSnapshot().campaign.progress).toBe(before);
    expect(listHeldForReview()).toHaveLength(1);
  });

  it('checks demo ownership before mutating after evidence', async () => {
    process.env.SPROUT_DATA_MODE = 'demo';
    const foreignOwner = '00000000-0000-0000-0000-0000000000f9';
    const submission = createDemoSubmission('demo://uploads/before/foreign', foreignOwner);
    await expect(
      verifyWithFallback(
        DEMO_AUTH_IDENTITY,
        submission.id,
        'demo://photos/foreign-after',
      ),
    ).rejects.toThrow(/does not belong/i);
  });
});


describe('reviewer authorization', () => {
  it('guards the actual operator route before reading or mutating claims', async () => {
    delete process.env.SPROUT_REVIEW_TOKEN;
    const disabled = await reviewGET(new Request('http://localhost/api/review'));
    expect(disabled.status).toBe(503);

    process.env.SPROUT_REVIEW_TOKEN = 'correct-review-token-with-at-least-32-characters';
    const unauthorized = await reviewPOST(new Request('http://localhost/api/review', {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong-review-token-with-at-least-32-characters' },
      body: JSON.stringify({ action: 'approve', submissionId: DEMO_IDS.reviewSubmission }),
    }));
    expect(unauthorized.status).toBe(401);
    expect(listHeldForReview()).toHaveLength(0);
  });

  it('fails closed when the server token is missing or too short', () => {
    delete process.env.SPROUT_REVIEW_TOKEN;
    expect(authorizeReviewer(new Request('http://localhost/api/review')).status).toBe('disabled');
    process.env.SPROUT_REVIEW_TOKEN = 'short';
    expect(authorizeReviewer(new Request('http://localhost/api/review')).status).toBe('disabled');
    process.env.SPROUT_REVIEW_TOKEN = 'replace-with-a-high-entropy-secret';
    expect(authorizeReviewer(new Request('http://localhost/api/review')).status).toBe('disabled');
  });

  it('rejects a wrong bearer token without accepting reviewer identity from input', () => {
    process.env.SPROUT_REVIEW_TOKEN = 'correct-review-token-with-at-least-32-characters';
    const request = new Request('http://localhost/api/review', {
      headers: { Authorization: 'Bearer wrong-review-token-with-at-least-32-characters' },
    });
    expect(authorizeReviewer(request).status).toBe('unauthorized');
  });

  it('accepts the configured token and uses only the server reviewer id', () => {
    const token = 'correct-review-token-with-at-least-32-characters';
    process.env.SPROUT_REVIEW_TOKEN = token;
    process.env.SPROUT_REVIEWER_ID = 'reviewer.ops';
    const result = authorizeReviewer(new Request('http://localhost/api/review', {
      headers: { Authorization: `Bearer ${token}` },
    }));
    expect(result).toEqual({ status: 'authorized', reviewer: { id: 'reviewer.ops' } });
  });

  it('allows an authorized demo decision through the route exactly once', async () => {
    const token = 'correct-review-token-with-at-least-32-characters';
    process.env.SPROUT_REVIEW_TOKEN = token;
    process.env.SPROUT_DATA_MODE = 'demo';
    await runVerification(
      { submissionId: DEMO_IDS.reviewSubmission },
      createDemoPipelineDeps(),
    );
    const before = getDemoSnapshot().campaign.progress;
    const reviewId = currentReviewId();
    const listed = await reviewGET(new Request('http://localhost/api/review', {
      headers: { Authorization: `Bearer ${token}` },
    }));
    expect(listed.status).toBe(200);
    expect((await listed.json()).held[0]).toMatchObject({
      id: DEMO_IDS.reviewSubmission,
      reviewId,
    });
    const request = () => new Request('http://localhost/api/review', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'approve',
        submissionId: DEMO_IDS.reviewSubmission,
        reviewId,
      }),
    });
    const first = await reviewPOST(request());
    const repeated = await reviewPOST(request());
    expect(first.status).toBe(200);
    expect(repeated.status).toBe(200);
    expect(getDemoSnapshot().campaign.progress).toBe(before + 1);
  });
});


describe('review SQL contracts', () => {
  const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  const functions = readFileSync(new URL('../supabase/functions.sql', import.meta.url), 'utf8');
  const seedSql = readFileSync(new URL('../supabase/seed.sql', import.meta.url), 'utf8');
  const seedScript = readFileSync(new URL('../scripts/seed.ts', import.meta.url), 'utf8');

  it('uses paired PostgreSQL dollar-quote delimiters, never a single dollar', () => {
    for (const sql of [schema, functions]) {
      expect(sql).not.toMatch(/\b(?:do|as)\s+\$\s*$/im);
      expect((sql.match(/\$\$/g) ?? []).length % 2).toBe(0);
    }
  });

  it('restricts atomic review functions to service_role', () => {
    expect(functions).toContain('for update;');
    expect(functions).toContain("state = 'pending_review'");
    expect(functions).toContain('grant execute on function resolve_held_claim(uuid,uuid,text,boolean) to service_role;');
    expect(functions).toContain('grant execute on function retry_held_claim(uuid,uuid,uuid) to service_role;');
    expect(functions).toContain('and after_ref = p_after_ref;');
    expect(functions).toContain('and review_id = p_review_id');
    expect(schema).toContain('create table if not exists review_audit');
    expect(functions).toContain('drop function if exists approve_held_claim(uuid);');
    expect(functions).toContain('drop function if exists deny_held_claim(uuid);');
  });

  it('keeps append-only audit compatible with canonical seed resets', () => {
    expect(schema).toContain('submission_id  uuid not null,');
    expect(schema).toContain('drop constraint if exists review_audit_submission_id_fkey');
    expect(seedSql).toContain('delete from submission');
    expect(seedScript).toContain("supabase.from('submission').delete().eq('user_id', DEMO_IDS.user)");
    expect(seedScript).toContain('if (resets.some((result) => result.error))');
  });
});
