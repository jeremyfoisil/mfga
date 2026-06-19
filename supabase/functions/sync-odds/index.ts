import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const APISPORTS_KEY = Deno.env.get('APISPORTS_KEY')
if (!APISPORTS_KEY) throw new Error('APISPORTS_KEY environment secret is not set')
const API_HOST = 'v3.football.api-sports.io'
const LEAGUE = 1
const SEASON = 2026
const BOOKMAKER = 16 // Unibet
const BET = 1        // Match Winner

// Mêmes alias que sync-wc26 : noms API-Football qui diffèrent de notre DB.
const TEAM_ALIAS: Record<string, string> = {
  'Türkiye': 'Turkey',
  'Cape Verde Islands': 'Cape Verde',
  'Congo DR': 'DR Congo',
  'Czechia': 'Czech Republic',
}
const norm = (n: string) => TEAM_ALIAS[n] ?? n

const apiFetch = (path: string) =>
  fetch(`https://${API_HOST}/${path}`, { headers: { 'x-apisports-key': APISPORTS_KEY } })

interface ApiFixture {
  fixture: { id: number }
  teams: { home: { name: string }; away: { name: string } }
}
interface OddValue { value: string; odd: string }
interface Bet { id: number; name: string; values: OddValue[] }
interface Bookmaker { id: number; name: string; bets: Bet[] }
interface OddsEntry { fixture: { id: number }; bookmakers: Bookmaker[] }

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // 1. Nos matchs : id + home_team pour l'orientation
  const { data: dbMatches, error: dbErr } = await supabase
    .from('matches').select('id, home_team').limit(2000)
  if (dbErr) {
    return new Response(JSON.stringify({ error: dbErr.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
  const homeById = new Map((dbMatches ?? []).map(m => [Number(m.id), m.home_team as string | null]))

  // 2. Orientation : la réponse /odds ne porte pas les noms d'équipes,
  //    on récupère l'équipe domicile API par fixture pour détecter le flip.
  const fxRes = await apiFetch(`fixtures?league=${LEAGUE}&season=${SEASON}`)
  if (!fxRes.ok) {
    return new Response(JSON.stringify({ error: 'fixtures fetch failed', status: fxRes.status }), {
      status: 502, headers: { 'Content-Type': 'application/json' },
    })
  }
  const { response: fixtures }: { response: ApiFixture[] } = await fxRes.json()
  const apiHomeById = new Map(fixtures.map(f => [f.fixture.id, norm(f.teams.home.name)]))

  // 3. Cotes paginées (filtrées bookmaker + bet côté API)
  const rows: Record<string, unknown>[] = []
  let page = 1
  let totalPages = 1
  do {
    const res = await apiFetch(`odds?league=${LEAGUE}&season=${SEASON}&bookmaker=${BOOKMAKER}&bet=${BET}&page=${page}`)
    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'odds fetch failed', status: res.status, page }), {
        status: 502, headers: { 'Content-Type': 'application/json' },
      })
    }
    const json: { response: OddsEntry[]; paging?: { current: number; total: number } } = await res.json()
    totalPages = json.paging?.total ?? 1

    for (const entry of json.response ?? []) {
      const id = entry.fixture.id
      if (!homeById.has(id)) continue // fixture inconnu de notre DB

      const bet = entry.bookmakers?.[0]?.bets?.[0]
      if (!bet?.values?.length) continue

      const find = (v: string) => bet.values.find(x => x.value === v)?.odd
      const home = parseFloat(find('Home') ?? '')
      const draw = parseFloat(find('Draw') ?? '')
      const away = parseFloat(find('Away') ?? '')
      // N'écrire que si les trois cotes sont valides (jamais de NULL involontaire)
      if (!Number.isFinite(home) || !Number.isFinite(draw) || !Number.isFinite(away)) continue

      const flipped = apiHomeById.get(id) !== undefined && apiHomeById.get(id) !== homeById.get(id)
      rows.push({
        id,
        odds_home: flipped ? away : home,
        odds_draw: draw,
        odds_away: flipped ? home : away,
      })
    }
    page++
  } while (page <= totalPages)

  // 4. Upsert par lots, clés homogènes (id + 3 colonnes odds uniquement)
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase.from('matches').upsert(rows.slice(i, i + 100), { onConflict: 'id' })
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  return new Response(JSON.stringify({ synced: rows.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
