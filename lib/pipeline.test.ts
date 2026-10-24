import { describe, it, expect, beforeEach } from 'vitest';
import { runVerification, PipelineError } from './pipeline';
import type { PipelineDeps } from './pipeline';
import {
  createDemoPipelineDeps,
  getDemoSnapshot,
  resetDemoStore,
} from './demo-store';
import { DEMO_IDS } from './demo-data';

beforeEach(() => {
  resetDemoStore();
});

describe('runVerification — order and gating', () => {
  it('executes steps in the fixed order: validate → rate → duplicate → geo/time → assess → verdict (Property 8)', async () => {
    const calls: string[] = [];
    const base = createDemoPipelineDeps();
    const traced: PipelineDeps = {
      dataMode: base.dataMode,
      loadSubmission: (id) => base.loadSubmission(id),
      validateSubmission: async (s) => {
        calls.push('validate');
        return base.validateSubmission(s);
      },
      allowAttempt: async (u) => {
        calls.push('rate');
        return base.allowAttempt(u);
      },
      checkDuplicate: async (s) => {
        calls.push('duplicate');
        return base.checkDuplicate(s);
      },
      scoreGeoTime: async (s) => {
        calls.push('geotime');
        return base.scoreGeoTime(s);
      },
      assess: async (s) => {
        calls.push('assess');
        return base.assess(s);
      },
      finalizePass: (s, v) => {
        calls.push('finalize');
        return base.finalizePass(s, v);
      },
      recordReject: (s, r) => {
        calls.push('reject');
        return base.recordReject(s, r);
      },
    };

    // Attach an after ref so the pending submission is ready.
    const deps = withAfterRef(traced);
    await runVerification({ submissionId: DEMO_IDS.pendingSubmission }, deps);

    const gateOrder = calls.filter((c) =>
      ['validate', 'rate', 'duplicate', 'geotime', 'assess'].includes(c),
    );
    expect(gateOrder).toEqual(['validate', 'rate', 'duplicate', 'geotime', 'assess']);
  });

  it('throws before any downstream work when the submission is missing', async () => {
    const deps = createDemoPipelineDeps();
    await expect(
      runVerification({ submissionId: 'does-not-exist' }, deps),
    ).rejects.toBeInstanceOf(PipelineError);
  });
});

describe('runVerification — legit pass advances the funded bar (Property 2 / 16.3)', () => {
  it('a legitimate cleanup increments progress by exactly one and awards the coupon', async () => {
    const before = getDemoSnapshot().campaign.progress;
    const deps = withAfterRef(createDemoPipelineDeps());
    const result = await runVerification(
      { submissionId: DEMO_IDS.pendingSubmission },
      deps,
    );

    expect(result.pass).toBe(true);
    expect(result.progress).toBe(before + 1);
    expect(result.previousProgress).toBe(before);
    expect(result.couponAwarded).toBe(true);
    expect(getDemoSnapshot().campaign.progress).toBe(before + 1);
  });
});

describe('runVerification — staged fraud is rejected (Property 3 / 16.1 / 16.2)', () => {
  it('returns duplicate + out_of_area reasons and leaves progress unchanged', async () => {
    const before = getDemoSnapshot().campaign.progress;
    const deps = createDemoPipelineDeps();
    const result = await runVerification(
      { submissionId: DEMO_IDS.fraudSubmission },
      deps,
    );

    expect(result.pass).toBe(false);
    expect(result.reasons).toContain('duplicate_photo');
    expect(result.reasons).toContain('out_of_area');
    expect(result.progress).toBe(before);
    expect(result.pointsAwarded).toBe(0);
    expect(result.couponAwarded).toBe(false);
    // The durable snapshot must not have moved.
    expect(getDemoSnapshot().campaign.progress).toBe(before);
  });
});

describe('runVerification — atomic idempotent increment (Property 21 / 12.1 / 12.2)', () => {
  it('repeated verification of the same submission nets exactly one increment', async () => {
    const before = getDemoSnapshot().campaign.progress;
    const deps = withAfterRef(createDemoPipelineDeps());

    const first = await runVerification(
      { submissionId: DEMO_IDS.pendingSubmission },
      deps,
    );
    expect(first.pass).toBe(true);
    expect(first.wasCounted).toBe(true);

    // Re-run several times: each must be a no-op on progress.
    for (let i = 0; i < 5; i += 1) {
      const repeat = await runVerification(
        { submissionId: DEMO_IDS.pendingSubmission },
        deps,
      );
      expect(repeat.wasCounted).toBe(false);
      expect(repeat.pointsAwarded).toBe(0);
    }

    expect(getDemoSnapshot().campaign.progress).toBe(before + 1);
  });

  it('concurrent verification of the same submission still nets exactly one increment', async () => {
    const before = getDemoSnapshot().campaign.progress;
    const deps = withAfterRef(createDemoPipelineDeps());

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        runVerification({ submissionId: DEMO_IDS.pendingSubmission }, deps),
      ),
    );

    const counted = results.filter((r) => r.wasCounted).length;
    expect(counted).toBe(1);
    expect(getDemoSnapshot().campaign.progress).toBe(before + 1);
  });
});

/** Attaches an after ref to the pending submission so it is ready to verify. */
function withAfterRef(deps: PipelineDeps): PipelineDeps {
  return {
    ...deps,
    async loadSubmission(id) {
      const submission = await deps.loadSubmission(id);
      if (submission && submission.afterRef === null) {
        return { ...submission, afterRef: 'demo://photos/amherst-after' };
      }
      return submission;
    },
  };
}
