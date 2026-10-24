import { randomUUID } from 'node:crypto';
import {
  attachDemoAfter,
  createDemoPipelineDeps,
  createDemoSubmission,
  getDemoSnapshot,
  resetDemoStore,
} from './demo-store';
import type { CampaignPayload, DataMode, VerificationResult } from './domain';
import { runVerification } from './pipeline';
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
  uploadEvidenceToSupabase,
} from './supabase-store';

export interface UploadResult {
  objectPath: string;
  mode: DataMode;
}

function fallbackMode(): 'seeded-demo' | 'fallback-demo' {
  return currentDataMode() === 'fallback-demo' ? 'fallback-demo' : 'seeded-demo';
}

function markFailure(error: unknown, defaultService: 'supabase' | 'claude' = 'supabase'): void {
  markLiveServiceFailure(
    error instanceof LiveIntegrationError ? error.service : defaultService,
    error,
  );
}

export async function campaignWithFallback(): Promise<CampaignPayload> {
  if (!shouldUseLiveStack()) return getDemoSnapshot(fallbackMode());
  try {
    return await getSupabaseSnapshot();
  } catch (error) {
    markFailure(error);
    return getDemoSnapshot('fallback-demo');
  }
}

export async function retainUpload(
  bytes: Buffer,
  mime: string,
  phase: 'before' | 'after',
): Promise<UploadResult> {
  if (shouldUseLiveStack()) {
    try {
      return {
        objectPath: await uploadEvidenceToSupabase(bytes, mime, phase),
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

export async function commitBeforeWithFallback(beforeRef: string): Promise<{
  id: string;
  state: 'before_committed';
  committedAt: string;
  mode: DataMode;
}> {
  if (isSupabaseReference(beforeRef) && shouldUseLiveStack()) {
    try {
      return await createSupabaseSubmission(beforeRef);
    } catch (error) {
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
  submissionId: string,
  afterRef: string,
): Promise<VerificationResult> {
  if (isSupabaseReference(afterRef) && shouldUseLiveStack()) {
    try {
      await attachSupabaseAfter(submissionId, afterRef);
      return await runVerification(
        { submissionId },
        createSupabasePipelineDeps(),
      );
    } catch (error) {
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

export function resetLocalDemo(): CampaignPayload {
  return resetDemoStore();
}
