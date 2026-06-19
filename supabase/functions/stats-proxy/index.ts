import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APISPORTS_KEY = Deno.env.get('APISPORTS_KEY')
if (!APISPORTS_KEY) throw new Error('APISPORTS_KEY environment secret is not set')
const API_HOST = 'v3.football.api-sports.io'
const LEAGUE = 1
const SEASON = 2026

// API-Football names that differ from our DB names
const TEAM_ALIAS: Record<string, string> = {
  'Türkiye': 'Turkey', 'Cape Verde Islands': 'Cape Verde', 'Congo DR': 'DR Congo',
}
const norm = (n: string) => TEAM_ALIAS[n] ?? n

interface ApiPlayerStat {
  player: { name: string }
  statistics: { team: { name: string }; goals: { total: number | null; assists: number | null }; cards: { yellow: number | null; red: number | null } }[]
}

interface Row { player: string; team: string; goals: number; assists: number; yellow: number; red: number }

const apiFetch = (path: string) =>
  fetch(`https://${API_HOST}/${path}`, { headers: { 'x-apisports-key': APISPORTS_KEY } })

async function fetchStat(endpoint: string): Promise<ApiPlayerStat[]> {
  const res = await apiFetch(`players/${endpoint}?league=${LEAGUE}&season=${SEASON}`)
  if (!res.ok) return []
  const { response } = await res.json() as { response: ApiPlayerStat[] }
  return Array.isArray(response) ? response : []
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  const [scorers, assists, yellows, reds] = await Promise.all([
    fetchStat('topscorers'),
    fetchStat('topassists'),
    fetchStat('topyellowcards'),
    fetchStat('topredcards'),
  ])

  // Merge all four lists keyed by player name
  const rows = new Map<string, Row>()
  const get = (s: ApiPlayerStat): Row => {
    const team = norm(s.statistics?.[0]?.team?.name ?? '')
    const key = s.player.name
    let r = rows.get(key)
    if (!r) { r = { player: s.player.name, team, goals: 0, assists: 0, yellow: 0, red: 0 }; rows.set(key, r) }
    if (!r.team && team) r.team = team
    return r
  }

  for (const s of scorers) get(s).goals   = s.statistics?.[0]?.goals?.total   ?? 0
  for (const s of assists) get(s).assists = s.statistics?.[0]?.goals?.assists ?? 0
  for (const s of yellows) get(s).yellow  = s.statistics?.[0]?.cards?.yellow  ?? 0
  for (const s of reds)    get(s).red     = s.statistics?.[0]?.cards?.red     ?? 0

  return json({ data: [...rows.values()] })
})
