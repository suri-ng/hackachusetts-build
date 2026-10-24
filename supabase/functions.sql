-- Sprout SQL functions. Implemented in Task 2.2.
-- increment_progress(p_submission_id): single conditional atomic + idempotent
-- UPDATE guarding on `counted`; bumps campaign.progress and sets pool_unlocked
-- in the same statement. (Req 10.3, 12.1, 12.2)
-- ---------------------------------------------------------------------------
-- "At most once per submission" is enforced by the DATABASE, not JavaScript.
-- The guard is a single conditional UPDATE ... WHERE counted = false: Postgres
-- flips `counted` in the same statement that claims the row, so a repeated or
-- concurrent call for the same submission id is a no-op after the first. The
-- campaign bump happens only on the claiming call, giving a net delta of
-- exactly one per submission regardless of retries/concurrency (Req 12.1, 12.2).
--
-- Column/table names match supabase/schema.sql (Task 2.1):
--   submission.counted, submission.campaign_id
--   campaign.progress, campaign.threshold, campaign.pool_unlocked
-- ---------------------------------------------------------------------------

create or replace function increment_progress(p_submission_id uuid)
returns table(progress int, pool_unlocked boolean, was_counted boolean)
language plpgsql as $$
declare
  v_campaign uuid;
begin
  -- Conditionally claim this submission; UPDATE ... WHERE counted = false is the
  -- atomic guard. Row count 0 => already counted => idempotent no-op.
  update submission
     set counted = true
   where id = p_submission_id and counted = false
  returning campaign_id into v_campaign;

  if not found then
    -- Already counted earlier: return current campaign state, do NOT increment.
    select c.progress, c.pool_unlocked, false
      into progress, pool_unlocked, was_counted
      from submission s
      join campaign c on c.id = s.campaign_id
     where s.id = p_submission_id;
    return next;
    return;
  end if;

  -- First (and only) count for this submission: bump progress by exactly one
  -- and recompute the unlocked state against the threshold in the same UPDATE.
  -- Columns are table-qualified so they are unambiguous against the identically
  -- named OUT parameters (progress, pool_unlocked).
  update campaign c
     set progress      = c.progress + 1,
         pool_unlocked  = (c.progress + 1) >= c.threshold   -- Req 10.3
   where c.id = v_campaign
  returning c.progress, c.pool_unlocked into progress, pool_unlocked;

  was_counted := true;
  return next;
end $$;
