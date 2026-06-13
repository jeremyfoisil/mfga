import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APISPORTS_KEY = Deno.env.get('APISPORTS_KEY') ?? '872ee48ce93458599691cffe5e72ed01'
const API_HOST = 'v3.football.api-sports.io'
const LEAGUE = 1
const SEASON = 2026

// API-Football names that differ from our DB names (kept in sync with the other proxies)
const TEAM_ALIAS: Record<string, string> = {
  'Türkiye': 'Turkey', 'Cape Verde Islands': 'Cape Verde', 'Congo DR': 'DR Congo',
}
const norm = (n: string) => TEAM_ALIAS[n] ?? n

const apiFetch = (path: string) =>
  fetch(`https://${API_HOST}/${path}`, { headers: { 'x-apisports-key': APISPORTS_KEY } })

interface ApiStandingRow {
  rank: number
  team: { id: number; name: string }
  points: number
  goalsDiff: number
  group: string
  all: { played: number; win: number; draw: number; lose: number }
}

interface StandingRow {
  rank: number; team: string; played: number; win: number; draw: number; lose: number; diff: number; points: number
}
interface GroupStanding { group: string; rows: StandingRow[] }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  const res = await apiFetch(`standings?league=${LEAGUE}&season=${SEASON}`)
  if (!res.ok) return json({ data: [] })
  const { response } = await res.json() as { response: { league?: { standings?: ApiStandingRow[][] } }[] }
  const groups = response?.[0]?.league?.standings
  if (!Array.isArray(groups) || groups.length === 0) return json({ data: [] })

  const data: GroupStanding[] = groups
    // API-Football appends a spurious all-zero "Group Stage" bucket alongside the
    // real "Group A".."Group L" — keep only single-letter group labels.
    .filter(rows => /^Group\s+[A-Z]$/i.test(rows[0]?.group ?? ''))
    .map(rows => ({
    group: (rows[0]?.group ?? '').replace(/^Group\s+/i, ''),
    rows: rows.map(r => ({
      rank: r.rank,
      team: norm(r.team.name),
      played: r.all.played,
      win: r.all.win,
      draw: r.all.draw,
      lose: r.all.lose,
      diff: r.goalsDiff,
      points: r.points,
    })),
  }))

  return json({ data })
})
