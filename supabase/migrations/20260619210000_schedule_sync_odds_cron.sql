-- Rafraîchit quotidiennement les cotes Unibet via l'edge function sync-odds.
-- Calqué sur le job sync-wc26-every-minute. 06:00 UTC.
select cron.schedule(
  'sync-odds-daily',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://sazupuqxwrnvgzsdxkjg.supabase.co/functions/v1/sync-odds',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
