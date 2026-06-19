import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APISPORTS_KEY = Deno.env.get('APISPORTS_KEY') ?? '872ee48ce93458599691cffe5e72ed01'
const API_HOST = 'v3.football.api-sports.io'
const LEAGUE = 1
const SEASON = 2026

interface ApiPlayer {
  player: {
    name: string; age: number | null; nationality: string | null
    height: string | null; weight: string | null; injured: boolean; photo: string | null
  }
  statistics: ApiStat[]
}
interface ApiStat {
  league: { id: number }
  games: { appearences: number | null; lineups: number | null; minutes: number | null; position: string | null; rating: string | null }
  shots: { total: number | null; on: number | null }
  goals: { total: number | null; assists: number | null }
  passes: { total: number | null; key: number | null; accuracy: number | null }
  tackles: { total: number | null; blocks: number | null; interceptions: number | null }
  duels: { total: number | null; won: number | null }
  dribbles: { attempts: number | null; success: number | null }
  fouls: { drawn: number | null; committed: number | null }
  cards: { yellow: number | null; yellowred: number | null; red: number | null }
  penalty: { won: number | null; scored: number | null; missed: number | null }
}

const apiFetch = (path: string) =>
  fetch(`https://${API_HOST}/${path}`, { headers: { 'x-apisports-key': APISPORTS_KEY } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  let apiId: unknown
  try { apiId = (await req.json())?.apiId } catch { /* no/invalid body */ }
  if (typeof apiId !== 'number') return json({ error: 'apiId (number) required' }, 400)

  let api: ApiPlayer | undefined
  try {
    const res = await apiFetch(`players?id=${apiId}&league=${LEAGUE}&season=${SEASON}`)
    if (res.ok) {
      const { response } = await res.json() as { response: ApiPlayer[] }
      api = Array.isArray(response) ? response[0] : undefined
    }
  } catch { /* fall through to null */ }

  if (!api) return json({ data: null })

  // Ligne de stats WC26 (league 1) ; repli sur la seule ligne présente.
  const stat = api.statistics.find(s => s.league?.id === LEAGUE) ?? api.statistics[0]
  if (!stat) return json({ data: null })

  const data = {
    profile: {
      name: api.player.name,
      photo: api.player.photo,
      age: api.player.age,
      nationality: api.player.nationality,
      height: api.player.height,
      weight: api.player.weight,
      injured: api.player.injured,
    },
    stats: {
      appearances: stat.games?.appearences ?? 0,
      lineups: stat.games?.lineups ?? 0,
      minutes: stat.games?.minutes ?? 0,
      position: stat.games?.position ?? '',
      rating: stat.games?.rating ?? null,
      shotsTotal: stat.shots?.total ?? null,
      shotsOn: stat.shots?.on ?? null,
      goals: stat.goals?.total ?? 0,
      assists: stat.goals?.assists ?? 0,
      passesTotal: stat.passes?.total ?? null,
      passesKey: stat.passes?.key ?? null,
      passesAccuracy: stat.passes?.accuracy ?? null,
      dribblesAttempts: stat.dribbles?.attempts ?? null,
      dribblesSuccess: stat.dribbles?.success ?? null,
      tacklesTotal: stat.tackles?.total ?? null,
      interceptions: stat.tackles?.interceptions ?? null,
      blocks: stat.tackles?.blocks ?? null,
      duelsTotal: stat.duels?.total ?? null,
      duelsWon: stat.duels?.won ?? null,
      foulsDrawn: stat.fouls?.drawn ?? null,
      foulsCommitted: stat.fouls?.committed ?? null,
      yellow: stat.cards?.yellow ?? 0,
      red: (stat.cards?.red ?? 0) + (stat.cards?.yellowred ?? 0),
      penWon: stat.penalty?.won ?? null,
      penScored: stat.penalty?.scored ?? null,
      penMissed: stat.penalty?.missed ?? null,
    },
  }

  return json({ data })
})
