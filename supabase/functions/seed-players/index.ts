import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RAPIDAPI_KEY  = Deno.env.get('RAPIDAPI_KEY') ?? '4f5231439dmshc22c83b5cde5ef3p1d9c86jsn739feb141fa8'
const RAPIDAPI_HOST = 'wc26-live-football-api.p.rapidapi.com'

const HEADERS = { 'x-rapidapi-host': RAPIDAPI_HOST, 'x-rapidapi-key': RAPIDAPI_KEY }

type RawPos = 'Goalkeeper' | 'Defender' | 'Midfielder' | 'Forward'
const POS_MAP: Record<RawPos, string> = {
  Goalkeeper: 'GK', Defender: 'DEF', Midfielder: 'MID', Forward: 'FWD',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Get all unique teams from matches table
  const { data: matches, error: matchErr } = await supabase
    .from('matches')
    .select('home_team, away_team')
  if (matchErr) return json({ error: matchErr.message }, 500)

  const teams = new Set<string>()
  for (const m of matches ?? []) {
    if (m.home_team) teams.add(m.home_team)
    if (m.away_team) teams.add(m.away_team)
  }

  // Fetch squad for each team
  const players: { name: string; team: string; position: string }[] = []
  let fetched = 0, failed = 0

  for (const team of teams) {
    try {
      const res = await fetch(
        `https://${RAPIDAPI_HOST}/squad/${encodeURIComponent(team)}`,
        { headers: HEADERS },
      )
      if (!res.ok) { failed++; continue }
      const { data } = await res.json() as { data: { name: string; position: RawPos }[] }
      for (const p of data ?? []) {
        players.push({ name: p.name, team, position: POS_MAP[p.position] ?? p.position })
      }
      fetched++
    } catch { failed++ }
  }

  if (!players.length) return json({ error: 'No players fetched', fetched, failed }, 500)

  // Truncate and re-insert
  await supabase.from('players').delete().neq('id', 0)
  const { error: insertErr } = await supabase.from('players').insert(players)
  if (insertErr) return json({ error: insertErr.message }, 500)

  return json({ inserted: players.length, teams: fetched, failed })
})
