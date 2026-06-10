import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RAPIDAPI_KEY  = Deno.env.get('RAPIDAPI_KEY') ?? '4f5231439dmshc22c83b5cde5ef3p1d9c86jsn739feb141fa8'
const RAPIDAPI_HOST = 'wc26-live-football-api.p.rapidapi.com'

type RawPosition = 'Goalkeeper' | 'Defender' | 'Midfielder' | 'Forward'
type Position    = 'GK' | 'DEF' | 'MID' | 'FWD'

const POS: Record<RawPosition, Position> = {
  Goalkeeper: 'GK', Defender: 'DEF', Midfielder: 'MID', Forward: 'FWD',
}

interface Player { name: string; position: Position }
interface TeamData { name: string; players: Player[] }

async function fetchSquad(team: string): Promise<Player[]> {
  const res = await fetch(
    `https://${RAPIDAPI_HOST}/squad/${encodeURIComponent(team)}`,
    { headers: { 'x-rapidapi-host': RAPIDAPI_HOST, 'x-rapidapi-key': RAPIDAPI_KEY } },
  )
  if (!res.ok) return []
  const { data } = await res.json() as { data: { name: string; position: RawPosition }[] }
  return (data || []).map(p => ({ name: p.name, position: POS[p.position] ?? 'MID' }))
}

async function fetchLineup(matchId: number): Promise<{ home: TeamData; away: TeamData } | null> {
  try {
    const res = await fetch(
      `https://${RAPIDAPI_HOST}/lineup/${matchId}`,
      { headers: { 'x-rapidapi-host': RAPIDAPI_HOST, 'x-rapidapi-key': RAPIDAPI_KEY } },
    )
    if (!res.ok) return null
    const json = await res.json()
    if (!json?.home?.players?.length && !json?.data?.home?.players?.length) return null
    const d = json.data ?? json
    if (!d.home || !d.away) return null
    const mapPlayer = (p: Record<string, unknown>): Player => ({
      name: String(p.name ?? p.player ?? ''),
      position: POS[(p.position as RawPosition)] ?? 'MID',
    })
    return {
      home: { name: String(d.home.team ?? ''), players: (d.home.players as Record<string, unknown>[]).map(mapPlayer) },
      away: { name: String(d.away.team ?? ''), players: (d.away.players as Record<string, unknown>[]).map(mapPlayer) },
    }
  } catch { return null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  const { home, away, matchId } = await req.json() as { home: string; away: string; matchId?: number }

  if (!home || !away) return json({ error: 'home and away required' }, 400)

  if (matchId) {
    const lineup = await fetchLineup(matchId)
    if (lineup) return json({ source: 'lineup', ...lineup })
  }

  const [homePlayers, awayPlayers] = await Promise.all([fetchSquad(home), fetchSquad(away)])
  return json({ source: 'squad', home: { name: home, players: homePlayers }, away: { name: away, players: awayPlayers } })
})
