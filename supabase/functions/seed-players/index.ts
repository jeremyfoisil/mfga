import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APISPORTS_KEY = Deno.env.get('APISPORTS_KEY') ?? '872ee48ce93458599691cffe5e72ed01'
const API_HOST = 'v3.football.api-sports.io'

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

const SQUAD_POS: Record<string, string> = {
  Goalkeeper: 'GK', Defender: 'DEF', Midfielder: 'MID', Attacker: 'FWD',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

  // /players/squads occasionally returns an empty array; retry a few times.
  async function fetchSquad(id: number): Promise<{ id: number; name: string; position: string }[]> {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(`https://${API_HOST}/players/squads?team=${id}`, {
          headers: { 'x-apisports-key': APISPORTS_KEY },
        })
        if (res.ok) {
          const { response } = await res.json() as {
            response: { players: { id: number; name: string; position: string }[] }[]
          }
          const squad = response?.[0]?.players ?? []
          if (squad.length) return squad
        }
      } catch { /* retry */ }
      await sleep(400)
    }
    return []
  }

  const players: { api_id: number; name: string; team: string; position: string }[] = []
  const emptyTeams: string[] = []

  for (const [team, id] of Object.entries(TEAM_ID)) {
    const squad = await fetchSquad(id)
    if (!squad.length) { emptyTeams.push(team); continue }
    for (const p of squad) {
      players.push({ api_id: p.id, name: p.name, team, position: SQUAD_POS[p.position] ?? 'MID' })
    }
  }

  // Abort without wiping if the data is clearly incomplete
  if (emptyTeams.length > 3) {
    return json({ error: 'Too many empty squads, aborting to avoid data loss', emptyTeams }, 502)
  }

  // Truncate and re-insert
  await supabase.from('players').delete().neq('id', 0)
  const { error: insertErr } = await supabase.from('players').insert(players)
  if (insertErr) return json({ error: insertErr.message }, 500)

  return json({ inserted: players.length, teams: 48 - emptyTeams.length, emptyTeams })
})
