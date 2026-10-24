'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { CampaignView } from '@/lib/domain';
import { fillRatio, nextMilestone, unlockedValue } from '@/lib/verdict';
import { Icon, SproutMark } from './icons';

export function FundedBar({
  campaign,
  progress = campaign.progress,
}: {
  campaign: CampaignView;
  progress?: number;
}) {
  const reduceMotion = useReducedMotion();
  const ratio = fillRatio(progress, campaign.threshold);
  const dollars = Math.min(campaign.pool, unlockedValue(campaign.pool, progress, campaign.threshold));
  const next = nextMilestone(progress, campaign.milestones);

  return (
    <section className="funded-card" aria-labelledby="funded-title">
      <div className="funded-card-topline">
        <div>
          <span className="eyebrow" id="funded-title">Verified-impact pool</span>
          <div className="money-line">
            <strong>${Math.round(dollars)}</strong>
            <span>of ${campaign.pool} unlocked</span>
          </div>
        </div>
        <span className="live-pill"><span /> Live</span>
      </div>

      <div className="bar-labels">
        <span><strong>{progress}</strong> verified</span>
        <span>{campaign.threshold} goal</span>
      </div>
      <div
        className="progress-wrap"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={campaign.threshold}
        aria-valuenow={progress}
        aria-label={`${progress} of ${campaign.threshold} cleanups verified`}
      >
        <div className="progress-track">
          <motion.div
            className="progress-fill"
            initial={reduceMotion ? false : { width: 0 }}
            animate={{ width: `${ratio * 100}%` }}
            transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 58, damping: 16, mass: 0.9 }}
          >
            <motion.span
              className="bar-sprout"
              animate={reduceMotion ? undefined : { y: [0, -4, 0], rotate: [0, -3, 2, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.8 }}
            >
              <SproutMark size={19} />
            </motion.span>
          </motion.div>
          {campaign.milestones.map((milestone) => (
            <span
              key={milestone}
              className={milestone <= progress ? 'milestone reached' : 'milestone'}
              style={{ left: `${(milestone / campaign.threshold) * 100}%` }}
              aria-hidden="true"
            >
              <i />
              <small>{milestone}</small>
            </span>
          ))}
        </div>
      </div>
      <div className="funded-footer">
        <span className="next-goal"><Icon name="sparkles" size={17} /> {next ? `${next - progress} more to the ${next} milestone` : 'Community goal complete'}</span>
        <span>${(campaign.pool / campaign.threshold).toFixed(0)} per verified action</span>
      </div>
    </section>
  );
}
