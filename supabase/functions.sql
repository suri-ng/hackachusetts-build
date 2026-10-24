-- Atomic, idempotent verification finalization for Sprout.

create or replace function finalize_verification(
  p_submission_id uuid,
  p_confidence numeric,
  p_rationale text,
  p_assessor_source text,
  p_before_phash text,
  p_after_phash text,
  p_before_lat double precision default null,
  p_before_lon double precision default null,
  p_before_taken_at timestamptz default null,
  p_after_lat double precision default null,
  p_after_lon double precision default null,
  p_after_taken_at timestamptz default null
)
returns table(
  previous_progress int,
  progress int,
  unlocked_value numeric,
  pool_unlocked boolean,
  points_awarded_now int,
  points_balance int,
  coupon_awarded_now boolean,
  was_counted boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission submission%rowtype;
  v_campaign campaign%rowtype;
  v_user demo_user%rowtype;
  v_points int;
begin
  select * into v_submission
  from submission
  where id = p_submission_id
  for update;

  if not found then
    raise exception 'submission_not_found';
  end if;

  select * into v_campaign
  from campaign
  where id = v_submission.campaign_id
  for update;

  select * into v_user
  from demo_user
  where id = v_submission.user_id
  for update;

  if v_submission.counted then
    return query select
      v_campaign.progress,
      v_campaign.progress,
      least(v_campaign.pool, v_campaign.pool * v_campaign.progress / v_campaign.threshold),
      v_campaign.pool_unlocked,
      0,
      v_user.points_balance,
      false,
      false;
    return;
  end if;

  if v_submission.state <> 'before_committed' or v_submission.after_ref is null then
    raise exception 'submission_not_ready';
  end if;
  if p_assessor_source <> 'claude' then
    raise exception 'authoritative_claude_assessment_required';
  end if;
  if p_confidence < 0 or p_confidence > 1 then
    raise exception 'invalid_confidence';
  end if;

  previous_progress := v_campaign.progress;
  v_points := round(v_campaign.base_points * v_campaign.points_multiplier)::int;
  coupon_awarded_now := not v_user.coupon_awarded;

  update submission
  set
    state = 'complete',
    completed_at = now(),
    verdict_pass = true,
    confidence = p_confidence,
    rationale = p_rationale,
    reasons = '{}',
    assessor_source = p_assessor_source,
    before_phash = p_before_phash,
    after_phash = p_after_phash,
    before_lat = p_before_lat,
    before_lon = p_before_lon,
    before_taken_at = p_before_taken_at,
    after_lat = p_after_lat,
    after_lon = p_after_lon,
    after_taken_at = p_after_taken_at,
    points_awarded = v_points,
    counted = true
  where id = p_submission_id and counted = false;

  if not found then
    raise exception 'submission_already_claimed';
  end if;

  update campaign
  set
    progress = campaign.progress + 1,
    pool_unlocked = (campaign.progress + 1) >= campaign.threshold
  where id = v_campaign.id
  returning campaign.progress, campaign.pool_unlocked
  into progress, pool_unlocked;

  update demo_user
  set
    verified_count = demo_user.verified_count + 1,
    actions_completed = demo_user.actions_completed + 1,
    points_balance = demo_user.points_balance + v_points,
    coupon_awarded = true
  where id = v_user.id
  returning demo_user.points_balance into points_balance;

  insert into known_phash (phash, source)
  values
    (p_before_phash, 'submission:' || p_submission_id || ':before'),
    (p_after_phash, 'submission:' || p_submission_id || ':after')
  on conflict (phash) do nothing;

  unlocked_value := least(
    v_campaign.pool,
    v_campaign.pool * progress / v_campaign.threshold
  );
  points_awarded_now := v_points;
  was_counted := true;
  return next;
end;
$$;

create or replace function record_rejected_verification(
  p_submission_id uuid,
  p_confidence numeric,
  p_rationale text,
  p_reasons text[],
  p_assessor_source text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update submission
  set
    verdict_pass = false,
    confidence = p_confidence,
    rationale = p_rationale,
    reasons = coalesce(p_reasons, '{}'),
    assessor_source = p_assessor_source
  where id = p_submission_id
    and counted = false
    and state = 'before_committed';

  if not found then
    raise exception 'submission_not_found_or_finalized';
  end if;
end;
$$;

-- Keep the original helper for compatibility, but only count submissions that
-- already carry a passing Claude verdict. New code uses finalize_verification.
create or replace function increment_progress(p_submission_id uuid)
returns table(progress int, pool_unlocked boolean, was_counted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
begin
  update submission
  set counted = true
  where id = p_submission_id
    and counted = false
    and verdict_pass = true
    and assessor_source = 'claude'
  returning campaign_id into v_campaign;

  if not found then
    return query
      select c.progress, c.pool_unlocked, false
      from submission s
      join campaign c on c.id = s.campaign_id
      where s.id = p_submission_id;
    return;
  end if;

  return query
    update campaign c
    set progress = c.progress + 1,
        pool_unlocked = (c.progress + 1) >= c.threshold
    where c.id = v_campaign
    returning c.progress, c.pool_unlocked, true;
end;
$$;

revoke all on function finalize_verification(
  uuid,numeric,text,text,text,text,double precision,double precision,timestamptz,double precision,double precision,timestamptz
) from public, anon, authenticated;
revoke all on function record_rejected_verification(uuid,numeric,text,text[],text)
  from public, anon, authenticated;
revoke all on function increment_progress(uuid) from public, anon, authenticated;

grant execute on function finalize_verification(
  uuid,numeric,text,text,text,text,double precision,double precision,timestamptz,double precision,double precision,timestamptz
) to service_role;
grant execute on function record_rejected_verification(uuid,numeric,text,text[],text)
  to service_role;
grant execute on function increment_progress(uuid) to service_role;
