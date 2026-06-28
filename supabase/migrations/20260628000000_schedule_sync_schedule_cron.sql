-- Sync quotidienne du calendrier de phase finale via l'edge function sync-schedule.
-- 08:00 heure de Paris = 06:00 UTC (CEST = UTC+2). Calqué sur sync-odds-daily.
select cron.schedule(
  'sync-schedule-daily',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://sazupuqxwrnvgzsdxkjg.supabase.co/functions/v1/sync-schedule',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
