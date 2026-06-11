import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APISPORTS_KEY = Deno.env.get('APISPORTS_KEY') ?? '872ee48ce93458599691cffe5e72ed01'
const API_HOST = 'v3.football.api-sports.io'

type Position = 'GK' | 'DEF' | 'MID' | 'FWD'
interface Player { name: string; position: Position }
interface TeamData { name: string; players: Player[] }

// DB team name -> API-Football team id
const TEAM_ID: Record<string, number> = {
  "Algeria":1532,"Argentina":26,"Australia":20,"Austria":775,"Belgium":1,"Bosnia & Herzegovina":1113,
  "Brazil":6,"Canada":5529,"Cape Verde":1533,"Colombia":8,"Croatia":3,"Curaçao":5530,"Czech Republic":770,
  "DR Congo":1508,"Ecuador":2382,"Egypt":32,"England":10,"France":2,"Germany":25,"Ghana":1504,"Haiti":2386,
  "Iran":22,"Iraq":1567,"Ivory Coast":1501,"Japan":12,"Jordan":1548,"Mexico":16,"Morocco":31,"Netherlands":1118,
  "New Zealand":4673,"Norway":1090,"Panama":11,"Paraguay":2380,"Portugal":27,"Qatar":1569,"Saudi Arabia":23,
  "Scotland":1108,"Senegal":13,"South Africa":1531,"South Korea":17,"Spain":9,"Sweden":5,"Switzerland":15,
  "Tunisia":28,"Turkey":777,"USA":2384,"Uruguay":7,"Uzbekistan":1568,
}

// API-Football names that differ from our DB names
const TEAM_ALIAS: Record<string, string> = {
  'Türkiye': 'Turkey', 'Cape Verde Islands': 'Cape Verde', 'Congo DR': 'DR Congo',
}
const norm = (n: string) => TEAM_ALIAS[n] ?? n

// lineup pos codes
const LINEUP_POS: Record<string, Position> = { G: 'GK', D: 'DEF', M: 'MID', F: 'FWD' }
// squad position labels
const SQUAD_POS: Record<string, Position> = {
  Goalkeeper: 'GK', Defender: 'DEF', Midfielder: 'MID', Attacker: 'FWD',
}

const apiFetch = (path: string) =>
  fetch(`https://${API_HOST}/${path}`, { headers: { 'x-apisports-key': APISPORTS_KEY } })

interface LineupTeam {
  team: { id: number; name: string }
  startXI: { player: { name: string; pos: string } }[]
}

async function fetchLineup(fixtureId: number): Promise<{ home: TeamData; away: TeamData } | null> {
  try {
    const res = await apiFetch(`fixtures/lineups?fixture=${fixtureId}`)
    if (!res.ok) return null
    const { response }: { response: LineupTeam[] } = await res.json()
    if (!Array.isArray(response) || response.length < 2) return null

    const toTeam = (lt: LineupTeam): TeamData => ({
      name: norm(lt.team.name),
      players: (lt.startXI ?? []).map(s => ({
        name: s.player.name,
        position: LINEUP_POS[s.player.pos] ?? 'MID',
      })),
    })
    // API returns [home, away] in fixture order
    return { home: toTeam(response[0]), away: toTeam(response[1]) }
  } catch { return null }
}

async function fetchSquad(team: string): Promise<Player[]> {
  const id = TEAM_ID[team]
  if (!id) return []
  const res = await apiFetch(`players/squads?team=${id}`)
  if (!res.ok) return []
  const { response } = await res.json() as {
    response: { players: { name: string; position: string }[] }[]
  }
  const players = response?.[0]?.players ?? []
  return players.map(p => ({ name: p.name, position: SQUAD_POS[p.position] ?? 'MID' }))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  const { home, away, matchId } = await req.json() as { home: string; away: string; matchId?: number }
  if (!home || !away) return json({ error: 'home and away required' }, 400)

  // Official lineup first (available ~30-40 min before kickoff). The fixture's
  // home/away orientation may differ from ours — match by team name.
  if (matchId) {
    const lineup = await fetchLineup(matchId)
    if (lineup && (lineup.home.players.length || lineup.away.players.length)) {
      const flipped = lineup.home.name !== home && lineup.away.name === home
      return json(flipped
        ? { source: 'lineup', home: lineup.away, away: lineup.home }
        : { source: 'lineup', ...lineup })
    }
  }

  // Fallback: full national squads
  const [homePlayers, awayPlayers] = await Promise.all([fetchSquad(home), fetchSquad(away)])
  return json({ source: 'squad', home: { name: home, players: homePlayers }, away: { name: away, players: awayPlayers } })
})
