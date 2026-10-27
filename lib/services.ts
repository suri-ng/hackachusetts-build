import { randomUUID } from 'node:crypto';
import { DEMO_AUTH_IDENTITY, initialsForIdentity, type AuthIdentity } from './auth';
import { DEMO_IDS } from './demo-data';
import {
  attachDemoAfter,
  createDemoPipelineDeps,
  createDemoSubmission,
  getDemoSnapshot,
  resetDemoStore,
  retryHeldClaim,
} from './demo-store';
import type { CampaignPayload, DataMode, VerificationResult } from './domain';
import { PipelineError, runVerification } from './pipeline';
import {
  currentDataMode,
  isSupabaseReference,
  markLiveServiceFailure,
  shouldUseLiveStack,
} from './runtime-mode';
import {
  attachSupabaseAfter,
  createSupabasePipelineDeps,
  createSupabaseSubmission,
  getSupabaseSnapshot,
  LiveIntegrationError,
  ResourceOwnershipError,
  ReviewTransitionError,
  retrySupabaseHeldClaim,
  uploadEvidenceToSupabase,
} from './supabase-store';

export interface UploadResult {
  objectPath: string;
  mode: DataMode;
}

function fallbackMode(): 'seeded-demo' | 'fallback-demo' {
  return currentDataMode() === 'fallback-demo' ? 'fallback-demo' : 'seeded-demo';
}

function demoSnapshotFor(
  identity: AuthIdentity,
  mode: 'seeded-demo' | 'fallback-demo' = 'seeded-demo',
): CampaignPayload {
  const snapshot = getDemoSnapshot(mode, identity.id);
  if (identity.id === DEMO_AUTH_IDENTITY.id) return snapshot;
  return {
    ...snapshot,
    user: {
      ...snapshot.user,
      id: identity.id,
      username: identity.username,
      name: identity.displayName,
      firstName: identity.displayName.split(' ')[0] || identity.username,
      initials: initialsForIdentity(identity),
    },
  };
}

function markFailure(error: unknown, defaultService: 'supabase' | 'claude' = 'supabase'): void {
  markLiveServiceFailure(
    error instanceof LiveIntegrationError ? error.service : defaultService,
    error,
  );
}

export async function campaignWithFallback(identity: AuthIdentity): Promise<CampaignPayload> {
  if (!shouldUseLiveStack()) return demoSnapshotFor(identity, fallbackMode());
  try {
    const snapshot = await getSupabaseSnapshot(identity);
    // The canonical seed row is a walkthrough fixture, not evidence captured by
    // this user. Hide it in live mode so connecting keys starts a real photo flow.
    return snapshot.pendingSubmissionId === DEMO_IDS.pendingSubmission
      ? { ...snapshot, pendingSubmissionId: '' }
      : snapshot;
  } catch (error) {
    markFailure(error);
    return demoSnapshotFor(identity, 'fallback-demo');
  }
}

export async function retainUpload(
  identity: AuthIdentity,
  bytes: Buffer,
  mime: string,
  phase: 'before' | 'after',
): Promise<UploadResult> {
  if (shouldUseLiveStack()) {
    try {
      return {
        objectPath: await uploadEvidenceToSupabase(identity.id, bytes, mime, phase),
        mode: 'supabase',
      };
    } catch (error) {
      markFailure(error);
    }
  }
  return {
    objectPath: `demo://uploads/${phase}/${randomUUID()}`,
    mode: fallbackMode(),
  };
}

export async function commitBeforeWithFallback(
  identity: AuthIdentity,
  beforeRef: string,
): Promise<{
  id: string;
  state: 'before_committed';
  committedAt: string;
  mode: DataMode;
}> {
  if (isSupabaseReference(beforeRef) && shouldUseLiveStack()) {
    try {
      return await createSupabaseSubmission(identity, beforeRef);
    } catch (error) {
      if (error instanceof ResourceOwnershipError) throw error;
      markFailure(error);
      const local = createDemoSubmission(`demo://uploads/before/${randomUUID()}`, identity.id);
      return { ...local, mode: 'fallback-demo' };
    }
  }
  const local = createDemoSubmission(
    beforeRef.startsWith('demo://uploads/')
      ? beforeRef
      : `demo://uploads/before/${randomUUID()}`,
    identity.id,
  );
  return { ...local, mode: fallbackMode() };
}

async function localFallbackVerification(
  identity: AuthIdentity,
  mode: 'seeded-demo' | 'fallback-demo',
): Promise<VerificationResult> {
  const local = createDemoSubmission(`demo://uploads/before/${randomUUID()}`, identity.id);
  attachDemoAfter(local.id, `demo://uploads/after/${randomUUID()}`, identity.id);
  return runVerification(
    { submissionId: local.id },
    createDemoPipelineDeps(mode, identity.id),
  );
}

export async function verifyWithFallback(
  identity: AuthIdentity,
  submissionId: string,
  afterRef: string,
): Promise<VerificationResult> {
  if (isSupabaseReference(afterRef) && shouldUseLiveStack()) {
    try {
      await attachSupabaseAfter(identity.id, submissionId, afterRef);
      return await runVerification(
        { submissionId },
        createSupabasePipelineDeps(identity.id),
      );
    } catch (error) {
      if (
        error instanceof PipelineError ||
        error instanceof ResourceOwnershipError ||
        error instanceof ReviewTransitionError
      ) {
        throw error;
      }
      markFailure(error, error instanceof LiveIntegrationError ? error.service : 'supabase');
      return localFallbackVerification(identity, 'fallback-demo');
    }
  }

  if (afterRef.startsWith('demo://')) {
    const demoOwnerId = submissionId === DEMO_IDS.fraudSubmission
      ? DEMO_IDS.user
      : identity.id;
    const attached = attachDemoAfter(submissionId, afterRef, demoOwnerId);
    if (!attached) {
      throw new PipelineError('We could not find that cleanup.', 'submission_not_found', 404);
    }
    return runVerification(
      { submissionId },
      createDemoPipelineDeps(fallbackMode(), demoOwnerId),
    );
  }

  // A live workflow can arrive here when its service circuit opened between
  // upload and verification. Only an authenticated Supabase reference may be
  // converted into a coherent local fallback; invalid demo ids fail closed.
  if (isSupabaseReference(afterRef)) {
    return localFallbackVerification(identity, 'fallback-demo');
  }
  throw new PipelineError('Upload an after photo first.', 'after_required', 400);
}

export async function retryHeldWithFallback(
  identity: AuthIdentity,
  submissionId: string,
  reviewId: string,
): Promise<{ id: string; state: 'before_committed'; mode: DataMode }> {
  if (shouldUseLiveStack()) {
    try {
      const released = await retrySupabaseHeldClaim(identity.id, submissionId, reviewId);
      return { ...released, mode: 'supabase' };
    } catch (error) {
      if (error instanceof ResourceOwnershipError || error instanceof ReviewTransitionError) {
        throw error;
      }
      markFailure(error);
      throw error;
    }
  }
  return { ...retryHeldClaim(submissionId, reviewId, identity.id), mode: fallbackMode() };
}

export function resetLocalDemo(identity: AuthIdentity): CampaignPayload {
  resetDemoStore();
  return demoSnapshotFor(identity);
}
