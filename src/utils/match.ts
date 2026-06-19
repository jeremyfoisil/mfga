import type { Match, Prono, MatchResult } from '../types'
import { parseGoals, goalsToText } from './goals'

export function calcMatchPoints(prono: Prono | undefined, result: MatchResult): number {
  if (!result || result.home === "" || result.away === "") return 0
  if (!prono || prono.home === "" || prono.away === "") return 0
  const ph = parseInt(prono.home), pa = parseInt(prono.away)
  const rh = parseInt(result.home), ra = parseInt(result.away)
  if (ph === rh && pa === ra) return 3
  if (Math.sign(ph - pa) === Math.sign(rh - ra)) return 1
  return 0
}

export function mapMatchRow(r: Record<string, unknown>): Match {
  const gh = (r.goals_home as import('../types').Goal[] | null) || []
  const ga = (r.goals_away as import('../types').Goal[] | null) || []
  const ch = (r.cards_home as import('../types').Card[] | null) || []
  const ca = (r.cards_away as import('../types').Card[] | null) || []
  return {
    id:        r.id as number,
    stage:     (r.stage as string) || "group",
    group:     (r.group_id as string) || null,
    home:      (r.home_team as string) || (r.home_label as string) || "?",
    away:      (r.away_team as string) || (r.away_label as string) || "?",
    homeKnown: !!(r.home_team),
    awayKnown: !!(r.away_team),
    homeLabel: (r.home_label as string) || "",
    awayLabel: (r.away_label as string) || "",
    result: {
      home: r.result_home !== null && r.result_home !== undefined ? String(r.result_home) : "",
      away: r.result_away !== null && r.result_away !== undefined ? String(r.result_away) : "",
      goalsHome: gh,
      goalsAway: ga,
      goalsHomeText: goalsToText(gh),
      goalsAwayText: goalsToText(ga),
      cardsHome: ch,
      cardsAway: ca,
    },
    matchDate: (r.match_date as string) || "",
    matchTime: (r.match_time as string) || "",
    venue:     (r.venue as string) || "",
    round:     (r.round as string) || "",
    liveStatus: (r.live_status as string) || "scheduled",
    liveMinute: r.live_minute !== null && r.live_minute !== undefined ? Number(r.live_minute) : null,
    liveExtra:  r.live_extra  !== null && r.live_extra  !== undefined ? Number(r.live_extra)  : null,
    oddsHome: r.odds_home !== null && r.odds_home !== undefined ? Number(r.odds_home) : null,
    oddsDraw: r.odds_draw !== null && r.odds_draw !== undefined ? Number(r.odds_draw) : null,
    oddsAway: r.odds_away !== null && r.odds_away !== undefined ? Number(r.odds_away) : null,
  }
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return ""
  const d = new Date(dateStr + "T12:00:00Z")
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
}

export function formatMatchTime(m: Match): string {
  const ms = matchStartsAtMs(m)
  if (ms === Infinity) return m.matchTime || ''
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function matchStartsAtMs(m: Match): number {
  if (!m.matchDate || !m.matchTime) return Infinity
  let found = m.matchTime.match(/^(\d{2}):(\d{2}):\d{2}([+-]\d+)/)
  if (!found) found = m.matchTime.match(/(\d{1,2}):(\d{2})\s*UTC([+-]\d+)/)
  if (!found) return Infinity
  const utcOffset = parseInt(found[3])
  const utcH = parseInt(found[1]) - utcOffset
  const d = new Date(m.matchDate + "T00:00:00Z")
  d.setUTCHours(utcH, parseInt(found[2]), 0, 0)
  return d.getTime()
}
