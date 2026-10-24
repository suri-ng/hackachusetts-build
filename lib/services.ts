import { randomUUID } from 'node:crypto';
import { DEMO_AUTH_IDENTITY, initialsForIdentity, type AuthIdentity } from './auth';
import {
  attachDemoAfter,
  createDemoPipelineDeps,
  createDemoSubmission,
  getDemoSnapshot,
  resetDemoStore,
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
  const snapshot = getDemoSnapshot(mode);
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
    return await getSupabaseSnapshot(identity);
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
      const local = createDemoSubmission(`demo://uploads/before/${randomUUID()}`);
      return { ...local, mode: 'fallback-demo' };
    }
  }
  const local = createDemoSubmission(
    beforeRef.startsWith('demo://uploads/')
      ? beforeRef
      : `demo://uploads/before/${randomUUID()}`,
  );
  return { ...local, mode: fallbackMode() };
}

async function localFallbackVerification(
  mode: 'seeded-demo' | 'fallback-demo',
): Promise<VerificationResult> {
  const local = createDemoSubmission(`demo://uploads/before/${randomUUID()}`);
  attachDemoAfter(local.id, `demo://uploads/after/${randomUUID()}`);
  return runVerification(
    { submissionId: local.id },
    createDemoPipelineDeps(mode),
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
      if (error instanceof PipelineError || error instanceof ResourceOwnershipError) throw error;
      markFailure(error, error instanceof LiveIntegrationError ? error.service : 'supabase');
      return localFallbackVerification('fallback-demo');
    }
  }

  if (attachDemoAfter(submissionId, afterRef)) {
    return runVerification(
      { submissionId },
      createDemoPipelineDeps(fallbackMode()),
    );
  }

  // A live workflow can arrive here when its service circuit opened between
  // upload and verification. Start a coherent local workflow rather than
  // mixing a Supabase submission with DemoStore state.
  return localFallbackVerification('fallback-demo');
}

export function resetLocalDemo(identity: AuthIdentity): CampaignPayload {
  resetDemoStore();
  return demoSnapshotFor(identity);
}
