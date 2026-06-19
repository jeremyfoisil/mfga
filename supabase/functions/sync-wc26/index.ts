import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const APISPORTS_KEY = Deno.env.get('APISPORTS_KEY')
if (!APISPORTS_KEY) throw new Error('APISPORTS_KEY environment secret is not set')
const API_HOST = 'v3.football.api-sports.io'
const LEAGUE = 1      // FIFA World Cup
const SEASON = 2026

// API-Football team names that differ from our DB names
const TEAM_ALIAS: Record<string, string> = {
  'Türkiye': 'Turkey',
  'Cape Verde Islands': 'Cape Verde',
  'Congo DR': 'DR Congo',
  // API-Football spells it "Czechia"; our DB keys on "Czech Republic".
  'Czechia': 'Czech Republic',
}
const norm = (n: string) => TEAM_ALIAS[n] ?? n

interface Goal {
  id?: number
  name: string
  minute: number
  penalty?: boolean
  owngoal?: boolean
  assist?: string
  assistId?: number
}

interface Card {
  id?: number
  name: string
  minute: number
  red?: boolean
}

interface ApiFixture {
  fixture: { id: number; status: { short: string; elapsed: number | null; extra: number | null } }
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
        ...(e.player?.id ? { id: e.player.id } : {}),
        name: e.player?.name ?? '',
        minute,
        ...(e.detail === 'Penalty' ? { penalty: true } : {}),
        ...(owngoal ? { owngoal: true } : {}),
        ...(e.assist?.name ? { assist: e.assist.name } : {}),
        ...(e.assist?.id ? { assistId: e.assist.id } : {}),
      }
      ;(side ? ev.goalsHome : ev.goalsAway).push(g)
    } else if (e.type === 'Card') {
      const c: Card = {
        ...(e.player?.id ? { id: e.player.id } : {}),
        name: e.player?.name ?? '',
        minute,
        ...(e.detail === 'Yellow Card' ? {} : { red: true }), // Red Card / Second Yellow = red
      }
      ;(byHome ? ev.cardsHome : ev.cardsAway).push(c)
    }
  }
  return ev
}

// ── Player-stats aggregation ──────────────────────────────────────────
// Match events to players by API-Football player id (exact). Fallback to
// accent-insensitive last name + team for manual admin entries without ids.
const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
function lastKey(name: string): string {
  const parts = name.trim().split(/\s+/)
  const last = parts.length === 1 ? parts[0] : parts.slice(1).join(' ')
  return stripAccents(last.toLowerCase())
}
const firstInitial = (name: string) => stripAccents((name.trim()[0] ?? '').toLowerCase())

interface DbMatchFull {
  home_team: string; away_team: string
  goals_home: Goal[] | null; goals_away: Goal[] | null
  cards_home: Card[] | null; cards_away: Card[] | null
}
interface PlayerRow { id: number; api_id: number | null; name: string; team: string }

// PostgREST caps a select at 1000 rows by default — paginate to load them all.
// deno-lint-ignore no-explicit-any
async function fetchAllPlayers(supabase: any): Promise<PlayerRow[]> {
  const all: PlayerRow[] = []
  const size = 1000
  for (let from = 0; ; from += size) {
    const { data } = await supabase.from('players').select('id, api_id, name, team').order('id').range(from, from + size - 1)
    if (!data?.length) break
    all.push(...data)
    if (data.length < size) break
  }
  return all
}

