import { randomUUID } from 'node:crypto';
import {
  displayNameForUsername,
  initialsForIdentity,
  type AuthIdentity,
} from './auth';
import { assessWithClaude } from './claude';
import {
  DEMO_CAMPAIGN,
  DEMO_COUPON,
  DEMO_FEED,
  DEMO_IDS,
  DEMO_SPONSORS,
  DEMO_TASKS,
  DEMO_USER,
} from './demo-data';
import type {
  CampaignPayload,
  CouponView,
  FeedItem,
  ReviewDecisionResult,
  ReviewQueueClaim,
  ReviewStatusView,
} from './domain';
import { extractExif, geoTimeScore, type ExifMeta } from './geotime';
import {
  hammingDistance,
  isDuplicate,
  perceptualHash,
} from './phash';
import type {
  PipelineDeps,
  PipelineSubmission,
} from './pipeline';
import {
  referenceForStoragePath,
  storagePathFromReference,
} from './runtime-mode';
import { getSupabaseAdminClient } from './supabase/admin';
import { unlockedValue } from './verdict';

const BUCKET = 'cleanup-photos';
const MISSION_AREA = { lat: 42.375, lon: -72.5199, radiusMeters: 1_200 };

export class LiveIntegrationError extends Error {
  constructor(
    public readonly service: 'supabase' | 'claude',
    message: string,
  ) {
    super(message);
    this.name = 'LiveIntegrationError';
  }
}

export class ResourceOwnershipError extends Error {
  constructor() {
    super('This cleanup does not belong to the signed-in account.');
    this.name = 'ResourceOwnershipError';
  }
}

export class ReviewTransitionError extends Error {
  constructor(message = 'This review is no longer current.') {
    super(message);
    this.name = 'ReviewTransitionError';
  }
}

function integrationErrorText(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const value = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
  return [value.message, value.details, value.hint, value.code]
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
    .toLowerCase();
}

