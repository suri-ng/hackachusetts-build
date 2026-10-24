'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useReducedMotion } from 'framer-motion';
import type { CampaignPayload, TaskCardData, VerificationResult } from '@/lib/domain';
import { AppShell } from './app-shell';
import { celebrate } from './confetti';
import { FundedBar } from './funded-bar';
import { Icon, SproutMark } from './icons';

export const LAST_RESULT_KEY = 'sprout:last-verification';

function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const previous = useRef(value);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (reduceMotion) {
      setShown(value);
      previous.current = value;
      return;
    }
    const controls = animate(previous.current, value, {
      duration: 0.8,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setShown(Math.round(latest)),
    });
    previous.current = value;
    return () => controls.stop();
  }, [value, reduceMotion]);
  return <>{shown.toLocaleString()}</>;
}

function TaskCard({ task, index }: { task: TaskCardData; index: number }) {
  const content = (
    <motion.article
      className={`task-card accent-${task.accent} ${task.live ? 'task-live' : ''}`}
      whileHover={{ y: -6, rotate: index % 2 === 0 ? -0.5 : 0.5 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
    >
      <div className="task-card-head">
        <span className="task-icon"><Icon name={task.icon} size={27} /></span>
        <span className={task.live ? 'task-status live' : 'task-status'}>{task.live ? 'Live now' : 'Preview'}</span>
      </div>
      <div className="task-card-copy">
        <span className="task-badge">{task.badge}</span>
        <h3>{task.title}</h3>
        <p>{task.description}</p>
      </div>
      <div className="task-meta">
        <span><Icon name="clock" size={15} /> {task.duration}</span>
        <strong>{task.points * task.multiplier} pts</strong>
      </div>
      <div className="task-sponsor-row">
        <span className="mini-sponsor">{task.sponsorMark}</span>
        <span>{task.sponsor}</span>
        {task.live ? <Icon name="arrowRight" size={18} /> : <span className="coming-label">Coming soon</span>}
      </div>
    </motion.article>
  );

  return task.live && task.href ? (
    <Link className="task-link" href={task.href} aria-label={`Open ${task.title} mission`}>{content}</Link>
  ) : (
    <div className="task-link" aria-label={`${task.title}, preview only`}>{content}</div>
  );
}

export function HomeClient({ initialData }: { initialData: CampaignPayload }) {
  const [data, setData] = useState(initialData);
  const [displayProgress, setDisplayProgress] = useState(initialData.campaign.progress);
  const [celebration, setCelebration] = useState<VerificationResult | null>(null);
  const [resetting, setResetting] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    let progressTimer: ReturnType<typeof setTimeout> | undefined;
    let bannerTimer: ReturnType<typeof setTimeout> | undefined;

    const sync = async () => {
      try {
        const response = await fetch('/api/campaign', { cache: 'no-store' });
        if (response.ok) {
          const next = (await response.json()) as CampaignPayload;
          setData(next);
          setDisplayProgress(next.campaign.progress);
        }
      } catch {
        // The server-rendered payload remains a complete offline-safe fallback.
      }
    };

    const raw = window.sessionStorage.getItem(LAST_RESULT_KEY);
    if (raw) {
      window.sessionStorage.removeItem(LAST_RESULT_KEY);
      try {
        const result = JSON.parse(raw) as VerificationResult;
        if (result.pass && result.wasCounted) {
          setCelebration(result);
          setDisplayProgress(result.previousProgress);
          setAnnouncement(`Cleanup verified. ${result.pointsAwarded} points earned and campaign progress is now ${result.progress}.`);
          progressTimer = setTimeout(() => {
            setDisplayProgress(result.progress);
            celebrate();
            void sync();
          }, 520);
          bannerTimer = setTimeout(() => setCelebration(null), 6200);
        } else {
          void sync();
        }
      } catch {
        void sync();
      }
    } else {
      void sync();
    }

    return () => {
      if (progressTimer) clearTimeout(progressTimer);
      if (bannerTimer) clearTimeout(bannerTimer);
    };
  }, []);

  async function resetDemo() {
    setResetting(true);
    try {
      const response = await fetch('/api/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      });
      if (!response.ok) throw new Error('Reset failed');
      const next = (await response.json()) as CampaignPayload;
      setData(next);
      setDisplayProgress(next.campaign.progress);
      setCelebration(null);
      setAnnouncement('Demo reset to 37 verified cleanups.');
    } finally {
      setResetting(false);
    }
  }

  const { campaign, user } = data;

  return (
    <AppShell points={user.pointsBalance} mode={data.mode}>
      <div className="page-container home-page">
        <div className="sr-only" aria-live="polite">{announcement}</div>
        <AnimatePresence>
          {celebration && (
            <motion.div
              className="celebration-toast"
              initial={{ opacity: 0, y: -18, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 340, damping: 22 }}
              role="status"
            >
              <span className="toast-check"><Icon name="check" size={19} /></span>
              <span><strong>Your cleanup moved real progress.</strong><small>+{celebration.pointsAwarded} points · ${Math.round(celebration.unlockedValue)} now unlocked</small></span>
              <Icon name="sparkles" size={22} />
            </motion.div>
          )}
        </AnimatePresence>

        <section className="welcome-row">
          <div>
            <span className="eyebrow">SATURDAY IN AMHERST</span>
            <h1>Good morning, {user.firstName} <SproutMark size={25} /></h1>
            <p>One small action can move a whole community.</p>
          </div>
          <motion.div className="wallet-card" whileHover={{ y: -3 }} transition={{ type: 'spring', stiffness: 320, damping: 22 }}>
            <span className="wallet-icon"><SproutMark size={23} /></span>
            <span><small>Your Sprout points</small><strong><CountUp value={user.pointsBalance} /></strong></span>
            <span className="wallet-gain">+160 today</span>
          </motion.div>
        </section>

        <section className="hero-grid">
          <motion.div
            className="hero-copy"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
          >
            <span className="feature-pill"><Icon name="sparkles" size={16} /> Amherst&apos;s live challenge</span>
            <h2>Turn a cleaner corner into <em>real local funding.</em></h2>
            <p className="hero-lede">MASSPIRG&apos;s $500 pledge unlocks only when the community reaches 100 AI-verified cleanups. Every proof moves the money.</p>
            <div className="hero-actions">
              <Link href="/mission" className="button button-primary">Do this cleanup <Icon name="arrowRight" size={19} /></Link>
              <Link href="/impact" className="button button-quiet">See the proof trail</Link>
            </div>
            <div className="trust-row" aria-label="Verification safeguards">
              <span><Icon name="eye" size={16} /> Visual check</span>
              <span><Icon name="duplicate" size={16} /> Duplicate guard</span>
              <span><Icon name="location" size={16} /> Location signal</span>
            </div>
          </motion.div>

          <motion.div
            className="campaign-panel"
            initial={{ opacity: 0, y: 22, rotate: 1 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ delay: 0.12, type: 'spring', stiffness: 180, damping: 22 }}
          >
            <div className="campaign-header">
              <div className="sponsor-identity">
                <span className="sponsor-logo">{campaign.sponsorMark}</span>
                <span><small>{campaign.sponsorLabel}</small><strong>{campaign.sponsorName}</strong></span>
              </div>
              <span className="multiplier-pill">{campaign.pointsMultiplier}× points</span>
            </div>
            <div className="campaign-title-row">
              <div><h3>{campaign.title}</h3><p><Icon name="location" size={16} /> {campaign.location}</p></div>
              <span className="campaign-time"><Icon name="clock" size={15} /> 2 days</span>
            </div>
            <FundedBar campaign={campaign} progress={displayProgress} />
            <div className="campaign-footnote"><Icon name="shield" size={17} /><span><strong>Every count links to proof.</strong> Sponsors see the before, after, and integrity verdict.</span></div>
          </motion.div>
        </section>

        <section className="section-block" aria-labelledby="missions-title">
          <div className="section-heading">
            <div><span className="eyebrow">MAKE TODAY COUNT</span><h2 id="missions-title">Small tasks, instant momentum.</h2></div>
            <span className="section-note">New actions rotate weekly</span>
          </div>
          <div className="task-grid">
            {data.tasks.map((task, index) => <TaskCard key={task.id} task={task} index={index} />)}
          </div>
        </section>

        <section className="community-grid">
          <div className="section-block community-proof">
            <div className="section-heading compact"><div><span className="eyebrow">COMMUNITY PROOF</span><h2>Verified nearby.</h2></div><Link href="/impact" className="text-link">View all <Icon name="arrowRight" size={16} /></Link></div>
            <div className="feed-list">
              {data.feed.slice(0, 4).map((item, index) => (
                <motion.div key={item.id} className="feed-item" initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.06 }}>
                  <span className={`feed-avatar accent-${item.accent}`}>{item.initials}</span>
                  <span className="feed-copy"><strong>{item.name}</strong><small>{item.location} · {item.timeLabel}</small></span>
                  <span className="verified-score"><Icon name="check" size={14} /> {Math.round(item.confidence * 100)}%</span>
                  <strong className="feed-points">+{item.points}</strong>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="section-block sponsor-section">
            <div className="section-heading compact"><div><span className="eyebrow">SPONSORED MOMENTUM</span><h2>More groups, more good.</h2></div></div>
            <div className="sponsor-list">
              {data.sponsors.map((sponsor) => (
                <div className={`sponsor-preview accent-${sponsor.accent}`} key={sponsor.id}>
                  <span className="sponsor-preview-mark">{sponsor.mark}</span>
                  <span><strong>{sponsor.name}</strong><small>{sponsor.detail}</small></span>
                  <span className="sponsor-offer">{sponsor.offer}</span>
                </div>
              ))}
            </div>
            <p className="demo-disclosure"><Icon name="info" size={15} /> Partner names and offers are illustrative demo data.</p>
          </div>
        </section>

        <footer className="page-footer">
          <div><span className="footer-mark"><SproutMark size={19} /></span><span><strong>Sprout demo</strong><small>Reset before your next walkthrough.</small></span></div>
          {data.mode === 'supabase' ? <span className="live-retention"><Icon name="shield" size={16} /> Live data retained in Supabase</span> : <button className="reset-button" type="button" onClick={resetDemo} disabled={resetting}><Icon name="reset" size={17} /> {resetting ? 'Resetting…' : 'Reset demo'}</button>}
        </footer>
      </div>
    </AppShell>
  );
}
