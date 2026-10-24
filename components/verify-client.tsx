'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChangeEvent, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { CampaignPayload, VerificationResult } from '@/lib/domain';
import { AppShell } from './app-shell';
import { celebrate } from './confetti';
import { LAST_RESULT_KEY } from './home-client';
import { Icon, SproutMark, type IconName } from './icons';

type Stage = 'before' | 'after' | 'analyzing' | 'result';
type SelectedPhoto = { preview: string; name: string; type: string; size: number; file?: Blob };

type UploadResponse = { objectPath?: string; mode?: CampaignPayload['mode']; error?: string };
type CommitResponse = { id?: string; committedAt?: string; mode?: CampaignPayload['mode']; error?: string };

const analysisSteps: Array<{ title: string; detail: string; icon: IconName }> = [
  { title: 'Securing the upload', detail: 'Checking image type, size, and submission state', icon: 'lock' },
  { title: 'Looking for duplicates', detail: 'Comparing a perceptual fingerprint with prior proof', icon: 'duplicate' },
  { title: 'Reading place + time', detail: 'Using available metadata as a soft integrity signal', icon: 'location' },
  { title: 'Comparing the scene', detail: 'Claude vision reviews both frames together when live', icon: 'eye' },
];

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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
}: {
  phase: 'before' | 'after';
  photo: SelectedPhoto | null;
  onFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onSample: () => void;
  fraud: boolean;
}) {
  const inputId = `${phase}-photo-input`;
  return (
    <div className={photo ? 'photo-picker has-photo' : 'photo-picker'}>
      {photo ? (
        <div className="selected-photo">
          <img src={photo.preview} alt={`${phase === 'before' ? 'Before' : 'After'} cleanup preview`} />
          <div className="selected-photo-overlay">
            <span><Icon name="check" size={16} /> Ready</span>
            <label htmlFor={inputId}>Choose another</label>
          </div>
        </div>
      ) : (
        <label htmlFor={inputId} className="photo-dropzone">
          <span className="upload-bubble"><Icon name="upload" size={27} /></span>
          <strong>Add your {phase} photo</strong>
          <span>JPG, PNG, WebP, or HEIC · up to 10 MB</span>
          <em>Choose photo</em>
        </label>
      )}
      <input id={inputId} className="visually-hidden-input" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={onFile} />
      <button className="sample-button" type="button" onClick={onSample}>
        <Icon name={fraud ? 'shield' : 'sparkles'} size={16} />
        {fraud ? 'Load integrity-test sample' : `Use demo ${phase} photo`}
      </button>
    </div>
  );
}

