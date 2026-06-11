-- pg_cron job registration — run in the Supabase SQL editor.
-- IMPORTANT: replace YOUR_PROJECT_REF and YOUR_ANON_KEY with real values before running!
-- (On 2026-06-11 the jobs were found registered with the literal placeholders
--  "<ref>" / "<ANON_KEY>" — every run failed with "Bad hostname" and no
--  Telegram message was ever sent automatically. Don't repeat that.
--  Also: pg_net's default timeout is 5000 ms, which the functions exceed —
--  always set timeout_milliseconds explicitly.)
--
-- Re-running: cron.schedule() with an existing jobname updates it in place,
-- but if renaming, unschedule the old job first:
--   select cron.unschedule('poll-match-results');
--   select cron.unschedule('check-upcoming-matches');

select cron.schedule(
  'poll-match-results',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/poll-match-results',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000  -- polls one match per 7 s; needs headroom
  )
  $$
);

select cron.schedule(
  'check-upcoming-matches',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/check-upcoming-matches',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  $$
);

-- Verify registration:
--   select jobid, jobname, schedule, active from cron.job;
-- Verify runs are succeeding (job status + actual HTTP response):
--   select j.jobname, d.status, d.return_message, d.start_time
--     from cron.job_run_details d join cron.job j on j.jobid = d.jobid
--     order by d.start_time desc limit 10;
--   select status_code, content, error_msg, created from net._http_response order by created desc limit 5;
