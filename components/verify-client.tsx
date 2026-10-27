'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AI_CONSENT_VERSION, type CampaignPayload, type VerificationResult } from '@/lib/domain';
import { AppShell } from './app-shell';
import { celebrate } from './confetti';
import { LAST_RESULT_KEY } from './home-client';
import { Icon, SproutMark, type IconName } from './icons';

type Stage = 'before' | 'after' | 'analyzing' | 'review-status' | 'result';
type SelectedPhoto = { preview: string; name: string; type: string; size: number; file?: Blob };
type AiConsentStatus = 'not-required' | 'checking' | 'required' | 'accepted';

type UploadResponse = { objectPath?: string; mode?: CampaignPayload['mode']; error?: string };
type CommitResponse = { id?: string; committedAt?: string; mode?: CampaignPayload['mode']; error?: string };
type RetryResponse = { id?: string; state?: 'before_committed'; mode?: CampaignPayload['mode']; error?: string };

const analysisSteps: Array<{ title: string; detail: string; icon: IconName }> = [
  { title: 'Securing the upload', detail: 'Checking image type, size, and submission state', icon: 'lock' },
  { title: 'Looking for duplicates', detail: 'Comparing a perceptual fingerprint with prior proof', icon: 'duplicate' },
  { title: 'Reading place + time', detail: 'Using available metadata as a soft integrity signal', icon: 'location' },
  { title: 'Comparing the scene', detail: 'Claude vision reviews both frames together when live', icon: 'eye' },
];

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function aiConsentKey(userId: string): string {
  return `sprout:ai-photo-consent:${AI_CONSENT_VERSION}:${userId}`;
}

function friendlyReason(reason: string): { title: string; copy: string; icon: IconName } {
  const reasons: Record<string, { title: string; copy: string; icon: IconName }> = {
    duplicate_photo: { title: 'Duplicate evidence', copy: 'This image is too similar to one already in the proof ledger.', icon: 'duplicate' },
    out_of_area: { title: 'Outside mission area', copy: 'The available location signal does not match Amherst Common.', icon: 'location' },
    time_mismatch: { title: 'Timing mismatch', copy: 'The photos appear to have been captured too far apart.', icon: 'clock' },
    low_confidence: { title: 'Not enough visual change', copy: 'Try a wider after photo from the same viewpoint.', icon: 'eye' },
  };
  return reasons[reason] ?? { title: 'Needs another look', copy: 'Try a clearer pair of photos from the same viewpoint.', icon: 'info' };
}

function PhotoPicker({
  phase,
  photo,
  onFile,
  onSample,
  fraud,
  allowSample,
  disabled,
}: {
  phase: 'before' | 'after';
  photo: SelectedPhoto | null;
  onFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onSample: () => void;
  fraud: boolean;
  allowSample: boolean;
  disabled: boolean;
}) {
  const inputId = `${phase}-photo-input`;
  const className = [
    'photo-picker',
    photo ? 'has-photo' : '',
    allowSample ? '' : 'no-sample',
    disabled ? 'is-disabled' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={className}>
      {photo ? (
        <div className="selected-photo">
          <img src={photo.preview} alt={`${phase === 'before' ? 'Before' : 'After'} cleanup preview`} />
          <div className="selected-photo-overlay">
            <span><Icon name="check" size={16} /> Ready</span>
            <label htmlFor={inputId}>Take another</label>
          </div>
        </div>
      ) : (
        <label htmlFor={inputId} className="photo-dropzone" aria-disabled={disabled}>
          <span className="upload-bubble"><Icon name="camera" size={27} /></span>
          <strong>Take your {phase} photo</strong>
          <span>JPG, PNG, WebP, or HEIC · up to 10 MB</span>
          <em>{disabled ? 'Accept the AI notice first' : 'Open camera'}</em>
        </label>
      )}
      <input
        id={inputId}
        className="visually-hidden-input"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        capture="environment"
        onChange={onFile}
        disabled={disabled}
      />
      {allowSample && (
        <button className="sample-button" type="button" onClick={onSample} disabled={disabled}>
          <Icon name={fraud ? 'shield' : 'sparkles'} size={16} />
          {fraud ? 'Load integrity-test sample' : `Use demo ${phase} photo`}
        </button>
      )}
    </div>
  );
}

