'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { CampaignPayload } from '@/lib/domain';
import { AppShell } from './app-shell';
import { FundedBar } from './funded-bar';
import { Icon, SproutMark, type IconName } from './icons';

const trustChecks: Array<{ icon: IconName; title: string; copy: string; tag: string }> = [
  { icon: 'eye', title: 'Scene comparison', copy: 'Before and after frames are assessed together for the same place and a visible cleanup.', tag: 'Claude vision' },
  { icon: 'duplicate', title: 'Duplicate guard', copy: 'Perceptual fingerprints catch reused or lightly edited evidence across submissions.', tag: 'pHash' },
  { icon: 'location', title: 'Place + time signals', copy: 'Available photo metadata supports the verdict without punishing devices that strip EXIF.', tag: 'Soft signal' },
];

const kiroSteps: Array<{ number: string; title: string; copy: string }> = [
  { number: '01', title: 'Plan', copy: 'Kiro Plan turned research and trade-offs into a scoped build path for one hackathon day.' },
  { number: '02', title: 'Specify', copy: 'Requirements, design, and task specs made the escrow rules and anti-fraud guarantees explicit.' },
  { number: '03', title: 'Steer', copy: 'A reusable Kiro steering file kept every screen aligned to one accessible design system.' },
  { number: '04', title: 'Build', copy: 'Agentic implementation connected the typed pipeline, demo adapters, UI, and verification states.' },
];