// deno-lint-ignore no-explicit-any
async function recomputePlayerStats(supabase: any) {
  const { data: matches } = await supabase
    .from('matches')
    .select('home_team, away_team, goals_home, goals_away, cards_home, cards_away')
  let players = await fetchAllPlayers(supabase)

  // api_id is a bigint column → supabase-js may return it as a string, so coerce to Number
  const buildByApiId = (rows: PlayerRow[]) => {
    const m = new Map<number, number>()
    for (const p of rows) if (p.api_id != null) m.set(Number(p.api_id), p.id)
    return m
  }
  let byApiId = buildByApiId(players as PlayerRow[])

  // Fallback index for manual admin entries without ids: team -> lastKey -> candidates
  const byName = new Map<string, Map<string, { id: number; initial: string }[]>>()
  for (const p of players as PlayerRow[]) {
    if (!byName.has(p.team)) byName.set(p.team, new Map())
    const m = byName.get(p.team)!
    const k = lastKey(p.name)
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push({ id: p.id, initial: firstInitial(p.name) })
  }
  const findByName = (team: string, name: string): number | null => {
    const m = byName.get(team); if (!m) return null
    const cands = m.get(lastKey(name)); if (!cands?.length) return null
    if (cands.length === 1) return cands[0].id
    return (cands.find(c => c.initial === firstInitial(name)) ?? cands[0]).id
  }

  // Pass 1: ensure every event player (with an id) exists in the players table.
  // API squad lists are sometimes incomplete, so insert any missing participants.
  const missing = new Map<number, { api_id: number; name: string; team: string; position: string }>()
  const note = (apiId: number | undefined, name: string, team: string) => {
    if (apiId && !byApiId.has(apiId) && !missing.has(apiId))
      missing.set(apiId, { api_id: apiId, name, team, position: 'MID' })
  }
  for (const mt of (matches ?? []) as DbMatchFull[]) {
    for (const s of [
      { team: mt.home_team, goals: mt.goals_home, cards: mt.cards_home },
      { team: mt.away_team, goals: mt.goals_away, cards: mt.cards_away },
    ]) {
      for (const g of s.goals ?? []) { note(g.id, g.name, s.team); if (g.assist) note(g.assistId, g.assist, s.team) }
      for (const c of s.cards ?? []) note(c.id, c.name, s.team)
    }
  }
  if (missing.size) {
    // upsert on api_id so re-runs never create duplicates
    await supabase.from('players').upsert([...missing.values()], { onConflict: 'api_id', ignoreDuplicates: true })
    players = await fetchAllPlayers(supabase)
    byApiId = buildByApiId(players)
    for (const p of players) {
      if (!byName.has(p.team)) byName.set(p.team, new Map())
      const m = byName.get(p.team)!
      const k = lastKey(p.name)
      if (!m.has(k)) m.set(k, [])
      if (!m.get(k)!.some(c => c.id === p.id)) m.get(k)!.push({ id: p.id, initial: firstInitial(p.name) })
    }
  }

  const findPlayer = (team: string, name: string, apiId?: number): number | null =>
    (apiId && byApiId.get(apiId)) || findByName(team, name)

  // Pass 2: tally
  type Tally = { goals: number; assists: number; yellow: number; red: number }
  const tally = new Map<number, Tally>()
  const bump = (id: number, field: keyof Tally) => {
    let t = tally.get(id); if (!t) { t = { goals: 0, assists: 0, yellow: 0, red: 0 }; tally.set(id, t) }
    t[field]++
  }
  for (const mt of (matches ?? []) as DbMatchFull[]) {
    for (const s of [
      { team: mt.home_team, goals: mt.goals_home, cards: mt.cards_home },
      { team: mt.away_team, goals: mt.goals_away, cards: mt.cards_away },
    ]) {
      for (const g of s.goals ?? []) {
        if (!g.owngoal && g.name) { const id = findPlayer(s.team, g.name, g.id); if (id) bump(id, 'goals') }
        if (g.assist) { const id = findPlayer(s.team, g.assist, g.assistId); if (id) bump(id, 'assists') }
      }
      for (const c of s.cards ?? []) {
        if (!c.name) continue
        const id = findPlayer(s.team, c.name, c.id); if (id) bump(id, c.red ? 'red' : 'yellow')
      }
    }
  }

  // Write every player's stats in bulk upserts (one request per chunk).
  // Concurrent single-row updates get dropped in the edge runtime, so avoid them.
  const zero = { goals: 0, assists: 0, yellow: 0, red: 0 }
  const updates = players.map(p => ({ id: p.id, ...(tally.get(p.id) ?? zero) }))
  for (let i = 0; i < updates.length; i += 500) {
    await supabase.from('players').upsert(updates.slice(i, i + 500), { onConflict: 'id' })
  }
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

  // IMPORTANT: a single bulk upsert with heterogeneous keys is unsafe here.
  // PostgREST unions the keys of all rows into one column set, so if ONE row
  // carries goals_home/cards_home (because it needs events) every other row in
  // the batch gets those columns written as NULL — wiping the goals/cards of
  // finished matches that weren't refreshed this run. So we keep the bulk
  // upserts uniform (status/result only) and write events as targeted updates.
  const baseWithResult: Record<string, unknown>[] = [] // { id, live_status, result_home, result_away }
  const baseNoResult: Record<string, unknown>[] = []   // { id, live_status }
  const eventUpdates: { id: number; cols: Record<string, unknown> }[] = []
  let eventsChanged = false

  for (const fx of fixtures) {
    const db = byId.get(fx.fixture.id)
    if (!db) continue

    const status = mapStatus(fx.fixture.status.short)

    // Minute en direct : seulement pour un match live, sinon on remet à NULL
    // pour ne pas laisser une minute figée sur un match terminé/à venir.
    const liveMinute = status === 'live' ? (fx.fixture.status.elapsed ?? null) : null
    const liveExtra  = status === 'live' ? (fx.fixture.status.extra ?? null) : null

    // Orientation: our home_team may be the API away team (matched by sorted pair)
    const flipped = norm(fx.teams.home.name) !== db.home_team

    if (fx.goals.home !== null && fx.goals.away !== null) {
      baseWithResult.push({
        id: fx.fixture.id,
        live_status: status,
        result_home: flipped ? fx.goals.away : fx.goals.home,
        result_away: flipped ? fx.goals.home : fx.goals.away,
        live_minute: liveMinute,
        live_extra: liveExtra,
      })
    } else {
      // No API result yet → never touch result columns (preserves manual entries)
      baseNoResult.push({ id: fx.fixture.id, live_status: status, live_minute: liveMinute, live_extra: liveExtra })
    }

    // Fetch events (goals + cards) when live, or to backfill a match not yet detailed
    const hasGoals = Array.isArray(db.goals_home) && db.goals_home.length > 0
    const hasCards = Array.isArray(db.cards_home) && db.cards_home.length > 0
    const needEvents = status === 'live' || (status === 'finished' && !hasGoals && !hasCards)
    if (needEvents) {
      const ev = await fetchEvents(fx.fixture.id, fx.teams.home.id)
      // Only write when we actually got events — an empty (throttled) response
      // must never overwrite goals/cards already stored for a finished match.
      const hasEv = ev && (ev.goalsHome.length || ev.goalsAway.length || ev.cardsHome.length || ev.cardsAway.length)
      if (ev && hasEv) {
        eventUpdates.push({
          id: fx.fixture.id,
          cols: {
            goals_home: flipped ? ev.goalsAway : ev.goalsHome,
            goals_away: flipped ? ev.goalsHome : ev.goalsAway,
            cards_home: flipped ? ev.cardsAway : ev.cardsHome,
            cards_away: flipped ? ev.cardsHome : ev.cardsAway,
          },
        })
        eventsChanged = true
      }
    }
  }

  const synced = baseWithResult.length + baseNoResult.length
  if (!synced) {
    return new Response(JSON.stringify({ synced: 0, message: 'No matches to update' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Two uniform-key bulk upserts (no column ever NULLed unintentionally)
  for (const batch of [baseWithResult, baseNoResult]) {
    if (!batch.length) continue
    const { error: upsertErr } = await supabase.from('matches').upsert(batch, { onConflict: 'id' })
    if (upsertErr) {
      return new Response(JSON.stringify({ error: upsertErr.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  // Events written per-match as targeted column updates, so they only ever
  // touch the four event columns of the match they belong to.
  for (const e of eventUpdates) {
    const { error } = await supabase.from('matches').update(e.cols).eq('id', e.id)
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  // Recompute aggregated player stats only when match events actually changed
  if (eventsChanged) await recomputePlayerStats(supabase)

  return new Response(JSON.stringify({ synced, eventsChanged }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
