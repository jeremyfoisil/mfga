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
  assist?: string
}

interface Card {
  name: string
  minute: number
  red?: boolean
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
  assist: { id: number | null; name: string | null }
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

interface Events {
  goalsHome: Goal[]; goalsAway: Goal[]
  cardsHome: Card[]; cardsAway: Card[]
}

// Build goal + card lists for both sides from a fixture's events.
// Own goals are credited to the opposing (beneficiary) side.
async function fetchEvents(fixtureId: number, homeTeamId: number): Promise<Events | null> {
  const res = await apiFetch(`fixtures/events?fixture=${fixtureId}`)
  if (!res.ok) return null
  const { response }: { response: ApiEvent[] } = await res.json()
  if (!Array.isArray(response)) return null

  const ev: Events = { goalsHome: [], goalsAway: [], cardsHome: [], cardsAway: [] }
  for (const e of response) {
    const byHome = e.team.id === homeTeamId
    const minute = (e.time?.elapsed ?? 0) + (e.time?.extra ?? 0)

    if (e.type === 'Goal' && e.detail !== 'Missed Penalty') {
      const owngoal = e.detail === 'Own Goal'
      const side = owngoal ? !byHome : byHome // own goal counts for the other team
      const g: Goal = {
        name: e.player?.name ?? '',
        minute,
        ...(e.detail === 'Penalty' ? { penalty: true } : {}),
        ...(owngoal ? { owngoal: true } : {}),
        ...(e.assist?.name ? { assist: e.assist.name } : {}),
      }
      ;(side ? ev.goalsHome : ev.goalsAway).push(g)
    } else if (e.type === 'Card') {
      const c: Card = {
        name: e.player?.name ?? '',
        minute,
        ...(e.detail === 'Yellow Card' ? {} : { red: true }), // Red Card / Second Yellow = red
      }
      ;(byHome ? ev.cardsHome : ev.cardsAway).push(c)
    }
  }
  return ev
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
    .select('id, home_team, away_team, goals_home, cards_home, live_status')
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
    }

    // Fetch events (goals + cards) when live, or to backfill a match not yet detailed
    const hasGoals = Array.isArray(db.goals_home) && db.goals_home.length > 0
    const hasCards = Array.isArray(db.cards_home) && db.cards_home.length > 0
    const needEvents = status === 'live' || (status === 'finished' && !hasGoals && !hasCards)
    if (needEvents) {
      const ev = await fetchEvents(fx.fixture.id, fx.teams.home.id)
      if (ev) {
        upsert.goals_home = flipped ? ev.goalsAway : ev.goalsHome
        upsert.goals_away = flipped ? ev.goalsHome : ev.goalsAway
        upsert.cards_home = flipped ? ev.cardsAway : ev.cardsHome
        upsert.cards_away = flipped ? ev.cardsHome : ev.cardsAway
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