export function ImpactClient({ initialData }: { initialData: CampaignPayload }) {
  const [data, setData] = useState(initialData);
  const [resetting, setResetting] = useState(false);
  const { campaign, user } = data;

  useEffect(() => {
    fetch('/api/campaign', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() as Promise<CampaignPayload> : null)
      .then((payload) => payload && setData(payload))
      .catch(() => undefined);
  }, []);

  async function reset() {
    setResetting(true);
    try {
      const response = await fetch('/api/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      });
      if (response.ok) setData((await response.json()) as CampaignPayload);
    } finally {
      setResetting(false);
    }
  }

  const estimatedDollars = Math.min(campaign.pool, campaign.pool * campaign.progress / campaign.threshold);

  return (
    <AppShell points={user.pointsBalance} mode={data.mode}>
      <div className="page-container impact-page">
        <section className="impact-hero">
          <motion.div className="impact-hero-copy" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <span className="feature-pill"><Icon name="shield" size={16} /> Live, attributable proof</span>
            <span className="eyebrow">YOUR IMPACT</span>
            <h1>Good work deserves a receipt.</h1>
            <p>Every verified action becomes a line in a sponsor-ready proof trail, not a promise in a year-end PDF.</p>
          </motion.div>
          <motion.div className="impact-score-card" initial={{ opacity: 0, scale: 0.94, rotate: 1 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 210, damping: 21 }}>
            <div className="impact-ring"><span><SproutMark size={27} /><strong>{user.pointsBalance.toLocaleString()}</strong><small>points</small></span></div>
            <div className="impact-mini-stats"><span><strong>{user.actionsCompleted}</strong><small>actions</small></span><span><strong>{user.verifiedCleanups}</strong><small>sponsor cleanups</small></span><span><strong>{Math.round(estimatedDollars)}</strong><small>dollars unlocked</small></span></div>
          </motion.div>
        </section>

        <section className="impact-campaign-grid">
          <div className="campaign-report-card">
            <div className="report-card-head"><div className="sponsor-identity"><span className="sponsor-logo">{campaign.sponsorMark}</span><span><small>{campaign.sponsorLabel}</small><strong>{campaign.sponsorName}</strong></span></div><span className="report-status"><span /> Funding in progress</span></div>
            <h2>{campaign.title}</h2><p className="report-location"><Icon name="location" size={16} /> {campaign.location}</p>
            <FundedBar campaign={campaign} />
          </div>
          <div className="sponsor-value-card">
            <span className="eyebrow">WHAT THE SPONSOR BUYS</span><h2>Evidence at action-level detail.</h2>
            <div className="value-stat"><span><Icon name="users" size={21} /></span><div><strong>{campaign.progress} verified outcomes</strong><small>One count per accepted before-and-after pair</small></div></div>
            <div className="value-stat"><span><Icon name="wallet" size={21} /></span><div><strong>${Math.round(estimatedDollars)} attributable value</strong><small>Clear unit economics at ${campaign.pool / campaign.threshold} per cleanup</small></div></div>
            <div className="value-stat"><span><Icon name="trend" size={21} /></span><div><strong>{campaign.threshold - campaign.progress} to release</strong><small>The pledge stays conditional until the goal is reached</small></div></div>
            <div className="report-note"><Icon name="info" size={17} /> No real money moves in this hackathon demo.</div>
          </div>
        </section>

        <section className="section-block ledger-section" aria-labelledby="ledger-title">
          <div className="section-heading"><div><span className="eyebrow">VERIFIED LEDGER</span><h2 id="ledger-title">A living trail of local action.</h2></div><span className="section-note"><span className="live-dot" /> Updated from accepted proof</span></div>
          <div className="ledger-table" role="table" aria-label="Verified cleanup proof trail">
            <div className="ledger-head" role="row"><span role="columnheader">Contributor</span><span role="columnheader">Location</span><span role="columnheader">Integrity</span><span role="columnheader">Reward</span></div>
            {data.feed.map((item, index) => (
              <motion.div className="ledger-row" role="row" key={item.id} initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.04 }}>
                <span className="ledger-person" role="cell"><i className={`feed-avatar accent-${item.accent}`}>{item.initials}</i><span><strong>{item.name}</strong><small>{item.timeLabel}</small></span></span>
                <span role="cell"><Icon name="location" size={16} /> {item.location}</span>
                <span role="cell"><b className="verified-score"><Icon name="check" size={14} /> {Math.round(item.confidence * 100)}%</b></span>
                <span role="cell"><strong>+{item.points} pts</strong></span>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="section-block trust-section" aria-labelledby="trust-title">
          <div className="section-heading"><div><span className="eyebrow">TRUST, WITHOUT THE FRICTION</span><h2 id="trust-title">Three checks. One understandable verdict.</h2></div><p>Signals support people; missing metadata never rejects a cleanup by itself.</p></div>
          <div className="trust-card-grid">
            {trustChecks.map((check, index) => <motion.article className="trust-card" key={check.title} whileHover={{ y: -5 }} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.08 }}><span className="trust-icon"><Icon name={check.icon} size={25} /></span><span className="trust-tag">{check.tag}</span><h3>{check.title}</h3><p>{check.copy}</p></motion.article>)}
          </div>
        </section>

        <section className="kiro-story">
          <div className="kiro-story-copy"><span className="kiro-k">K</span><span className="eyebrow">BUILT WITH KIRO</span><h2>AI development with a plan, not just a prompt.</h2><p>We used Kiro&apos;s Plan workflow, structured specs, steering, and agentic coding to keep product strategy, correctness, and visual quality moving together.</p><Link href="/mission" className="button button-light">Experience the flow <Icon name="arrowRight" size={19} /></Link></div>
          <div className="kiro-step-list">{kiroSteps.map((step) => <div className="kiro-step" key={step.number}><span>{step.number}</span><div><strong>{step.title}</strong><p>{step.copy}</p></div></div>)}</div>
        </section>

        <section className="impact-cta">
          <span className="cta-sprout"><SproutMark size={34} /></span><div><span className="eyebrow">THE NEXT LINE IS YOURS</span><h2>Make one corner count.</h2><p>A demo before photo is already locked and ready for the hero flow.</p></div><Link href="/verify" className="button button-primary button-large">Verify a cleanup <Icon name="arrowRight" size={20} /></Link>
        </section>

        <footer className="page-footer"><div><span className="footer-mark"><Icon name="shield" size={18} /></span><span><strong>{data.mode === 'supabase' ? 'Live retention active' : 'Transparent demo mode'}</strong><small>{data.mode === 'supabase' ? 'Private proof and verdicts are retained in Supabase.' : 'Seeded verification and illustrative partners are labeled throughout.'}</small></span></div>{data.mode === 'supabase' ? <span className="live-retention"><Icon name="shield" size={16} /> Supabase live</span> : <button className="reset-button" onClick={reset} disabled={resetting} type="button"><Icon name="reset" size={17} /> {resetting ? 'Resetting…' : 'Reset demo'}</button>}</footer>
      </div>
    </AppShell>
  );
}
