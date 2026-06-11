import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const APISPORTS_KEY = Deno.env.get('APISPORTS_KEY') ?? '872ee48ce93458599691cffe5e72ed01'
const API_HOST = 'v3.football.api-sports.io'
const LEAGUE = 1      // FIFA World Cup
const SEASON = 2026

// API-Football team names that differ from our DB names
const TEAM_ALIAS: Record<string, string> = {
  'Türkiye': 'Turkey',
  'Cape Verde Islands': 'Cape Verde',
  'Congo DR': 'DR Congo',
}
const norm = (n: string) => TEAM_ALIAS[n] ?? n

interface Goal {
  name: string
  minute: number
  penalty?: boolean
  owngoal?: boolean
}

interface ApiFixture {
  fixture: { id: number; status: { short: string } }
  teams: { home: { id: number; name: string }; away: { id: number; name: string } }
  goals: { home: number | null; away: number | null }
}

interface ApiEvent {
  time: { elapsed: number | null; extra: number | null }
  team: { id: number; name: string }
  player: { id: number | null; name: string | null }
  type: string
  detail: string
}

// FT/AET/PEN = finished ; in-play codes = live ; everything else = scheduled
const FINISHED = new Set(['FT', 'AET', 'PEN'])
const LIVE = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'SUSP', 'INT'])
function mapStatus(short: string): 'finished' | 'live' | 'scheduled' {
  if (FINISHED.has(short)) return 'finished'
  if (LIVE.has(short)) return 'live'
  return 'scheduled'
}

const apiFetch = (path: string) =>
  fetch(`https://${API_HOST}/${path}`, {
    headers: { 'x-apisports-key': APISPORTS_KEY },
  })

// Build goal lists for both sides from a fixture's events.
// Own goals are credited to the opposing (beneficiary) side.
async function fetchGoals(fixtureId: number, homeTeamId: number): Promise<{ home: Goal[]; away: Goal[] } | null> {
  const res = await apiFetch(`fixtures/events?fixture=${fixtureId}`)
  if (!res.ok) return null
  const { response }: { response: ApiEvent[] } = await res.json()
  if (!Array.isArray(response)) return null

  const home: Goal[] = []
  const away: Goal[] = []
  for (const e of response) {
    if (e.type !== 'Goal' || e.detail === 'Missed Penalty') continue
    const owngoal = e.detail === 'Own Goal'
    const scoredByHome = e.team.id === homeTeamId
    // own goal counts for the other team
    const side = owngoal ? !scoredByHome : scoredByHome
    const g: Goal = {
      name: e.player?.name ?? '',
      minute: (e.time?.elapsed ?? 0) + (e.time?.extra ?? 0),
      ...(e.detail === 'Penalty' ? { penalty: true } : {}),
      ...(owngoal ? { owngoal: true } : {}),
    }
    ;(side ? home : away).push(g)
  }
  return { home, away }
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Skip the external API entirely outside match windows (saves quota)
  const { data: active } = await supabase.rpc('matches_in_active_window')
  if (!active) {
    return new Response(JSON.stringify({ skipped: true, reason: 'no match in active window' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // One bulk call gives scores + status for all fixtures
  const apiRes = await apiFetch(`fixtures?league=${LEAGUE}&season=${SEASON}`)
  if (!apiRes.ok) {
    return new Response(JSON.stringify({ error: 'API fetch failed', status: apiRes.status }), {
      status: 502, headers: { 'Content-Type': 'application/json' },
    })
  }
  const { response: fixtures }: { response: ApiFixture[] } = await apiRes.json()

  // DB rows: id == fixture.id since the ID migration. We still need home_team
  // to detect orientation, and goals_home to know if a finished match is backfilled.
  const { data: dbMatches, error: dbErr } = await supabase
    .from('matches')
    .select('id, home_team, away_team, goals_home, live_status')
  if (dbErr) {
    return new Response(JSON.stringify({ error: dbErr.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
  const byId = new Map((dbMatches ?? []).map(m => [Number(m.id), m]))

  const upserts: Record<string, unknown>[] = []

  for (const fx of fixtures) {
    const db = byId.get(fx.fixture.id)
    if (!db) continue

    const status = mapStatus(fx.fixture.status.short)
    const upsert: Record<string, unknown> = { id: fx.fixture.id, live_status: status }

    // Orientation: our home_team may be the API away team (matched by sorted pair)
    const flipped = norm(fx.teams.home.name) !== db.home_team

    if (fx.goals.home !== null && fx.goals.away !== null) {
      upsert.result_home = flipped ? fx.goals.away : fx.goals.home
      upsert.result_away = flipped ? fx.goals.home : fx.goals.away

      // Fetch scorer events when live, or to backfill a freshly finished match
      const hasGoalsStored = Array.isArray(db.goals_home) && db.goals_home.length > 0
      const needGoals = status === 'live' || (status === 'finished' && !hasGoalsStored)
      const anyGoals = (fx.goals.home + fx.goals.away) > 0
      if (needGoals && anyGoals) {
        const g = await fetchGoals(fx.fixture.id, fx.teams.home.id)
        if (g) {
          upsert.goals_home = flipped ? g.away : g.home
          upsert.goals_away = flipped ? g.home : g.away
        }
      }
    }

    upserts.push(upsert)
  }

  if (!upserts.length) {
    return new Response(JSON.stringify({ synced: 0, message: 'No matches to update' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { error: upsertErr } = await supabase
    .from('matches')
    .upsert(upserts, { onConflict: 'id' })
  if (upsertErr) {
    return new Response(JSON.stringify({ error: upsertErr.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ synced: upserts.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
