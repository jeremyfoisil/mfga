-- Add the matches table to the realtime publication so live score updates
-- are broadcast to subscribed clients (src/stores/app.ts subscribes to
-- postgres_changes on public.matches). Without this, scores only refreshed
-- on a full page reload.
alter publication supabase_realtime add table public.matches;
