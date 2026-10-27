import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { perceptualHash } from '../lib/phash';
import { DEMO_CAMPAIGN, DEMO_COUPON, DEMO_IDS, DEMO_USER } from '../lib/demo-data';

loadEnvConfig(process.cwd());

function configured(value: string | undefined): value is string {
  return Boolean(value?.trim() && !value.includes('your-') && !value.includes('<'));
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!configured(url) || !configured(key)) {
    console.log(`
Supabase credentials are missing, so Sprout remains in local demo mode.
Copy .env.local.example to .env.local, add SUPABASE_URL and
SUPABASE_SERVICE_ROLE_KEY, then apply schema.sql + functions.sql and rerun:

  npm run seed
`);
    return;
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const assetPaths = {
    before: path.join(process.cwd(), 'public', 'demo-before.png'),
    after: path.join(process.cwd(), 'public', 'demo-after.png'),
    fraud: path.join(process.cwd(), 'public', 'demo-fraud.png'),
  };
  const [before, after, fraud] = await Promise.all([
    readFile(assetPaths.before),
    readFile(assetPaths.after),
    readFile(assetPaths.fraud),
  ]);
  const [beforePhash, fraudPhash] = await Promise.all([
    perceptualHash(before),
    perceptualHash(fraud),
  ]);

  for (const [storagePath, bytes] of [
    ['seed/amherst-before.png', before],
    ['seed/amherst-after.png', after],
    ['seed/staged-fraud.png', fraud],
  ] as const) {
    const { error } = await supabase.storage
      .from('cleanup-photos')
      .upload(storagePath, bytes, {
        contentType: 'image/png',
        upsert: true,
        cacheControl: '3600',
      });
    if (error) throw new Error('Could not upload seed evidence. Apply schema.sql first.');
  }

  const baseRows = await Promise.all([
    supabase.from('demo_user').upsert({
      id: DEMO_IDS.user,
      username: DEMO_USER.username,
      auth_user_id: null,
      display_name: DEMO_USER.name,
      first_name: DEMO_USER.firstName,
      initials: DEMO_USER.initials,
      verified_count: 0,
      points_balance: DEMO_USER.pointsBalance,
      actions_completed: DEMO_USER.actionsCompleted,
      coupon_awarded: false,
    }),
    supabase.from('campaign').upsert({
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
      mission_lat: 42.375,
      mission_lon: -72.5199,
      mission_radius_meters: 1200,
    }),
    supabase.from('cafe_coupon').upsert({
      id: DEMO_COUPON.id,
      title: DEMO_COUPON.title,
      cafe_name: DEMO_COUPON.cafeName,
      detail: DEMO_COUPON.detail,
      code: DEMO_COUPON.code,
      redeemable: false,
    }),
  ]);
  if (baseRows.some((result) => result.error)) {
    throw new Error('Could not seed base rows. Apply schema.sql first.');
  }

  const resets = await Promise.all([
    supabase.from('submission').delete().eq('user_id', DEMO_IDS.user),
    supabase.from('known_phash').delete().eq('source', 'seed_stock'),
  ]);
  if (resets.some((result) => result.error)) {
    throw new Error('Could not reset seeded submissions. Review schema constraints and try again.');
  }

  const rows = await Promise.all([
    supabase.from('known_phash').upsert({
      id: '00000000-0000-0000-0000-0000000000d1',
      phash: fraudPhash,
      source: 'seed_stock',
    }),
    supabase.from('submission').upsert({
      id: DEMO_IDS.pendingSubmission,
      user_id: DEMO_IDS.user,
      campaign_id: DEMO_IDS.campaign,
      before_ref: 'seed/amherst-before.png',
      before_phash: beforePhash,
      state: 'before_committed',
      committed_at: new Date().toISOString(),
      counted: false,
    }),
    supabase.from('submission').upsert({
      id: DEMO_IDS.fraudSubmission,
      user_id: DEMO_IDS.user,
      campaign_id: DEMO_IDS.campaign,
      before_ref: 'seed/staged-fraud.png',
      after_ref: 'seed/staged-fraud.png',
      before_phash: fraudPhash,
      after_phash: fraudPhash,
      before_lat: 34.0522,
      before_lon: -118.2437,
      after_lat: 34.0522,
      after_lon: -118.2437,
      state: 'before_committed',
      committed_at: new Date().toISOString(),
      counted: false,
    }),
  ]);
  if (rows.some((result) => result.error)) {
    throw new Error('Could not seed submissions. Apply schema.sql and functions.sql first.');
  }

  console.log('Sprout Supabase demo data and private evidence assets are ready.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Supabase seed failed.');
  process.exitCode = 1;
});