export function VerifyClient({
  data,
  startFresh,
  fraudDemo,
}: {
  data: CampaignPayload;
  startFresh: boolean;
  fraudDemo: boolean;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [stage, setStage] = useState<Stage>(startFresh ? 'before' : 'after');
  const [submissionId, setSubmissionId] = useState(
    fraudDemo ? data.fraudSubmissionId : data.pendingSubmissionId,
  );
  const [photo, setPhoto] = useState<SelectedPhoto | null>(
    startFresh
      ? null
      : {
          preview: fraudDemo ? '/demo-fraud.png' : '/demo-after.png',
          name: fraudDemo ? 'integrity-test.png' : 'amherst-after.png',
          type: 'image/png',
          size: 246_000,
        },
  );
  const [workflowMode, setWorkflowMode] = useState(data.mode);
  const [beforeLockedAt, setBeforeLockedAt] = useState<string | null>(
    startFresh ? null : new Date().toISOString(),
  );
  const [analysisIndex, setAnalysisIndex] = useState(-1);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const previewUrl = useRef<string | null>(null);

  const points = result?.pointsBalance ?? data.user.pointsBalance;

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
    if (!photo) throw new Error(`Add a ${phase} photo first.`);
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
        body: JSON.stringify({ submissionId, afterRef }),
      });

      for (let index = 1; index < analysisSteps.length; index += 1) {
        await delay(reduceMotion ? 80 : 560);
        setAnalysisIndex(index);
      }
      await delay(reduceMotion ? 80 : 620);

      const response = await verificationPromise;
      const payload = (await response.json()) as VerificationResult & { error?: string };
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

  function retry() {
    setResult(null);
    setError('');
    setAnalysisIndex(-1);
    setPhoto(fraudDemo ? null : {
      preview: '/demo-after.png',
      name: 'amherst-after.png',
      type: 'image/png',
      size: 246_000,
    });
    setStage('after');
  }

  return (
    <AppShell points={points} mode={result?.dataMode ?? workflowMode} user={data.user}>
      <div className="page-container verify-page">
        <div className="verify-topbar">
          <Link className="back-link" href="/mission"><Icon name="arrowLeft" size={18} /> Mission details</Link>
          <div className="stepper" aria-label="Verification progress">
            <span className="step-done"><Icon name="check" size={13} /> Before</span><i /><span className={stage === 'before' ? '' : 'step-active'}>2&nbsp; After</span><i /><span className={stage === 'result' ? 'step-active' : ''}>3&nbsp; Verify</span>
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
                <PhotoPicker phase="before" photo={photo} onFile={chooseFile} onSample={loadSample} fraud={false} />
                {error && <p className="form-error" role="alert">{error}</p>}
                <button className="button button-primary button-full button-large" type="button" onClick={commitBefore} disabled={!photo || busy}>{busy ? <span className="button-spinner" /> : <Icon name="lock" size={19} />} {busy ? 'Securing photo…' : 'Lock in before photo'}</button>
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

              <div className="comparison-card">
                <div className="comparison-photo locked-photo"><span className="comparison-label"><Icon name="lock" size={14} /> Before · secured</span><img src={fraudDemo ? '/demo-fraud.png' : '/demo-before.png'} alt="Secured before cleanup illustration" /></div>
                <span className="comparison-arrow"><Icon name="arrowRight" size={20} /></span>
                <div className={photo ? 'comparison-photo after-photo ready' : 'comparison-photo after-photo'}>
                  <span className="comparison-label">After {photo ? '· ready' : '· needed'}</span>
                  {photo ? <img src={photo.preview} alt="Selected after cleanup preview" /> : <span className="empty-photo"><Icon name="camera" size={30} /> Add after photo</span>}
                </div>
              </div>

              <div className="after-actions-grid">
                <div className="upload-panel compact-upload">
                  <div className="upload-panel-head"><div><span className="eyebrow">PHOTO 2 OF 2</span><h2>Your after photo</h2></div><span className="required-chip">Required</span></div>
                  <PhotoPicker phase="after" photo={photo} onFile={chooseFile} onSample={loadSample} fraud={fraudDemo} />
                  {error && <p className="form-error" role="alert">{error}</p>}
                  <button className={fraudDemo ? 'button button-danger button-full button-large' : 'button button-primary button-full button-large'} type="button" onClick={verifyCleanup} disabled={!photo || busy}>
                    <Icon name={fraudDemo ? 'shield' : 'sparkles'} size={19} /> {fraudDemo ? 'Test this evidence' : 'Verify my cleanup'}
                  </button>
                </div>
                <aside className="checks-preview">
                  <span className="eyebrow">WHAT HAPPENS NEXT</span><h2>One tap. Four checks.</h2>
                  {analysisSteps.map((item, index) => <div className="check-preview-item" key={item.title}><span>{index + 1}</span><Icon name={item.icon} size={19} /><div><strong>{item.title}</strong><small>{item.detail}</small></div></div>)}
                  <div className="assessor-disclosure"><span className="demo-dot" /><span><strong>{data.aiMode === 'claude' ? 'Claude vision connected' : 'Seeded assessor active'}</strong><small>{data.aiMode === 'claude' ? 'Both private images are compared in one server-side request.' : 'Claude automatically takes over when valid credentials are available.'}</small></span></div>
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

          {stage === 'result' && result && (
            <motion.section key="result" className={result.pass ? 'result-screen pass' : 'result-screen reject'} initial={{ opacity: 0, scale: 0.92, y: 18 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 240, damping: 20 }}>
              <motion.div className="result-icon" initial={{ scale: 0, rotate: -18 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.12, type: 'spring', stiffness: 330, damping: 18 }}><Icon name={result.pass ? 'check' : 'shield'} size={38} /></motion.div>
              <span className="eyebrow">{result.pass ? 'CLEANUP VERIFIED' : 'PROOF NEEDS ATTENTION'}</span>
              <h1>{result.pass ? 'You made this place better.' : 'Good catch. Nothing moved.'}</h1>
              <p className="result-rationale">“{result.rationale}”</p>
              <div className="result-meta"><span className="confidence-pill"><Icon name="sparkles" size={16} /> {Math.round(result.confidence * 100)}% integrity score</span><span className="assessor-pill"><span className="demo-dot" /> {result.assessor === 'seeded' ? 'Seeded Claude-ready result' : 'Claude assessment'}</span></div>

              {result.pass ? (
                <>
                  <div className="reward-reveal">
                    <motion.div className="points-reward" initial={{ x: -18, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.28 }}><span className="big-reward-icon"><SproutMark size={30} /></span><span><small>{data.campaign.pointsMultiplier}× sponsor boost</small><strong>+{result.pointsAwarded} points</strong><em>{result.pointsBalance.toLocaleString()} total</em></span></motion.div>
                    {result.couponAwarded && result.coupon && <motion.div className="coupon-card" initial={{ x: 18, opacity: 0, rotate: 2 }} animate={{ x: 0, opacity: 1, rotate: -1 }} transition={{ delay: 0.38, type: 'spring' }}><span className="coupon-cut top"/><span className="coupon-cut bottom"/><div className="coupon-mark"><Icon name="gift" size={24} /></div><span><small>FIRST CLEANUP PERK</small><strong>{result.coupon.title}</strong><em>{result.coupon.detail} · {result.coupon.cafeName}</em></span><b>DEMO</b></motion.div>}
                  </div>
                  <div className="bar-contribution"><span className="contribution-before">{result.previousProgress}</span><span className="contribution-line"><motion.i initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ delay: 0.5, duration: 0.7 }} /><motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1, type: 'spring' }}><Icon name="leaf" size={18} /></motion.span></span><span className="contribution-after">{result.progress}</span><p><strong>One cleanup closer.</strong> The community just unlocked ${Math.round(result.unlockedValue)} of the ${data.campaign.pool} pool.</p></div>
                  <div className="result-actions"><button className="button button-primary button-large" type="button" onClick={returnHome}>Watch the funded bar move <Icon name="arrowRight" size={20} /></button><Link className="button button-quiet" href="/impact">Open proof trail</Link></div>
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
