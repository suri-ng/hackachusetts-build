export type DataMode = 'supabase' | 'seeded-demo' | 'fallback-demo';
export type AssessorMode = 'claude' | 'seeded';
export type Accent = 'leaf' | 'sun' | 'clay' | 'sky' | 'plum';
export type TaskIcon = 'cleanup' | 'bottle' | 'bike' | 'garden';

export interface CampaignView {
  id: string;
  sponsorName: string;
  sponsorMark: string;
  sponsorLabel: string;
  title: string;
  location: string;
  pool: number;
  threshold: number;
  progress: number;
  milestones: number[];
  poolUnlocked: boolean;
  basePoints: number;
  pointsMultiplier: number;
  endsLabel: string;
}

export interface DemoUserView {
  id: string;
  name: string;
  firstName: string;
  initials: string;
  pointsBalance: number;
  verifiedCleanups: number;
  actionsCompleted: number;
  couponAwarded: boolean;
}

export interface FeedItem {
  id: string;
  name: string;
  initials: string;
  location: string;
  timeLabel: string;
  points: number;
  confidence: number;
  accent: Accent;
  isCurrentUser?: boolean;
}

export interface TaskCardData {
  id: string;
  title: string;
  description: string;
  sponsor: string;
  sponsorMark: string;
  points: number;
  multiplier: number;
  duration: string;
  badge: string;
  icon: TaskIcon;
  accent: Accent;
  live: boolean;
  href?: string;
}

export interface SponsorPreview {
  id: string;
  name: string;
  mark: string;
  offer: string;
  detail: string;
  accent: Accent;
  live: boolean;
}

export interface CouponView {
  id: string;
  cafeName: string;
  title: string;
  detail: string;
  code: string;
  redeemable: boolean;
}

export interface CampaignPayload {
  campaign: CampaignView;
  user: DemoUserView;
  feed: FeedItem[];
  tasks: TaskCardData[];
  sponsors: SponsorPreview[];
  coupon: CouponView;
  pendingSubmissionId: string;
  fraudSubmissionId: string;
  mode: DataMode;
  aiMode: AssessorMode;
  generatedAt: string;
}

export interface VerificationResult {
  pass: boolean;
  confidence: number;
  rationale: string;
  reasons: string[];
  assessor: AssessorMode;
  dataMode: DataMode;
  previousProgress: number;
  progress: number;
  unlockedValue: number;
  poolUnlocked: boolean;
  pointsAwarded: number;
  pointsBalance: number;
  couponAwarded: boolean;
  coupon?: CouponView;
  wasCounted: boolean;
}
