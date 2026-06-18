-- Store the live minute of in-play matches, fetched from API-Football
-- (fixture.status.elapsed / .extra) by the sync-wc26 edge function. Lets the
-- UI show roughly which minute a live match is at (e.g. 42' or 45+2').
-- NULL for scheduled/finished matches.
alter table public.matches
  add column if not exists live_minute integer,
  add column if not exists live_extra  integer;
