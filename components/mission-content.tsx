'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import type { CampaignPayload } from '@/lib/domain';
import { AppShell } from './app-shell';
import { Icon } from './icons';

const steps = [
  { number: '01', title: 'Frame the area', copy: 'Photograph the whole littered spot before touching anything.', icon: 'camera' as const },
  { number: '02', title: 'Make it better', copy: 'Collect the visible litter and dispose of it safely.', icon: 'cleanup' as const },
  { number: '03', title: 'Match your view', copy: 'Take the after photo from the same position and angle.', icon: 'eye' as const },
];

export function MissionContent({ data }: { data: CampaignPayload }) {
  const { campaign, user } = data;
  const reward = campaign.basePoints * campaign.pointsMultiplier;

  return (
    <AppShell points={user.pointsBalance} mode={data.mode}>
      <div className="page-container mission-page">
        <Link className="back-link" href="/"><Icon name="arrowLeft" size={18} /> Back home</Link>

        <section className="mission-hero">
          <motion.div className="mission-image-wrap" initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
            {/* Deliberately an illustration so the seeded demo never implies this is user evidence. */}
            <img src="/demo-before.svg" alt="Illustration of litter beside a walking path in Amherst Common" />
            <span className="photo-caption"><Icon name="camera" size={16} /> Demo mission preview</span>
            <motion.span className="floating-leaf leaf-one" animate={{ y: [0, -7, 0], rotate: [-5, 4, -5] }} transition={{ repeat: Infinity, duration: 3.8 }}><Icon name="leaf" size={24} /></motion.span>
            <motion.span className="floating-leaf leaf-two" animate={{ y: [0, 6, 0], rotate: [7, -4, 7] }} transition={{ repeat: Infinity, duration: 4.4 }}><Icon name="leaf" size={18} /></motion.span>
          </motion.div>

          <motion.div className="mission-summary" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5 }}>
            <div className="mission-pills"><span className="feature-pill"><Icon name="sparkles" size={15} /> {campaign.pointsMultiplier}× weekend boost</span><span className="difficulty-pill">Easy · 20 min</span></div>
            <span className="eyebrow">FEATURED CLEANUP</span>
            <h1>Leave Amherst Common a little lighter.</h1>
            <p>Clear litter from one visible corner. Before-and-after proof turns your effort into sponsor-backed progress.</p>
            <div className="location-line"><Icon name="location" size={18} /><span><strong>Amherst Common</strong><small>Amherst, Massachusetts · about 0.7 mi away</small></span></div>
            <div className="mission-reward-row">
              <div><span className="reward-icon"><Icon name="leaf" size={22} /></span><span><small>You earn</small><strong>{reward} points</strong></span></div>
              <div><span className="reward-icon earth"><Icon name="trend" size={22} /></span><span><small>Community gets</small><strong>+1 verified cleanup</strong></span></div>
            </div>
            <div className="pending-callout"><span className="pending-check"><Icon name={data.pendingSubmissionId ? 'lock' : 'camera'} size={18} /></span><span><strong>{data.pendingSubmissionId ? 'Your before photo is secured.' : 'Ready for your first photo.'}</strong><small>{data.pendingSubmissionId ? 'Continue with the after photo for the fastest walkthrough.' : 'Start by committing a before photo of the cleanup area.'}</small></span></div>
            <div className="mission-actions">
              <Link href="/verify" className="button button-primary button-large">{data.pendingSubmissionId ? 'Continue cleanup' : 'Start cleanup'} <Icon name="arrowRight" size={20} /></Link>
              {data.pendingSubmissionId && <Link href="/verify?fresh=1" className="button button-quiet">Start from the beginning</Link>}
            </div>
          </motion.div>
        </section>

        <section className="section-block how-section" aria-labelledby="how-title">
          <div className="section-heading"><div><span className="eyebrow">HOW IT WORKS</span><h2 id="how-title">Three simple steps. One credible result.</h2></div><span className="section-note"><Icon name="shield" size={16} /> Evidence stays private</span></div>
          <div className="step-grid">
            {steps.map((step, index) => (
              <motion.article key={step.number} className="step-card" initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.08 }} whileHover={{ y: -5 }}>
                <span className="step-number">{step.number}</span><span className="step-icon"><Icon name={step.icon} size={26} /></span><h3>{step.title}</h3><p>{step.copy}</p>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="mission-bottom-grid">
          <div className="evidence-card">
            <div className="evidence-icon"><Icon name="camera" size={26} /></div>
            <div><span className="eyebrow">A GREAT PHOTO SHOWS</span><h2>Enough context to compare.</h2><ul className="check-list"><li><Icon name="check" size={17} /> The same landmarks in both frames</li><li><Icon name="check" size={17} /> The whole cleaned area, not a close crop</li><li><Icon name="check" size={17} /> Natural light with no filters or edits</li></ul></div>
          </div>
          <div className="sponsor-story-card">
            <div className="sponsor-story-top"><span className="sponsor-logo">{campaign.sponsorMark}</span><span><small>Illustrative campaign by</small><strong>{campaign.sponsorName}</strong></span></div>
            <blockquote>“Fund the proof, not another promise.”</blockquote>
            <p>The ${campaign.pool} pool unlocks at {campaign.threshold} verified cleanups. Your contribution moves the live ledger from {campaign.progress} to {campaign.progress + 1}.</p>
            <Link href="/impact" className="text-link">See what sponsors receive <Icon name="arrowRight" size={16} /></Link>
          </div>
        </section>

        <div className="mobile-sticky-action"><span><small>{campaign.pointsMultiplier}× boost</small><strong>{reward} points</strong></span><Link href="/verify" className="button button-primary">Continue <Icon name="arrowRight" size={18} /></Link></div>
      </div>
    </AppShell>
  );
}
