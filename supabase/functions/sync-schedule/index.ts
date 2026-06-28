import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const APISPORTS_KEY = Deno.env.get('APISPORTS_KEY')
if (!APISPORTS_KEY) throw new Error('APISPORTS_KEY environment secret is not set')
const API_HOST = 'v3.football.api-sports.io'
const LEAGUE = 1
const SEASON = 2026

// Mêmes alias que sync-wc26 / sync-odds : noms API-Football qui diffèrent de notre DB (anglais).
const TEAM_ALIAS: Record<string, string> = {
  'Türkiye': 'Turkey',
  'Cape Verde Islands': 'Cape Verde',
  'Congo DR': 'DR Congo',
  'Czechia': 'Czech Republic',
}
const norm = (n: string) => TEAM_ALIAS[n] ?? n

// league.round api-sports → code de stage KO. null pour la phase de poules ou un round inconnu.
function roundToStage(round: string): string | null {
  const r = round.toLowerCase()
  if (r.startsWith('group')) return null
  if (r.includes('round of 32')) return 'r32'
  if (r.includes('round of 16')) return 'r16'
  if (r.includes('quarter')) return 'qf'
  if (r.includes('semi')) return 'sf'
  if (r.includes('3rd place') || r.includes('third place')) return '3rd'
  if (r.includes('final')) return 'final' // après les exclusions ci-dessus
  return null
}

// Nom d'équipe encore indéterminé (placeholder de tableau, ex. "Winner Group A", "W73") ?
function isPlaceholder(name: string | null | undefined): boolean {
  if (!name) return true
  return /^(winner|loser|w\d|l\d|\d)/i.test(name.trim())
}

interface ApiFixture {
  fixture: { id: number; date: string; venue: { name: string | null } | null }
  league: { round: string }
  teams: { home: { name: string | null }; away: { name: string | null } }
}

// ISO "2026-06-28T19:00:00+00:00" → { date:"2026-06-28", time:"19:00:00+00" }
function splitIso(iso: string): { date: string; time: string } | null {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):\d{2}([+-]\d{2}):?\d{2}/)
  if (!m) return null
  return { date: m[1], time: `${m[2]}:${m[3]}:00${m[4]}` }
}

const apiFetch = (path: string) =>
  fetch(`https://${API_HOST}/${path}`, { headers: { 'x-apisports-key': APISPORTS_KEY } })

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const apiRes = await apiFetch(`fixtures?league=${LEAGUE}&season=${SEASON}`)
  if (!apiRes.ok) {
    return new Response(JSON.stringify({ error: 'fixtures fetch failed', status: apiRes.status }), {
      status: 502, headers: { 'Content-Type': 'application/json' },
    })
  }
  const { response: fixtures }: { response: ApiFixture[] } = await apiRes.json()

  const rows: Record<string, unknown>[] = []
  let skippedUnknownRound = 0

  for (const fx of fixtures) {
    const round = fx.league?.round ?? ''
    const stage = roundToStage(round)
    if (stage === null) {
      // poule → ignoré silencieusement ; round KO inconnu → compté pour diagnostic
      if (!round.toLowerCase().startsWith('group')) skippedUnknownRound++
      continue
    }

    const when = splitIso(fx.fixture?.date ?? '')
    const homeName = fx.teams?.home?.name ?? null
    const awayName = fx.teams?.away?.name ?? null
    const homeKnown = !isPlaceholder(homeName)
    const awayKnown = !isPlaceholder(awayName)

    rows.push({
      id: fx.fixture.id,
      stage,
      group_id: null,
      home_team:  homeKnown ? norm(homeName!) : null,
      away_team:  awayKnown ? norm(awayName!) : null,
      home_label: homeKnown ? null : (homeName || '?'),
      away_label: awayKnown ? null : (awayName || '?'),
      match_date: when?.date ?? null,
      match_time: when?.time ?? null,
      venue: fx.fixture?.venue?.name ?? null,
    })
  }

  for (let i = 0; i < rows.length; i += 50) {
    const { error } = await supabase.from('matches').upsert(rows.slice(i, i + 50), { onConflict: 'id' })
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  return new Response(JSON.stringify({ synced: rows.length, skippedUnknownRound }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
