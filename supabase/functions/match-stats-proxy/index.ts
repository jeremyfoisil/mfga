import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APISPORTS_KEY = Deno.env.get('APISPORTS_KEY') ?? '872ee48ce93458599691cffe5e72ed01'
const API_HOST = 'v3.football.api-sports.io'

// API-Football names that differ from our DB names (kept in sync with squad-proxy)
const TEAM_ALIAS: Record<string, string> = {
  'Türkiye': 'Turkey', 'Cape Verde Islands': 'Cape Verde', 'Congo DR': 'DR Congo',
}
const norm = (n: string) => TEAM_ALIAS[n] ?? n

const apiFetch = (path: string) =>
  fetch(`https://${API_HOST}/${path}`, { headers: { 'x-apisports-key': APISPORTS_KEY } })

type ApiVal = number | string | null
interface ApiTeamStats {
  team: { id: number; name: string }
  statistics: { type: string; value: ApiVal }[]
}

type Kind = 'percent' | 'number'
interface StatLine { key: string; label: string; home: number; away: number; kind: Kind }

// Curated set + display order. `type` is the API-Football statistic label.
const SPEC: { key: string; label: string; type: string; kind: Kind }[] = [
  { key: 'possession',  label: 'Possession',     type: 'Ball Possession', kind: 'percent' },
  { key: 'shots_total', label: 'Tirs',           type: 'Total Shots',     kind: 'number'  },
  { key: 'shots_on',    label: 'Tirs cadrés',    type: 'Shots on Goal',   kind: 'number'  },
  { key: 'corners',     label: 'Corners',        type: 'Corner Kicks',    kind: 'number'  },
  { key: 'fouls',       label: 'Fautes',         type: 'Fouls',           kind: 'number'  },
  { key: 'offsides',    label: 'Hors-jeu',       type: 'Offsides',        kind: 'number'  },
  { key: 'yellow',      label: 'Cartons jaunes', type: 'Yellow Cards',    kind: 'number'  },
  { key: 'red',         label: 'Cartons rouges', type: 'Red Cards',       kind: 'number'  },
  { key: 'xg',          label: 'xG',             type: 'expected_goals',  kind: 'number'  },
]

// "55%" -> 55, "1.8" -> 1.8, null -> 0
function numVal(v: ApiVal): number {
  if (v == null) return 0
  if (typeof v === 'number') return v
  const n = parseFloat(String(v).replace('%', '').trim())
  return isNaN(n) ? 0 : n
}

function typeMap(entry: ApiTeamStats): Map<string, ApiVal> {
  const m = new Map<string, ApiVal>()
  for (const s of entry.statistics ?? []) m.set(s.type, s.value)
  return m
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  const { matchId, home } = await req.json() as { matchId?: number; home?: string; away?: string }
  if (!matchId) return json({ error: 'matchId required' }, 400)

  const res = await apiFetch(`fixtures/statistics?fixture=${matchId}`)
  if (!res.ok) return json({ data: [] })
  const { response } = await res.json() as { response: ApiTeamStats[] }
  if (!Array.isArray(response) || response.length < 2) return json({ data: [] })

  // API returns [home, away] in fixture order; flip if it disagrees with our home.
  let [homeEntry, awayEntry] = response
  if (home && norm(homeEntry.team.name) !== home && norm(awayEntry.team.name) === home) {
    [homeEntry, awayEntry] = [awayEntry, homeEntry]
  }
  const homeMap = typeMap(homeEntry)
  const awayMap = typeMap(awayEntry)

  const data: StatLine[] = []
  for (const s of SPEC) {
    const hRaw = homeMap.get(s.type)
    const aRaw = awayMap.get(s.type)
    if (hRaw === undefined && aRaw === undefined) continue // absent both sides
    const homeN = numVal(hRaw ?? null)
    const awayN = numVal(aRaw ?? null)
    if (s.key === 'xg' && homeN === 0 && awayN === 0) continue // xG absent/zero both sides
    data.push({ key: s.key, label: s.label, home: homeN, away: awayN, kind: s.kind })
  }

  return json({ data })
})
