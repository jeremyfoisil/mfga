-- Cotes pré-match (et pendant/après) du bookmaker Unibet (API-Sports id=16),
-- pari "Match Winner" (bet id=1), écrites par l'edge function sync-odds.
-- Orientées comme la DB : odds_home correspond à home_team. NULL = indisponible.
alter table public.matches
  add column if not exists odds_home numeric(6,2),
  add column if not exists odds_draw numeric(6,2),
  add column if not exists odds_away numeric(6,2);
