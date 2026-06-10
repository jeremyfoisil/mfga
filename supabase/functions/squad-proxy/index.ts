import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const RAPIDAPI_KEY  = Deno.env.get('RAPIDAPI_KEY')
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
    { headers: { 'x-rapidapi-host': RAPIDAPI_HOST, 'x-rapidapi-key': RAPIDAPI_KEY! } },
  )
  if (!res.ok) return []
  const { data } = await res.json() as { data: { name: string; position: RawPosition }[] }
  return (data || []).map(p => ({ name: p.name, position: POS[p.position] ?? 'MID' }))
}

async function fetchLineup(matchId: number): Promise<{ home: TeamData; away: TeamData } | null> {
  try {
    const res = await fetch(
      `https://${RAPIDAPI_HOST}/lineup/${matchId}`,
      { headers: { 'x-rapidapi-host': RAPIDAPI_HOST, 'x-rapidapi-key': RAPIDAPI_KEY! } },
    )
    if (!res.ok) return null
    const json = await res.json()
    // Guard against "Lineups not available yet" or empty response
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
  if (!RAPIDAPI_KEY) {
    return new Response(JSON.stringify({ error: 'RAPIDAPI_KEY not set' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  const { home, away, matchId } = await req.json() as { home: string; away: string; matchId?: number }

  if (!home || !away) {
    return new Response(JSON.stringify({ error: 'home and away required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  // Try official lineup first (only available on matchday, ~1h before kickoff)
  if (matchId) {
    const lineup = await fetchLineup(matchId)
    if (lineup) {
      return new Response(JSON.stringify({ source: 'lineup', ...lineup }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  // Fallback: squad rosters
  const [homePlayers, awayPlayers] = await Promise.all([fetchSquad(home), fetchSquad(away)])
  return new Response(JSON.stringify({
    source: 'squad',
    home: { name: home, players: homePlayers },
    away: { name: away, players: awayPlayers },
  }), { headers: { 'Content-Type': 'application/json' } })
})