function numberValue(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

async function ensureBaseRows(identity: AuthIdentity): Promise<void> {
  const db = getSupabaseAdminClient();
  const displayName = identity.displayName || displayNameForUsername(identity.username);
  const firstName = displayName.split(' ')[0] || identity.username;
  const operations = await Promise.all([
    db.from('demo_user').upsert(
      {
        id: identity.id,
        auth_user_id: identity.id === DEMO_IDS.user ? null : identity.id,
        username: identity.username,
        display_name: displayName,
        first_name: firstName,
        initials: initialsForIdentity(identity),
        verified_count: 0,
        points_balance: 0,
        actions_completed: 0,
        coupon_awarded: false,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    ),
    db.from('campaign').upsert(
      {
        id: DEMO_IDS.campaign,
        sponsor_name: DEMO_CAMPAIGN.sponsorName,
        sponsor_mark: DEMO_CAMPAIGN.sponsorMark,
        sponsor_label: DEMO_CAMPAIGN.sponsorLabel,
        title: DEMO_CAMPAIGN.title,
        location: DEMO_CAMPAIGN.location,
        pool: DEMO_CAMPAIGN.pool,
        threshold: DEMO_CAMPAIGN.threshold,
        progress: DEMO_CAMPAIGN.progress,
        milestones: DEMO_CAMPAIGN.milestones,
        pool_unlocked: false,
        base_points: DEMO_CAMPAIGN.basePoints,
        points_multiplier: DEMO_CAMPAIGN.pointsMultiplier,
        ends_label: DEMO_CAMPAIGN.endsLabel,
        mission_lat: MISSION_AREA.lat,
        mission_lon: MISSION_AREA.lon,
        mission_radius_meters: MISSION_AREA.radiusMeters,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    ),
    db.from('cafe_coupon').upsert(
      {
        id: DEMO_COUPON.id,
        title: DEMO_COUPON.title,
        cafe_name: DEMO_COUPON.cafeName,
        detail: DEMO_COUPON.detail,
        code: DEMO_COUPON.code,
        redeemable: false,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    ),
  ]);
  const error = operations.find((operation) => operation.error)?.error;
  if (error) throw new LiveIntegrationError('supabase', 'Could not initialize Sprout data.');
}

export async function getSupabaseSnapshot(identity: AuthIdentity): Promise<CampaignPayload> {
  await ensureBaseRows(identity);
  const ownerId = identity.id;
  const db = getSupabaseAdminClient();
  const [
    campaignResult,
    userResult,
    couponResult,
    pendingResult,
    pendingReviewResult,
    reviewedResult,
    feedResult,
  ] = await Promise.all([
    db.from('campaign').select('*').eq('id', DEMO_IDS.campaign).single(),
    db.from('demo_user').select('*').eq('id', ownerId).single(),
    db.from('cafe_coupon').select('*').eq('id', DEMO_COUPON.id).single(),
    db
      .from('submission')
      .select('id')
      .eq('user_id', ownerId)
      .eq('campaign_id', DEMO_IDS.campaign)
      .eq('state', 'before_committed')
      .is('after_ref', null)
      .order('committed_at', { ascending: false })
      .limit(1),
    db
      .from('submission')
      .select('id,review_id,rationale,committed_at')
      .eq('user_id', ownerId)
      .eq('campaign_id', DEMO_IDS.campaign)
      .eq('state', 'pending_review')
      .order('committed_at', { ascending: false })
      .limit(1),
    db
      .from('submission')
      .select('id,review_id,rationale,review_decision,reviewed_at')
      .eq('user_id', ownerId)
      .eq('campaign_id', DEMO_IDS.campaign)
      .in('review_decision', ['approved', 'denied'])
      .order('reviewed_at', { ascending: false })
      .limit(1),
    db
      .from('submission')
      .select('id,user_id,completed_at,confidence,points_awarded')
      .eq('campaign_id', DEMO_IDS.campaign)
      .eq('state', 'complete')
      .eq('verdict_pass', true)
      .order('completed_at', { ascending: false })
      .limit(12),
  ]);

  const error = [
    campaignResult,
    userResult,
    couponResult,
    pendingResult,
    pendingReviewResult,
    reviewedResult,
    feedResult,
  ].find((result) => result.error)?.error;
  if (error || !campaignResult.data || !userResult.data || !couponResult.data) {
    throw new LiveIntegrationError('supabase', 'Could not read Sprout data.');
  }

  const campaignRow = campaignResult.data as Record<string, unknown>;
  const userRow = userResult.data as Record<string, unknown>;
  const couponRow = couponResult.data as Record<string, unknown>;
  const name = stringValue(userRow.display_name, identity.displayName);
  const defaultPoints = ownerId === DEMO_IDS.user ? DEMO_USER.pointsBalance : 0;
  const defaultActions = ownerId === DEMO_IDS.user ? DEMO_USER.actionsCompleted : 0;
  const liveFeed: FeedItem[] = ((feedResult.data ?? []) as Array<Record<string, unknown>>)
    .map((row, index) => ({
      id: stringValue(row.id, `live-${index}`),
      name: row.user_id === ownerId ? 'You' : 'Community member',
      initials: row.user_id === ownerId ? stringValue(userRow.initials, initialsFor(name)) : 'CM',
      location: 'Amherst Common',
      timeLabel: index === 0 ? 'Just now' : 'Recently',
      points: numberValue(row.points_awarded, DEMO_CAMPAIGN.basePoints * DEMO_CAMPAIGN.pointsMultiplier),
      confidence: numberValue(row.confidence, 0.9),
      accent: index % 2 === 0 ? 'leaf' : 'sky',
      isCurrentUser: row.user_id === ownerId,
    }));
  const existingIds = new Set(liveFeed.map((item) => item.id));
  const feed = [
    ...liveFeed,
    ...DEMO_FEED.filter((item) => !existingIds.has(item.id)),
  ].slice(0, 12);

  const pendingReviewRow = pendingReviewResult.data?.[0] as Record<string, unknown> | undefined;
  const reviewedRow = reviewedResult.data?.[0] as Record<string, unknown> | undefined;
  let reviewStatus: ReviewStatusView | undefined;
  if (pendingReviewRow) {
    reviewStatus = {
      submissionId: stringValue(pendingReviewRow.id, ''),
      reviewId: stringValue(pendingReviewRow.review_id, ''),
      status: 'pending',
      rationale: stringValue(pendingReviewRow.rationale, 'This cleanup is awaiting review.'),
      updatedAt: stringValue(pendingReviewRow.committed_at, new Date().toISOString()),
    };
  } else if (
    reviewedRow &&
    (reviewedRow.review_decision === 'approved' || reviewedRow.review_decision === 'denied')
  ) {
    reviewStatus = {
      submissionId: stringValue(reviewedRow.id, ''),
      ...(reviewedRow.review_id ? { reviewId: String(reviewedRow.review_id) } : {}),
      status: reviewedRow.review_decision,
      rationale: stringValue(
        reviewedRow.rationale,
        reviewedRow.review_decision === 'approved'
          ? 'An authorized reviewer approved this cleanup.'
          : 'An authorized reviewer requested a clearer after photo.',
      ),
      updatedAt: stringValue(reviewedRow.reviewed_at, new Date().toISOString()),
    };
  }

  return {
    campaign: {
      id: stringValue(campaignRow.id, DEMO_IDS.campaign),
      sponsorName: stringValue(campaignRow.sponsor_name, DEMO_CAMPAIGN.sponsorName),
      sponsorMark: stringValue(campaignRow.sponsor_mark, DEMO_CAMPAIGN.sponsorMark),
      sponsorLabel: stringValue(campaignRow.sponsor_label, DEMO_CAMPAIGN.sponsorLabel),
      title: stringValue(campaignRow.title, DEMO_CAMPAIGN.title),
      location: stringValue(campaignRow.location, DEMO_CAMPAIGN.location),
      pool: numberValue(campaignRow.pool, DEMO_CAMPAIGN.pool),
      threshold: numberValue(campaignRow.threshold, DEMO_CAMPAIGN.threshold),
      progress: numberValue(campaignRow.progress, DEMO_CAMPAIGN.progress),
      milestones: Array.isArray(campaignRow.milestones)
        ? campaignRow.milestones.map((value) => numberValue(value, 0))
        : [...DEMO_CAMPAIGN.milestones],
      poolUnlocked: Boolean(campaignRow.pool_unlocked),
      basePoints: numberValue(campaignRow.base_points, DEMO_CAMPAIGN.basePoints),
      pointsMultiplier: numberValue(campaignRow.points_multiplier, DEMO_CAMPAIGN.pointsMultiplier),
      endsLabel: stringValue(campaignRow.ends_label, DEMO_CAMPAIGN.endsLabel),
    },
    user: {
      id: stringValue(userRow.id, ownerId),
      username: stringValue(userRow.username, identity.username),
      name,
      firstName: stringValue(userRow.first_name, name.split(' ')[0] || identity.username),
      initials: stringValue(userRow.initials, initialsFor(name)),
      pointsBalance: numberValue(userRow.points_balance, defaultPoints),
      verifiedCleanups: numberValue(userRow.verified_count, 0),
      actionsCompleted: numberValue(userRow.actions_completed, defaultActions),
      couponAwarded: Boolean(userRow.coupon_awarded),
    },
    feed,
    tasks: DEMO_TASKS.map((task) => ({ ...task })),
    sponsors: DEMO_SPONSORS.map((sponsor) => ({ ...sponsor })),
    coupon: couponFromRow(couponRow),
    pendingSubmissionId: stringValue(
      (pendingResult.data?.[0] as Record<string, unknown> | undefined)?.id,
      '',
    ),
    fraudSubmissionId: DEMO_IDS.fraudSubmission,
    ...(reviewStatus ? { reviewStatus } : {}),
    mode: 'supabase',
    aiMode: 'claude',
    generatedAt: new Date().toISOString(),
  };
}

function couponFromRow(row: Record<string, unknown>): CouponView {
  return {
    id: stringValue(row.id, DEMO_COUPON.id),
    cafeName: stringValue(row.cafe_name, DEMO_COUPON.cafeName),
    title: stringValue(row.title, DEMO_COUPON.title),
    detail: stringValue(row.detail, DEMO_COUPON.detail),
    code: stringValue(row.code, DEMO_COUPON.code),
    redeemable: Boolean(row.redeemable),
  };
}

function extensionForMime(mime: string): string {
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
  };
  return extensions[mime] ?? 'bin';
}

function ownedStoragePath(reference: string, ownerId: string): string {
  const path = storagePathFromReference(reference);
  if (!path.startsWith(`evidence/${ownerId}/`)) {
    throw new ResourceOwnershipError();
  }
  return path;
}

export async function uploadEvidenceToSupabase(
  ownerId: string,
  bytes: Buffer,
  mime: string,
  phase: 'before' | 'after',
): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  const path = `evidence/${ownerId}/${day}/${randomUUID()}-${phase}.${extensionForMime(mime)}`;
  const { error } = await getSupabaseAdminClient().storage.from(BUCKET).upload(path, bytes, {
    contentType: mime,
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw new LiveIntegrationError('supabase', 'Could not store cleanup evidence.');
  return referenceForStoragePath(path);
}

async function downloadEvidence(reference: string, ownerId: string): Promise<Buffer> {
  const path = ownedStoragePath(reference, ownerId);
  const { data, error } = await getSupabaseAdminClient().storage.from(BUCKET).download(path);
  if (error || !data) throw new LiveIntegrationError('supabase', 'Could not load cleanup evidence.');
  return Buffer.from(await data.arrayBuffer());
}

export async function createSupabaseSubmission(
  identity: AuthIdentity,
  beforeRef: string,
): Promise<{
  id: string;
  state: 'before_committed';
  committedAt: string;
  mode: 'supabase';
}> {
  await ensureBaseRows(identity);
  const beforePath = ownedStoragePath(beforeRef, identity.id);
  const before = await downloadEvidence(beforeRef, identity.id);
  const [beforePhash, meta] = await Promise.all([
    perceptualHash(before),
    extractExif(before),
  ]);
  const committedAt = new Date().toISOString();
  const { data, error } = await getSupabaseAdminClient()
    .from('submission')
    .insert({
      user_id: identity.id,
      campaign_id: DEMO_IDS.campaign,
      before_ref: beforePath,
      before_phash: beforePhash,
      before_lat: meta.lat ?? null,
      before_lon: meta.lon ?? null,
      before_taken_at: meta.takenAt?.toISOString() ?? null,
      state: 'before_committed',
      committed_at: committedAt,
      counted: false,
    })
    .select('id,state,committed_at')
    .single();
  if (error || !data) throw new LiveIntegrationError('supabase', 'Could not retain the before photo.');
  return {
    id: String(data.id),
    state: 'before_committed',
    committedAt: String(data.committed_at),
    mode: 'supabase',
  };
}

export async function attachSupabaseAfter(
  ownerId: string,
  submissionId: string,
  afterRef: string,
): Promise<void> {
  const path = ownedStoragePath(afterRef, ownerId);
  const db = getSupabaseAdminClient();
  const { data, error } = await db
    .from('submission')
    .update({
      after_ref: path,
      review_id: null,
      review_decision: null,
      reviewed_by: null,
      reviewed_at: null,
    })
    .eq('id', submissionId)
    .eq('user_id', ownerId)
    .eq('campaign_id', DEMO_IDS.campaign)
    .eq('state', 'before_committed')
    .select('id')
    .maybeSingle();
  if (error) throw new LiveIntegrationError('supabase', 'Could not attach the after photo.');
  if (data) return;

  // A zero-row guarded update can mean either ownership failure or a legal
  // lifecycle conflict. Resolve that distinction without exposing row details.
  const current = await db
    .from('submission')
    .select('user_id,campaign_id,state')
    .eq('id', submissionId)
    .maybeSingle();
  if (current.error) {
    throw new LiveIntegrationError('supabase', 'Could not inspect the submission state.');
  }
  if (
    !current.data ||
    current.data.user_id !== ownerId ||
    current.data.campaign_id !== DEMO_IDS.campaign
  ) {
    throw new ResourceOwnershipError();
  }
  if (current.data.state === 'pending_review') {
    throw new ReviewTransitionError('This cleanup is awaiting review and its evidence is frozen.');
  }
  if (current.data.state === 'complete') {
    throw new ReviewTransitionError('This cleanup is already complete.');
  }
  throw new ReviewTransitionError('This cleanup cannot accept an after photo right now.');
}

interface EvidenceBundle {
  before: Buffer;
  after: Buffer;
  beforePhash: string;
  afterPhash: string;
  beforeMeta: ExifMeta;
  afterMeta: ExifMeta;
}

async function loadBundle(
  submission: PipelineSubmission,
  ownerId: string,
): Promise<EvidenceBundle> {
  if (!submission.afterRef) throw new Error('After photo required.');
  const [before, after] = await Promise.all([
    downloadEvidence(referenceForStoragePath(submission.beforeRef), ownerId),
    downloadEvidence(referenceForStoragePath(submission.afterRef), ownerId),
  ]);
  const [beforePhash, afterPhash, beforeMeta, afterMeta] = await Promise.all([
    perceptualHash(before),
    perceptualHash(after),
    extractExif(before),
    extractExif(after),
  ]);
  return { before, after, beforePhash, afterPhash, beforeMeta, afterMeta };
}

const attemptTimes = new Map<string, number[]>();

export function createSupabasePipelineDeps(ownerId: string): PipelineDeps {
  const db = getSupabaseAdminClient();
  let bundlePromise: Promise<EvidenceBundle> | null = null;
  const evidence = (submission: PipelineSubmission) =>
    (bundlePromise ??= loadBundle(submission, ownerId));

  return {
    dataMode: 'supabase',
    async loadSubmission(id) {
      const { data, error } = await db
        .from('submission')
        .select('*')
        .eq('id', id)
        .eq('user_id', ownerId)
        .eq('campaign_id', DEMO_IDS.campaign)
        .maybeSingle();
      if (error) throw new LiveIntegrationError('supabase', 'Could not load the submission.');
      if (!data) return null;
      const rawState = String(data.state);
      if (
        rawState !== 'before_committed' &&
        rawState !== 'pending_review' &&
        rawState !== 'complete'
      ) {
        throw new LiveIntegrationError('supabase', 'Submission has an invalid lifecycle state.');
      }
      return {
        id: String(data.id),
        userId: String(data.user_id),
        campaignId: String(data.campaign_id),
        beforeRef: String(data.before_ref || ''),
        afterRef: data.after_ref ? String(data.after_ref) : null,
        state: rawState,
        counted: Boolean(data.counted),
      };
    },

    async validateSubmission(submission) {
      if (submission.state === 'pending_review') {
        throw new Error('This cleanup is already awaiting review.');
      }
      if (submission.state === 'complete' && !submission.counted) {
        throw new Error('This cleanup has an invalid completion state.');
      }
      if (!submission.beforeRef) throw new Error('A committed before photo is required.');
      if (!submission.afterRef) throw new Error('Add an after photo before verification.');
      if (submission.userId !== ownerId || submission.campaignId !== DEMO_IDS.campaign) {
        throw new Error('This cleanup does not belong to the active campaign.');
      }
    },

    async allowAttempt(userId) {
      const now = Date.now();
      const recent = (attemptTimes.get(userId) ?? []).filter((value) => value >= now - 60_000);
      if (recent.length >= 12) return false;
      recent.push(now);
      attemptTimes.set(userId, recent);
      return true;
    },

    async checkDuplicate(submission) {
      const current = await evidence(submission);
      if (current.before.equals(current.after)) return true;
      const [knownResult, submissionsResult] = await Promise.all([
        db.from('known_phash').select('phash').limit(500),
        db
          .from('submission')
          .select('id,before_phash,after_phash')
          .neq('id', submission.id)
          .eq('verdict_pass', true)
          .limit(500),
      ]);
      if (knownResult.error || submissionsResult.error) {
        throw new LiveIntegrationError('supabase', 'Could not check prior evidence.');
      }
      const known = [
        ...(knownResult.data ?? []).map((row) => row.phash),
        ...(submissionsResult.data ?? []).flatMap((row) => [row.before_phash, row.after_phash]),
      ].filter((hash): hash is string => typeof hash === 'string' && /^[0-9a-f]{16}$/i.test(hash));
      return (
        isDuplicate(current.beforePhash, known) ||
        isDuplicate(current.afterPhash, known) ||
        hammingDistance(current.beforePhash, current.afterPhash) === 0
      );
    },

    async scoreGeoTime(submission) {
      const current = await evidence(submission);
      const campaign = await db
        .from('campaign')
        .select('mission_lat,mission_lon,mission_radius_meters')
        .eq('id', submission.campaignId)
        .single();
      if (campaign.error || !campaign.data) {
        throw new LiveIntegrationError('supabase', 'Could not load the mission area.');
      }
      return geoTimeScore({
        before: current.beforeMeta,
        after: current.afterMeta,
        missionArea: {
          lat: numberValue(campaign.data.mission_lat, MISSION_AREA.lat),
          lon: numberValue(campaign.data.mission_lon, MISSION_AREA.lon),
          radiusMeters: numberValue(campaign.data.mission_radius_meters, MISSION_AREA.radiusMeters),
        },
      });
    },

    async assess(submission) {
      const current = await evidence(submission);
      const assessment = await assessWithClaude(current.before, current.after);
      if (assessment.source !== 'claude') {
        throw new LiveIntegrationError('claude', 'Claude assessment fell back to seeded mode.');
      }
      return assessment;
    },

    async finalizePass(submission, verdict) {
      const current = await evidence(submission);
      const { data, error } = await db.rpc('finalize_verification', {
        p_submission_id: submission.id,
        p_confidence: verdict.confidence,
        p_rationale: verdict.rationale,
        p_assessor_source: 'claude',
        p_before_phash: current.beforePhash,
        p_after_phash: current.afterPhash,
        p_before_lat: current.beforeMeta.lat ?? null,
        p_before_lon: current.beforeMeta.lon ?? null,
        p_before_taken_at: current.beforeMeta.takenAt?.toISOString() ?? null,
        p_after_lat: current.afterMeta.lat ?? null,
        p_after_lon: current.afterMeta.lon ?? null,
        p_after_taken_at: current.afterMeta.takenAt?.toISOString() ?? null,
      });
      const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
      if (error || !row) throw new LiveIntegrationError('supabase', 'Could not finalize verified impact.');
      const couponAwarded = Boolean(row.coupon_awarded_now);
      let coupon: CouponView | undefined;
      if (couponAwarded) {
        const couponResult = await db.from('cafe_coupon').select('*').eq('id', DEMO_COUPON.id).single();
        if (couponResult.data) coupon = couponFromRow(couponResult.data as Record<string, unknown>);
      }
      return {
        previousProgress: numberValue(row.previous_progress, DEMO_CAMPAIGN.progress),
        progress: numberValue(row.progress, DEMO_CAMPAIGN.progress),
        unlockedValue: numberValue(row.unlocked_value, 0),
        poolUnlocked: Boolean(row.pool_unlocked),
        pointsAwarded: numberValue(row.points_awarded_now, 0),
        pointsBalance: numberValue(row.points_balance, DEMO_USER.pointsBalance),
        couponAwarded,
        ...(coupon ? { coupon } : {}),
        wasCounted: Boolean(row.was_counted),
      };
    },

    async recordReject(submission, result) {
      const { error } = await db.rpc('record_rejected_verification', {
        p_submission_id: submission.id,
        p_confidence: result.confidence,
        p_rationale: result.rationale,
        p_reasons: result.reasons,
        p_assessor_source: 'claude',
      });
      if (error) throw new LiveIntegrationError('supabase', 'Could not retain the rejected verdict.');
      const [campaign, user] = await Promise.all([
        db.from('campaign').select('pool,threshold,progress').eq('id', submission.campaignId).single(),
        db.from('demo_user').select('points_balance').eq('id', submission.userId).single(),
      ]);
      if (campaign.error || user.error || !campaign.data || !user.data) {
        throw new LiveIntegrationError('supabase', 'Could not read the unchanged campaign.');
      }
      const progress = numberValue(campaign.data.progress, DEMO_CAMPAIGN.progress);
      return {
        progress,
        unlockedValue: Math.min(
          numberValue(campaign.data.pool, DEMO_CAMPAIGN.pool),
          unlockedValue(
            numberValue(campaign.data.pool, DEMO_CAMPAIGN.pool),
            progress,
            numberValue(campaign.data.threshold, DEMO_CAMPAIGN.threshold),
          ),
        ),
        pointsBalance: numberValue(user.data.points_balance, DEMO_USER.pointsBalance),
      };
    },

    async recordReview(submission, result) {
      const current = await evidence(submission);
      const { data: reviewIdData, error } = await db.rpc('hold_for_review', {
        p_submission_id: submission.id,
        p_after_ref: submission.afterRef,
        p_confidence: result.confidence,
        p_rationale: result.rationale,
        p_reasons: result.reasons,
        p_assessor_source: 'claude',
        p_before_phash: current.beforePhash,
        p_after_phash: current.afterPhash,
        p_before_lat: current.beforeMeta.lat ?? null,
        p_before_lon: current.beforeMeta.lon ?? null,
        p_before_taken_at: current.beforeMeta.takenAt?.toISOString() ?? null,
        p_after_lat: current.afterMeta.lat ?? null,
        p_after_lon: current.afterMeta.lon ?? null,
        p_after_taken_at: current.afterMeta.takenAt?.toISOString() ?? null,
      });
      if (error) {
        const detail = integrationErrorText(error);
        if (detail.includes('after_evidence_changed') || detail.includes('submission_not_ready')) {
          throw new ReviewTransitionError('The evidence changed before it could be held. Try again.');
        }
        throw new LiveIntegrationError('supabase', 'Could not hold the claim for review.');
      }
      const reviewId = typeof reviewIdData === 'string'
        ? reviewIdData
        : Array.isArray(reviewIdData) && typeof reviewIdData[0] === 'string'
          ? reviewIdData[0]
          : '';
      if (!reviewId) throw new LiveIntegrationError('supabase', 'Review hold returned no identity.');
      const [campaign, user] = await Promise.all([
        db.from('campaign').select('pool,threshold,progress').eq('id', submission.campaignId).single(),
        db.from('demo_user').select('points_balance').eq('id', submission.userId).single(),
      ]);
      if (campaign.error || user.error || !campaign.data || !user.data) {
        throw new LiveIntegrationError('supabase', 'Could not read the unchanged campaign.');
      }
      const progress = numberValue(campaign.data.progress, DEMO_CAMPAIGN.progress);
      return {
        progress,
        unlockedValue: Math.min(
          numberValue(campaign.data.pool, DEMO_CAMPAIGN.pool),
          unlockedValue(
            numberValue(campaign.data.pool, DEMO_CAMPAIGN.pool),
            progress,
            numberValue(campaign.data.threshold, DEMO_CAMPAIGN.threshold),
          ),
        ),
        pointsBalance: numberValue(user.data.points_balance, DEMO_USER.pointsBalance),
        reviewId,
      };
    },
  };
}

const REVIEW_URL_TTL_SECONDS = 5 * 60;

/** Return only frozen pending claims, with short-lived read-only evidence URLs. */
export async function listSupabaseHeldClaims(): Promise<ReviewQueueClaim[]> {
  const db = getSupabaseAdminClient();
  const { data, error } = await db
    .from('submission')
    .select('id,review_id,before_ref,after_ref,confidence,rationale,reasons,committed_at')
    .eq('state', 'pending_review')
    .eq('counted', false)
    .order('committed_at', { ascending: true })
    .limit(100);
  if (error) throw new LiveIntegrationError('supabase', 'Could not load held claims.');

  return Promise.all(((data ?? []) as Array<Record<string, unknown>>).map(async (row) => {
    const reviewId = stringValue(row.review_id, '');
    const beforePath = stringValue(row.before_ref, '');
    const afterPath = stringValue(row.after_ref, '');
    if (!reviewId || !beforePath || !afterPath) {
      throw new LiveIntegrationError('supabase', 'A held claim has incomplete evidence.');
    }
    const [before, after] = await Promise.all([
      db.storage.from(BUCKET).createSignedUrl(beforePath, REVIEW_URL_TTL_SECONDS),
      db.storage.from(BUCKET).createSignedUrl(afterPath, REVIEW_URL_TTL_SECONDS),
    ]);
    if (before.error || after.error || !before.data?.signedUrl || !after.data?.signedUrl) {
      throw new LiveIntegrationError('supabase', 'Could not authorize review evidence.');
    }
    return {
      id: stringValue(row.id, ''),
      reviewId,
      confidence: numberValue(row.confidence, 0),
      rationale: stringValue(row.rationale, 'Held for review.'),
      reasons: Array.isArray(row.reasons)
        ? row.reasons.filter((reason): reason is string => typeof reason === 'string')
        : [],
      committedAt: stringValue(row.committed_at, new Date().toISOString()),
      beforePhotoUrl: before.data.signedUrl,
      afterPhotoUrl: after.data.signedUrl,
    };
  }));
}

/** Resolve one frozen held claim through the database's atomic transition. */
export async function resolveSupabaseHeldClaim(
  submissionId: string,
  reviewId: string,
  reviewerId: string,
  approve: boolean,
): Promise<ReviewDecisionResult> {
  const { data, error } = await getSupabaseAdminClient().rpc('resolve_held_claim', {
    p_submission_id: submissionId,
    p_review_id: reviewId,
    p_reviewer: reviewerId,
    p_approve: approve,
  });
  if (error) {
    const detail = integrationErrorText(error);
    if (
      detail.includes('no_held_claim') ||
      detail.includes('submission_not_found') ||
      detail.includes('submission_already_claimed') ||
      detail.includes('review_id_required')
    ) {
      throw new ReviewTransitionError();
    }
    throw new LiveIntegrationError('supabase', 'Could not resolve held claim.');
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row) throw new LiveIntegrationError('supabase', 'Review returned no decision.');
  const decision = row.decision;
  if (decision !== 'approved' && decision !== 'denied') {
    throw new LiveIntegrationError('supabase', 'Review returned an invalid decision.');
  }
  return {
    decision,
    previousProgress: numberValue(row.previous_progress, DEMO_CAMPAIGN.progress),
    progress: numberValue(row.progress, DEMO_CAMPAIGN.progress),
    unlockedValue: numberValue(row.unlocked_value, 0),
    poolUnlocked: Boolean(row.pool_unlocked),
    pointsAwarded: numberValue(row.points_awarded_now, 0),
    pointsBalance: numberValue(row.points_balance, DEMO_USER.pointsBalance),
    couponAwarded: Boolean(row.coupon_awarded_now),
    wasCounted: Boolean(row.was_counted),
  };
}

/** Release the owner's pending claim for a new after-photo attempt. */
export async function retrySupabaseHeldClaim(
  ownerId: string,
  submissionId: string,
  reviewId: string,
): Promise<{ id: string; state: 'before_committed' }> {
  const { error } = await getSupabaseAdminClient().rpc('retry_held_claim', {
    p_submission_id: submissionId,
    p_review_id: reviewId,
    p_owner_id: ownerId,
  });
  if (error) {
    const detail = integrationErrorText(error);
    if (detail.includes('submission_not_found_or_not_owner')) {
      throw new ResourceOwnershipError();
    }
    if (detail.includes('no_held_claim') || detail.includes('review_id_required')) {
      throw new ReviewTransitionError();
    }
    throw new LiveIntegrationError('supabase', 'Could not reopen held claim.');
  }
  return { id: submissionId, state: 'before_committed' };
}
