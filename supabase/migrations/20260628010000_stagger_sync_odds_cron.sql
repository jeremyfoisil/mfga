-- Décale sync-odds-daily de 06:00 → 06:30 UTC pour éviter la course avec
-- sync-schedule-daily (06:00) : un nouveau round KO inséré par sync-schedule
-- doit être présent en base AVANT que sync-odds ne tourne, sinon ses cotes
-- n'arrivent que le lendemain (sync-odds ignore les fixtures absentes de la DB).
-- cron.schedule upsert par nom de job → réécrit l'horaire existant.
select cron.schedule(
  'sync-odds-daily',
  '30 6 * * *',
  $$
  select net.http_post(
    url := 'https://sazupuqxwrnvgzsdxkjg.supabase.co/functions/v1/sync-odds',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