export function VerifyClient({
  data,
  startFresh,
  fraudDemo,
  showReviewStatus = false,
}: {
  data: CampaignPayload;
  startFresh: boolean;
  fraudDemo: boolean;
  showReviewStatus?: boolean;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const initialConsentRequired = !fraudDemo && !showReviewStatus && data.mode === 'supabase' && data.aiMode === 'claude';
  const consentKey = aiConsentKey(data.user.id);
  const [stage, setStage] = useState<Stage>(showReviewStatus ? 'review-status' : startFresh ? 'before' : 'after');
  const [submissionId, setSubmissionId] = useState(
    showReviewStatus && data.reviewStatus
      ? data.reviewStatus.submissionId
      : fraudDemo
        ? data.fraudSubmissionId
        : data.pendingSubmissionId,
  );
  const [photo, setPhoto] = useState<SelectedPhoto | null>(
    showReviewStatus
      ? null
      : fraudDemo
      ? {
          preview: '/demo-fraud.png',
          name: 'integrity-test.png',
          type: 'image/png',
          size: 246_000,
        }
      : startFresh || data.mode === 'supabase'
        ? null
        : {
            preview: '/demo-after.png',
            name: 'amherst-after.png',
            type: 'image/png',
            size: 246_000,
          },
  );
  const [workflowMode, setWorkflowMode] = useState(data.mode);
  const [consentStatus, setConsentStatus] = useState<AiConsentStatus>(
    initialConsentRequired ? 'checking' : 'not-required',
  );
  const [beforeLockedAt, setBeforeLockedAt] = useState<string | null>(
    startFresh ? null : new Date().toISOString(),
  );
  const [analysisIndex, setAnalysisIndex] = useState(-1);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const previewUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!initialConsentRequired) return;
    try {
      setConsentStatus(window.localStorage.getItem(consentKey) ? 'accepted' : 'required');
    } catch {
      setConsentStatus('required');
    }
  }, [consentKey, initialConsentRequired]);

  const aiConsentAccepted = consentStatus === 'accepted';
  const livePhotoFlow = !fraudDemo && workflowMode === 'supabase';
  const photoControlsDisabled = busy || (livePhotoFlow && !aiConsentAccepted);
  const allowSample = fraudDemo || workflowMode !== 'supabase';
  const claudeConnected = workflowMode === 'supabase';
  const points = result?.pointsBalance ?? data.user.pointsBalance;

  function acceptAiConsent() {
    try {
      window.localStorage.setItem(
        consentKey,
        JSON.stringify({ version: AI_CONSENT_VERSION, acceptedAt: new Date().toISOString() }),
      );
    } catch {
      // Consent still applies for this page if browser storage is unavailable.
    }
    setConsentStatus('accepted');
    setError('');
  }

  function declineAiConsent() {
    router.push('/mission');
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('That photo is larger than 10 MB. Choose a smaller image.');
      return;
    }
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = URL.createObjectURL(file);
    setPhoto({ preview: previewUrl.current, name: file.name, type: file.type || 'image/jpeg', size: file.size, file });
    setError('');
  }

  function loadSample() {
    setPhoto({
      preview: fraudDemo ? '/demo-fraud.png' : stage === 'before' ? '/demo-before.png' : '/demo-after.png',
      name: fraudDemo ? 'integrity-test.png' : `amherst-${stage}.png`,
      type: 'image/png',
      size: 246_000,
    });
    setError('');
  }

  async function reserveUpload(phase: 'before' | 'after'): Promise<string> {
    if (!photo) throw new Error(`Take a ${phase} photo first.`);
    let file: Blob;
    if (photo.file) {
      file = photo.file;
    } else {
      const sampleResponse = await fetch(photo.preview);
      if (!sampleResponse.ok) throw new Error('Could not load the demo photo.');
      file = await sampleResponse.blob();
    }
    const form = new FormData();
    form.append('phase', phase);
    form.append('file', file, photo.name);
    const response = await fetch('/api/upload-url', {
      method: 'POST',
      body: form,
    });
    const payload = (await response.json()) as UploadResponse;
    if (!response.ok || !payload.objectPath) throw new Error(payload.error || 'Could not secure the upload.');
    if (payload.mode) setWorkflowMode(payload.mode);
    if (payload.mode === 'supabase' && !fraudDemo && !aiConsentAccepted) {
      setConsentStatus('required');
      throw new Error('Review the AI photo notice before continuing.');
    }
    return payload.objectPath;
  }

  async function commitBefore() {
    setBusy(true);
    setError('');
    try {
      const beforeRef = await reserveUpload('before');
      const response = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beforeRef }),
      });
      const payload = (await response.json()) as CommitResponse;
      if (!response.ok || !payload.id) throw new Error(payload.error || 'Could not lock the before photo.');
      setSubmissionId(payload.id);
      if (payload.mode) setWorkflowMode(payload.mode);
      setBeforeLockedAt(payload.committedAt ?? new Date().toISOString());
      setPhoto(null);
      setStage('after');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not lock the photo.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCleanup() {
    setBusy(true);
    setError('');
    try {
      const afterRef = fraudDemo ? 'demo://photos/reused-stock' : await reserveUpload('after');
      setStage('analyzing');
      setAnalysisIndex(0);

      const verificationPromise = fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId,
          afterRef,
          aiConsent: aiConsentAccepted,
          aiConsentVersion: aiConsentAccepted ? AI_CONSENT_VERSION : null,
        }),
      });

      for (let index = 1; index < analysisSteps.length; index += 1) {
        await delay(reduceMotion ? 80 : 560);
        setAnalysisIndex(index);
      }
      await delay(reduceMotion ? 80 : 620);

      const response = await verificationPromise;
      const payload = (await response.json()) as VerificationResult & { error?: string };
      if (response.status === 428) setConsentStatus('required');
      if (!response.ok) throw new Error(payload.error || 'Verification could not finish.');
      setResult(payload);
      setStage('result');
      if (payload.pass && payload.wasCounted) celebrate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Verification could not finish.');
      setStage('after');
    } finally {
      setBusy(false);
    }
  }

  function returnHome() {
    if (result) window.sessionStorage.setItem(LAST_RESULT_KEY, JSON.stringify(result));
    router.push('/');
  }

  async function retryReview() {
    setBusy(true);
    setError('');
    try {
      const reviewId = result?.reviewId ?? data.reviewStatus?.reviewId;
      if (!reviewId) throw new Error('This review is no longer current. Refresh and try again.');
      const response = await fetch('/api/submissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId, reviewId }),
      });
      const payload = (await response.json()) as RetryResponse;
      if (!response.ok || !payload.id) {
        throw new Error(payload.error || 'Could not reopen this cleanup.');
      }
      if (payload.mode) setWorkflowMode(payload.mode);
      if ((payload.mode ?? workflowMode) === 'supabase') {
        try {
          setConsentStatus(window.localStorage.getItem(consentKey) ? 'accepted' : 'required');
        } catch {
          setConsentStatus('required');
        }
      }
      setResult(null);
      setAnalysisIndex(-1);
      setPhoto(
        (payload.mode ?? workflowMode) === 'supabase'
          ? null
          : {
              preview: '/demo-after.png',
              name: 'amherst-after.png',
              type: 'image/png',
              size: 246_000,
            },
      );
      setStage('after');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not reopen this cleanup.');
    } finally {
      setBusy(false);
    }
  }

  function retry() {
    setResult(null);
    setError('');
    setAnalysisIndex(-1);
    setPhoto(
      fraudDemo || (result?.dataMode ?? workflowMode) === 'supabase'
        ? null
        : {
            preview: '/demo-after.png',
            name: 'amherst-after.png',
            type: 'image/png',
            size: 246_000,
          },
    );
    setStage('after');
  }

  return (
    <AppShell points={points} mode={result?.dataMode ?? workflowMode} user={data.user}>
      {consentStatus === 'required' && (
        <div className="ai-consent-backdrop">
          <section
            className="ai-consent-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-consent-title"
            aria-describedby="ai-consent-description"
          >
            <span className="ai-consent-icon"><Icon name="sparkles" size={28} /></span>
            <span className="eyebrow">ONE-TIME AI NOTICE</span>
            <h2 id="ai-consent-title">Let Claude compare your cleanup photos?</h2>
            <p id="ai-consent-description">
              Sprout stores your before-and-after photos as private evidence and sends them from the server to Anthropic&apos;s Claude API. If automated checks are inconclusive, an authorized Sprout reviewer may inspect the same private evidence.
            </p>
            <div className="ai-consent-detail">
              <Icon name="lock" size={20} />
              <span><strong>Your photos are not posted publicly.</strong><small>Reviewer access requires server authorization and uses short-lived private links. No photo is processed until you agree; this notice appears once on this device for your account.</small></span>
            </div>
            <div className="ai-consent-actions">
              <button className="button button-quiet" type="button" onClick={declineAiConsent}>Not now</button>
              <button className="button button-primary" type="button" onClick={acceptAiConsent} autoFocus>I agree, continue</button>
            </div>
          </section>
        </div>
      )}

      <div className="page-container verify-page">
        <div className="verify-topbar">
          <Link className="back-link" href="/mission"><Icon name="arrowLeft" size={18} /> Mission details</Link>
          <div className="stepper" aria-label="Verification progress">
            <span className="step-done"><Icon name="check" size={13} /> Before</span><i /><span className={stage === 'before' ? '' : 'step-active'}>2&nbsp; After</span><i /><span className={stage === 'result' || stage === 'review-status' ? 'step-active' : ''}>3&nbsp; Verify</span>
          </div>
          <span className="privacy-note"><Icon name="lock" size={14} /> Private proof</span>
        </div>

        <AnimatePresence mode="wait">
          {stage === 'before' && (
            <motion.section key="before" className="verify-grid" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              <div className="verify-copy-panel">
                <span className="phase-number">01</span><span className="eyebrow">BEFORE YOU BEGIN</span>
                <h1>Show us the starting point.</h1>
                <p>Take a wide, clear photo of the area before moving any litter. We lock it with a timestamp so your proof starts here.</p>
                <div className="tip-card"><Icon name="eye" size={21} /><span><strong>Keep a landmark in frame.</strong><small>A bench, tree, or sign makes the after photo easy to match.</small></span></div>
                <div className="integrity-note"><Icon name="shield" size={20} /><span><strong>Why before-first?</strong><small>Committing evidence now raises the cost of staging while keeping the flow simple.</small></span></div>
              </div>
              <div className="upload-panel">
                <div className="upload-panel-head"><div><span className="eyebrow">PHOTO 1 OF 2</span><h2>Before photo</h2></div><span className="required-chip">Required</span></div>
                <PhotoPicker phase="before" photo={photo} onFile={chooseFile} onSample={loadSample} fraud={false} allowSample={allowSample} disabled={photoControlsDisabled} />
                {error && <p className="form-error" role="alert">{error}</p>}
                <button className="button button-primary button-full button-large" type="button" onClick={commitBefore} disabled={!photo || photoControlsDisabled}>{busy ? <span className="button-spinner" /> : <Icon name="lock" size={19} />} {busy ? 'Securing photo…' : 'Lock in before photo'}</button>
                <p className="microcopy">You can return for the after photo whenever the cleanup is done.</p>
              </div>
            </motion.section>
          )}

          {stage === 'after' && (
            <motion.section key="after" className="verify-after-layout" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <div className="verify-heading-centered">
                <span className="feature-pill"><Icon name="lock" size={15} /> Before locked {beforeLockedAt ? '· just now' : ''}</span>
                <h1>{fraudDemo ? 'Run the integrity stress test.' : 'Nice work. Show the difference.'}</h1>
                <p>{fraudDemo ? 'This seeded case deliberately reuses evidence from outside the mission area.' : 'Match your original viewpoint, then let the verification pipeline compare both frames.'}</p>
              </div>

              {!fraudDemo && data.reviewStatus?.status === 'denied' && data.reviewStatus.submissionId === submissionId && (
                <div className="protected-outcome review-outcome denied-review-notice" role="status">
                  <Icon name="info" size={21} />
                  <span><strong>A reviewer requested clearer evidence.</strong><small>{data.reviewStatus.rationale} Your original before photo is still secured—take a new after photo below.</small></span>
                </div>
              )}

              <div className="comparison-card">
                <div className="comparison-photo locked-photo"><span className="comparison-label"><Icon name="lock" size={14} /> Before · secured</span><img src={fraudDemo ? '/demo-fraud.png' : '/demo-before.png'} alt="Secured before cleanup illustration" /></div>
                <span className="comparison-arrow"><Icon name="arrowRight" size={20} /></span>
                <div className={photo ? 'comparison-photo after-photo ready' : 'comparison-photo after-photo'}>
                  <span className="comparison-label">After {photo ? '· ready' : '· needed'}</span>
                  {photo ? <img src={photo.preview} alt="Selected after cleanup preview" /> : <span className="empty-photo"><Icon name="camera" size={30} /> Take after photo</span>}
                </div>
              </div>

              <div className="after-actions-grid">
                <div className="upload-panel compact-upload">
                  <div className="upload-panel-head"><div><span className="eyebrow">PHOTO 2 OF 2</span><h2>Your after photo</h2></div><span className="required-chip">Required</span></div>
                  <PhotoPicker phase="after" photo={photo} onFile={chooseFile} onSample={loadSample} fraud={fraudDemo} allowSample={allowSample} disabled={photoControlsDisabled} />
                  {error && <p className="form-error" role="alert">{error}</p>}
                  <button className={fraudDemo ? 'button button-danger button-full button-large' : 'button button-primary button-full button-large'} type="button" onClick={verifyCleanup} disabled={!photo || photoControlsDisabled}>
                    <Icon name={fraudDemo ? 'shield' : 'sparkles'} size={19} /> {fraudDemo ? 'Test this evidence' : 'Verify my cleanup'}
                  </button>
                </div>
                <aside className="checks-preview">
                  <span className="eyebrow">WHAT HAPPENS NEXT</span><h2>One tap. Four checks.</h2>
                  {analysisSteps.map((item, index) => <div className="check-preview-item" key={item.title}><span>{index + 1}</span><Icon name={item.icon} size={19} /><div><strong>{item.title}</strong><small>{item.detail}</small></div></div>)}
                  <div className="assessor-disclosure"><span className="demo-dot" /><span><strong>{claudeConnected ? 'Claude Haiku vision connected' : 'Seeded assessor active'}</strong><small>{claudeConnected ? 'With consent, both private images are compared in one server-side request.' : 'Demo submissions receive a seeded successful assessment and points.'}</small></span></div>
                  <Link className={fraudDemo ? 'text-link' : 'fraud-link'} href={fraudDemo ? '/verify' : '/verify?scenario=fraud'}><Icon name="shield" size={16} /> {fraudDemo ? 'Return to legitimate demo' : 'Try the fraud-rejection demo'}</Link>
                </aside>
              </div>
            </motion.section>
          )}

          {stage === 'analyzing' && (
            <motion.section key="analyzing" className="analyzing-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.98 }} aria-live="polite">
              <div className="scan-visual">
                <div className="scan-images"><img src={fraudDemo ? '/demo-fraud.png' : '/demo-before.png'} alt="Before evidence" /><img src={photo?.preview ?? '/demo-after.png'} alt="After evidence" /><motion.span className="scan-line" animate={{ left: ['2%', '96%', '2%'] }} transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }} /></div>
                <motion.div className="orbit-ring" animate={reduceMotion ? undefined : { rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}><span /><span /><span /></motion.div>
              </div>
              <span className="eyebrow">VERIFYING YOUR IMPACT</span><h1>Turning photos into proof…</h1><p>Each check contributes to one server-enforced integrity verdict.</p>
              <div className="analysis-list">
                {analysisSteps.map((item, index) => {
                  const complete = index < analysisIndex;
                  const active = index === analysisIndex;
                  return <div className={`analysis-item ${complete ? 'complete' : ''} ${active ? 'active' : ''}`} key={item.title}><span className="analysis-status">{complete ? <Icon name="check" size={16} /> : active ? <span className="tiny-spinner" /> : index + 1}</span><Icon name={item.icon} size={20} /><span><strong>{item.title}</strong><small>{active ? item.detail : complete ? 'Check complete' : 'Waiting'}</small></span></div>;
                })}
              </div>
            </motion.section>
          )}

          {stage === 'review-status' && data.reviewStatus?.status === 'pending' && (
            <motion.section key="review-status" className="result-screen review" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
              <motion.div className="result-icon" initial={{ scale: 0 }} animate={{ scale: 1 }}><Icon name="clock" size={38} /></motion.div>
              <span className="eyebrow">AWAITING AUTHORIZED REVIEW</span>
              <h1>Your evidence is safely on hold.</h1>
              <p className="result-rationale">“{data.reviewStatus.rationale}”</p>
              <div className="protected-outcome review-outcome"><Icon name="lock" size={21} /><span><strong>Evidence frozen · no reward issued</strong><small>An authorized reviewer can inspect this exact private pair through short-lived links. The funded bar and your points stay unchanged while it is pending.</small></span></div>
              {error && <p className="form-error" role="alert">{error}</p>}
              <div className="result-actions">
                <button className="button button-primary button-large" type="button" onClick={retryReview} disabled={busy}>{busy ? 'Reopening…' : 'Withdraw and submit clearer photos'} <Icon name="camera" size={19} /></button>
                <Link className="button button-quiet" href="/mission">Back to mission</Link>
              </div>
            </motion.section>
          )}

          {stage === 'result' && result && (
            <motion.section key="result" className={`result-screen ${result.outcome}`} initial={{ opacity: 0, scale: 0.92, y: 18 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 240, damping: 20 }}>
              <motion.div className="result-icon" initial={{ scale: 0, rotate: -18 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.12, type: 'spring', stiffness: 330, damping: 18 }}><Icon name={result.outcome === 'pass' ? 'check' : result.outcome === 'review' ? 'clock' : 'shield'} size={38} /></motion.div>
              <span className="eyebrow">{result.outcome === 'pass' ? 'CLEANUP VERIFIED' : result.outcome === 'review' ? 'HELD FOR REVIEW' : 'PROOF NEEDS ATTENTION'}</span>
              <h1>{result.outcome === 'pass' ? 'You made this place better.' : result.outcome === 'review' ? 'Thanks — a reviewer will take a look.' : 'Good catch. Nothing moved.'}</h1>
              <p className="result-rationale">“{result.rationale}”</p>
              <div className="result-meta"><span className="confidence-pill"><Icon name="sparkles" size={16} /> {Math.round(result.confidence * 100)}% integrity score</span><span className="assessor-pill"><span className="demo-dot" /> {result.assessor === 'seeded' ? 'Seeded Claude-ready result' : 'Claude assessment'}</span></div>

              {result.outcome === 'pass' ? (
                <>
                  <div className="reward-reveal">
                    <motion.div className="points-reward" initial={{ x: -18, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.28 }}><span className="big-reward-icon"><SproutMark size={30} /></span><span><small>{data.campaign.pointsMultiplier}× sponsor boost</small><strong>+{result.pointsAwarded} points</strong><em>{result.pointsBalance.toLocaleString()} total</em></span></motion.div>
                    {result.couponAwarded && result.coupon && <motion.div className="coupon-card" initial={{ x: 18, opacity: 0, rotate: 2 }} animate={{ x: 0, opacity: 1, rotate: -1 }} transition={{ delay: 0.38, type: 'spring' }}><span className="coupon-cut top"/><span className="coupon-cut bottom"/><div className="coupon-mark"><Icon name="gift" size={24} /></div><span><small>FIRST CLEANUP PERK</small><strong>{result.coupon.title}</strong><em>{result.coupon.detail} · {result.coupon.cafeName}</em></span><b>DEMO</b></motion.div>}
                  </div>
                  <div className="bar-contribution"><span className="contribution-before">{result.previousProgress}</span><span className="contribution-line"><motion.i initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ delay: 0.5, duration: 0.7 }} /><motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1, type: 'spring' }}><Icon name="leaf" size={18} /></motion.span></span><span className="contribution-after">{result.progress}</span><p><strong>One cleanup closer.</strong> The community just unlocked ${Math.round(result.unlockedValue)} of the ${data.campaign.pool} pool.</p></div>
                  <div className="result-actions"><button className="button button-primary button-large" type="button" onClick={returnHome}>Watch the funded bar move <Icon name="arrowRight" size={20} /></button><Link className="button button-quiet" href="/impact">Open proof trail</Link></div>
                </>
              ) : result.outcome === 'review' ? (
                <>
                  <div className="reason-grid">{result.reasons.map((reason) => { const item = friendlyReason(reason); return <div className="reason-card" key={reason}><span><Icon name={item.icon} size={22} /></span><div><strong>{item.title}</strong><p>{item.copy}</p></div></div>; })}</div>
                  <div className="protected-outcome review-outcome"><Icon name="clock" size={21} /><span><strong>Frozen for authorized review</strong><small>The reviewer sees this exact private pair through short-lived links. Progress stays at {result.progress} and no points were issued.</small></span></div>
                  {error && <p className="form-error" role="alert">{error}</p>}
                  <div className="result-actions"><button className="button button-primary button-large" type="button" onClick={retryReview} disabled={busy}>{busy ? 'Reopening…' : 'Withdraw and retry'} <Icon name="camera" size={19} /></button><button className="button button-quiet" type="button" onClick={returnHome}>Back to campaign</button></div>
                </>
              ) : (
                <>
                  <div className="reason-grid">{result.reasons.map((reason) => { const item = friendlyReason(reason); return <div className="reason-card" key={reason}><span><Icon name={item.icon} size={22} /></span><div><strong>{item.title}</strong><p>{item.copy}</p></div></div>; })}</div>
                  <div className="protected-outcome"><Icon name="shield" size={21} /><span><strong>Sponsor pool protected</strong><small>Progress stays at {result.progress}. No points or reward were issued.</small></span></div>
                  <div className="result-actions"><button className="button button-primary button-large" type="button" onClick={retry}>Try different photos <Icon name="camera" size={19} /></button><Link className="button button-quiet" href="/verify">Run legitimate demo</Link></div>
                </>
              )}
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}
