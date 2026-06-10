import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const RAPIDAPI_KEY = Deno.env.get('RAPIDAPI_KEY') ?? '4f5231439dmshc22c83b5cde5ef3p1d9c86jsn739feb141fa8'

interface ApiMatch {
  id: number
  home: string
  away: string
  score: string | { home: number; away: number } | null
  status: string // "scheduled" | "live" | "finished"
  played: boolean
  live_data: unknown
}

interface Goal {
  name: string
  minute: number
  penalty?: boolean
  owngoal?: boolean
}

function parseScore(score: ApiMatch['score']): { home: number; away: number } | null {
  if (!score) return null
  if (typeof score === 'object' && score !== null && 'home' in score)
    return score as { home: number; away: number }
  if (typeof score === 'string') {
    const m = score.match(/(\d+)\s*[-:]\s*(\d+)/)
    if (m) return { home: parseInt(m[1]), away: parseInt(m[2]) }
  }
  return null
}

function parseGoals(liveData: unknown, side: 'home' | 'away'): Goal[] {
  if (!liveData || typeof liveData !== 'object') return []
  const d = liveData as Record<string, unknown>

  // Format A: { goals: [{team: "home", player: "Neymar", minute: 32, type: "goal"}] }
  if (Array.isArray(d.goals)) {
    return (d.goals as Record<string, unknown>[])
      .filter(g => g.team === side)
      .map(g => ({
        name: String(g.player ?? g.name ?? ''),
        minute: Number(g.minute ?? 0),
        ...(g.type === 'penalty' || g.penalty === true ? { penalty: true } : {}),
        ...(g.type === 'own_goal' || g.owngoal === true ? { owngoal: true } : {}),
      }))
  }

  // Format B: { goals_home: [{player, minute}], goals_away: [...] }
  const key = side === 'home' ? 'goals_home' : 'goals_away'
  if (Array.isArray(d[key])) {
    return (d[key] as Record<string, unknown>[]).map(g => ({
      name: String(g.player ?? g.name ?? ''),
      minute: Number(g.minute ?? 0),
      ...(g.penalty === true ? { penalty: true } : {}),
      ...(g.owngoal === true ? { owngoal: true } : {}),
    }))
  }

  return []
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Skip external API call if no match is in the active window:
  // from 1 hour before kick-off to 2h30 after kick-off (covers ET + stoppage time)
  const { data: activeMatches } = await supabase.rpc('matches_in_active_window')
  if (!activeMatches) {
    return new Response(JSON.stringify({ skipped: true, reason: 'no match in active window' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Fetch all matches from the WC26 API
  const apiRes = await fetch('https://wc26-live-football-api.p.rapidapi.com/matches', {
    headers: {
      'x-rapidapi-host': 'wc26-live-football-api.p.rapidapi.com',
      'x-rapidapi-key': RAPIDAPI_KEY,
    },
  })
  if (!apiRes.ok) {
    return new Response(JSON.stringify({ error: 'API fetch failed', status: apiRes.status }), {
      status: 502, headers: { 'Content-Type': 'application/json' },
    })
  }
  const { data: apiMatches }: { data: ApiMatch[] } = await apiRes.json()

  // Load DB matches and build sorted-pair lookup
  const { data: dbMatches, error: dbErr } = await supabase
    .from('matches')
    .select('id, home_team, away_team, live_status')
    .eq('stage', 'group')
  if (dbErr) {
    return new Response(JSON.stringify({ error: dbErr.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  const pairMap = new Map<string, NonNullable<typeof dbMatches>[0]>()
  for (const m of dbMatches ?? []) {
    if (m.home_team && m.away_team)
      pairMap.set([m.home_team, m.away_team].sort().join('|'), m)
  }

  const upserts: Record<string, unknown>[] = []

  for (const am of apiMatches) {
    if (am.status === 'scheduled') continue

    const dbMatch = pairMap.get([am.home, am.away].sort().join('|'))
    if (!dbMatch) continue

    const scoreObj = parseScore(am.score)
    const upsert: Record<string, unknown> = { id: dbMatch.id, live_status: am.status }

    if (scoreObj) {
      const flipped = dbMatch.home_team !== am.home
      upsert.result_home = flipped ? scoreObj.away : scoreObj.home
      upsert.result_away = flipped ? scoreObj.home : scoreObj.away

      if (am.live_data) {
        const gh = parseGoals(am.live_data, flipped ? 'away' : 'home')
        const ga = parseGoals(am.live_data, flipped ? 'home' : 'away')
        if (gh.length || ga.length) { upsert.goals_home = gh; upsert.goals_away = ga }
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
