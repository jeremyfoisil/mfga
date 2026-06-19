-- Accent- and case-insensitive player name search.
-- "tchouameni" matches "Tchouaméni", "dembele" matches "Dembélé", etc.
-- The players table exceeds PostgREST's 1000-row page cap, so filtering runs
-- server-side via this RPC rather than loading every row to the client.

create extension if not exists unaccent with schema extensions;

create or replace function public.search_players(q text)
returns table (name text, team text, api_id bigint)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select p.name, p.team, p.api_id
  from public.players p
  where extensions.unaccent(p.name) ilike '%' || extensions.unaccent(q) || '%'
  order by p.name
  limit 8
$$;

grant execute on function public.search_players(text) to anon, authenticated;
