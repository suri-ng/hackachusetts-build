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
  if p_assessor_source is distinct from 'claude' then
    raise exception 'authoritative_claude_assessment_required';
  end if;
  if p_confidence is null or p_confidence < 0 or p_confidence > 1 then
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
    review_id = null,
    review_decision = null,
    reviewed_by = null,
    reviewed_at = null,
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
    assessor_source = p_assessor_source,
    review_id = null,
    review_decision = null,
    reviewed_by = null,
    reviewed_at = null
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

-- Remove obsolete review entry points and superseded review signatures.
drop function if exists hold_for_review(uuid,numeric,text,text[],text);
drop function if exists hold_for_review(
  uuid,numeric,text,text[],text,text,text,double precision,double precision,timestamptz,double precision,double precision,timestamptz
);
drop function if exists resolve_held_claim(uuid,text,boolean);
drop function if exists retry_held_claim(uuid,uuid);
drop function if exists approve_held_claim(uuid);
drop function if exists deny_held_claim(uuid);

-- Hold a borderline, non-fraud claim for human review. The locked after_ref
-- check binds every frozen field to the exact evidence that was assessed.
create or replace function hold_for_review(
  p_submission_id uuid,
  p_after_ref text,
  p_confidence numeric,
  p_rationale text,
  p_reasons text[],
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
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission submission%rowtype;
  v_review_id uuid;
begin
  select * into v_submission
  from submission
  where id = p_submission_id
  for update;

  if not found then
    raise exception 'submission_not_found';
  end if;
  if v_submission.state <> 'before_committed' or v_submission.counted then
    raise exception 'submission_not_ready';
  end if;
  if v_submission.after_ref is null then
    raise exception 'submission_not_ready';
  end if;
  if v_submission.after_ref is distinct from p_after_ref then
    raise exception 'after_evidence_changed';
  end if;
  if p_assessor_source is distinct from 'claude' then
    raise exception 'authoritative_claude_assessment_required';
  end if;
  if p_confidence is null or p_confidence < 0 or p_confidence > 1 then
    raise exception 'invalid_confidence';
  end if;
  if p_reasons is null then
    raise exception 'reasons_required';
  end if;
  if p_before_phash is null or p_after_phash is null then
    raise exception 'invalid_evidence_hash';
  end if;

  v_review_id := gen_random_uuid();

  update submission
  set
    state = 'pending_review',
    completed_at = null,
    verdict_pass = null,
    confidence = p_confidence,
    rationale = p_rationale,
    reasons = p_reasons,
    assessor_source = p_assessor_source,
    before_phash = p_before_phash,
    after_phash = p_after_phash,
    before_lat = p_before_lat,
    before_lon = p_before_lon,
    before_taken_at = p_before_taken_at,
    after_lat = p_after_lat,
    after_lon = p_after_lon,
    after_taken_at = p_after_taken_at,
    review_id = v_review_id,
    review_decision = null,
    reviewed_by = null,
    reviewed_at = null,
    points_awarded = 0,
    counted = false
  where id = p_submission_id
    and counted = false
    and state = 'before_committed'
    and after_ref = p_after_ref;

  if not found then
    raise exception 'submission_not_ready';
  end if;

  insert into review_audit (
    submission_id,
    review_id,
    action,
    actor,
    after_ref,
    confidence,
    rationale,
    reasons
  )
  values (
    p_submission_id,
    v_review_id,
    'held',
    null,
    p_after_ref,
    p_confidence,
    p_rationale,
    p_reasons
  );

  return v_review_id;
end;
$$;

-- Resolve a held claim from its stored evidence. Approval awards exactly once;
-- denial reopens the submission without changing campaign or user rewards.
create or replace function resolve_held_claim(
  p_submission_id uuid,
  p_review_id uuid,
  p_reviewer text,
  p_approve boolean
)
returns table(
  decision text,
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
  if p_review_id is null then
    raise exception 'review_id_required';
  end if;

  select * into v_campaign
  from campaign
  where id = v_submission.campaign_id
  for update;

  if not found then
    raise exception 'campaign_not_found';
  end if;

  select * into v_user
  from demo_user
  where id = v_submission.user_id
  for update;

  if not found then
    raise exception 'user_not_found';
  end if;

  -- A repeated approval for this exact hold reports the persisted decision
  -- without inserting another audit row or awarding another reward.
  if v_submission.state = 'complete'
    and v_submission.counted
    and v_submission.review_decision = 'approved'
    and v_submission.review_id = p_review_id
    and p_approve is true
  then
    decision := 'approved';
    previous_progress := v_campaign.progress;
    progress := v_campaign.progress;
    unlocked_value := least(
      v_campaign.pool,
      v_campaign.pool * v_campaign.progress / v_campaign.threshold
    );
    pool_unlocked := v_campaign.pool_unlocked;
    points_awarded_now := 0;
    points_balance := v_user.points_balance;
    coupon_awarded_now := false;
    was_counted := false;
    return next;
    return;
  end if;

  if v_submission.state <> 'pending_review'
    or v_submission.counted
    or v_submission.review_id is distinct from p_review_id
  then
    raise exception 'no_held_claim';
  end if;
  if p_approve is null then
    raise exception 'review_decision_required';
  end if;
  if nullif(btrim(p_reviewer), '') is null then
    raise exception 'reviewer_required';
  end if;

  previous_progress := v_campaign.progress;

  if p_approve then
    if v_submission.after_ref is null
      or v_submission.before_phash is null
      or v_submission.after_phash is null
    then
      raise exception 'held_evidence_incomplete';
    end if;
    if v_submission.assessor_source is distinct from 'claude' then
      raise exception 'authoritative_claude_assessment_required';
    end if;
    if v_submission.confidence is null
      or v_submission.confidence < 0
      or v_submission.confidence > 1
    then
      raise exception 'invalid_confidence';
    end if;

    v_points := round(v_campaign.base_points * v_campaign.points_multiplier)::int;
    coupon_awarded_now := not v_user.coupon_awarded;

    update submission
    set
      state = 'complete',
      completed_at = now(),
      verdict_pass = true,
      review_decision = 'approved',
      reviewed_by = p_reviewer,
      reviewed_at = now(),
      points_awarded = v_points,
      counted = true
    where id = p_submission_id
      and review_id = p_review_id
      and counted = false
      and state = 'pending_review';

    if not found then
      raise exception 'submission_already_claimed';
    end if;

    insert into review_audit (
      submission_id,
      review_id,
      action,
      actor,
      after_ref,
      confidence,
      rationale,
      reasons
    )
    values (
      p_submission_id,
      p_review_id,
      'approved',
      p_reviewer,
      v_submission.after_ref,
      v_submission.confidence,
      v_submission.rationale,
      v_submission.reasons
    );

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
      (v_submission.before_phash, 'submission:' || p_submission_id || ':before'),
      (v_submission.after_phash, 'submission:' || p_submission_id || ':after')
    on conflict (phash) do nothing;

    decision := 'approved';
    unlocked_value := least(
      v_campaign.pool,
      v_campaign.pool * progress / v_campaign.threshold
    );
    points_awarded_now := v_points;
    was_counted := true;
    return next;
    return;
  end if;

  -- Snapshot the frozen evidence before clearing the active hold identity.
  insert into review_audit (
    submission_id,
    review_id,
    action,
    actor,
    after_ref,
    confidence,
    rationale,
    reasons
  )
  values (
    p_submission_id,
    p_review_id,
    'denied',
    p_reviewer,
    v_submission.after_ref,
    v_submission.confidence,
    v_submission.rationale,
    v_submission.reasons
  );

  update submission
  set
    state = 'before_committed',
    completed_at = null,
    verdict_pass = false,
    after_ref = null,
    after_phash = null,
    after_lat = null,
    after_lon = null,
    after_taken_at = null,
    review_id = null,
    review_decision = 'denied',
    reviewed_by = p_reviewer,
    reviewed_at = now(),
    points_awarded = 0,
    counted = false
  where id = p_submission_id
    and review_id = p_review_id
    and counted = false
    and state = 'pending_review';

  if not found then
    raise exception 'no_held_claim';
  end if;

  decision := 'denied';
  progress := v_campaign.progress;
  unlocked_value := least(
    v_campaign.pool,
    v_campaign.pool * v_campaign.progress / v_campaign.threshold
  );
  pool_unlocked := v_campaign.pool_unlocked;
  points_awarded_now := 0;
  points_balance := v_user.points_balance;
  coupon_awarded_now := false;
  was_counted := false;
  return next;
end;
$$;

-- Let the owner withdraw one exact pending hold and replace its after evidence
-- without awarding campaign progress, points, or a coupon.
create or replace function retry_held_claim(
  p_submission_id uuid,
  p_review_id uuid,
  p_owner_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission submission%rowtype;
begin
  select * into v_submission
  from submission
  where id = p_submission_id
    and user_id = p_owner_id
  for update;

  if not found then
    raise exception 'submission_not_found_or_not_owner';
  end if;
  if p_review_id is null then
    raise exception 'review_id_required';
  end if;
  if v_submission.state <> 'pending_review'
    or v_submission.counted
    or v_submission.review_id is distinct from p_review_id
  then
    raise exception 'no_held_claim';
  end if;

  -- Snapshot the frozen evidence before reopening the submission.
  insert into review_audit (
    submission_id,
    review_id,
    action,
    actor,
    after_ref,
    confidence,
    rationale,
    reasons
  )
  values (
    p_submission_id,
    p_review_id,
    'withdrawn',
    p_owner_id::text,
    v_submission.after_ref,
    v_submission.confidence,
    v_submission.rationale,
    v_submission.reasons
  );

  update submission
  set
    state = 'before_committed',
    completed_at = null,
    verdict_pass = null,
    after_ref = null,
    after_phash = null,
    after_lat = null,
    after_lon = null,
    after_taken_at = null,
    review_id = null,
    review_decision = 'withdrawn',
    reviewed_by = p_owner_id::text,
    reviewed_at = now(),
    points_awarded = 0,
    counted = false
  where id = p_submission_id
    and user_id = p_owner_id
    and review_id = p_review_id
    and counted = false
    and state = 'pending_review';

  if not found then
    raise exception 'no_held_claim';
  end if;
end;
$$;

revoke all on function finalize_verification(
  uuid,numeric,text,text,text,text,double precision,double precision,timestamptz,double precision,double precision,timestamptz
) from public, anon, authenticated;
revoke all on function record_rejected_verification(uuid,numeric,text,text[],text)
  from public, anon, authenticated;
revoke all on function increment_progress(uuid) from public, anon, authenticated;
revoke all on function hold_for_review(
  uuid,text,numeric,text,text[],text,text,text,double precision,double precision,timestamptz,double precision,double precision,timestamptz
) from public, anon, authenticated;
revoke all on function resolve_held_claim(uuid,uuid,text,boolean)
  from public, anon, authenticated;
revoke all on function retry_held_claim(uuid,uuid,uuid)
  from public, anon, authenticated;

grant execute on function finalize_verification(
  uuid,numeric,text,text,text,text,double precision,double precision,timestamptz,double precision,double precision,timestamptz
) to service_role;
grant execute on function record_rejected_verification(uuid,numeric,text,text[],text)
  to service_role;
grant execute on function increment_progress(uuid) to service_role;
grant execute on function hold_for_review(
  uuid,text,numeric,text,text[],text,text,text,double precision,double precision,timestamptz,double precision,double precision,timestamptz
) to service_role;
grant execute on function resolve_held_claim(uuid,uuid,text,boolean) to service_role;
grant execute on function retry_held_claim(uuid,uuid,uuid) to service_role;
