import type { Match } from '../types'

export interface StatRow {
  player: string
  team: string
  goals: number
  assists: number
  yellow: number
  red: number
}

// Aggregate player statistics from the per-match events synced into the DB.
// Goals/assists come from goal events (own goals are not credited to the scorer);
// cards come from card events. Team is the side the event belongs to.
export function computeMatchStats(matches: Match[]): StatRow[] {
  const rows = new Map<string, StatRow>()
  const row = (player: string, team: string): StatRow => {
    const key = player + '|' + team
    let r = rows.get(key)
    if (!r) { r = { player, team, goals: 0, assists: 0, yellow: 0, red: 0 }; rows.set(key, r) }
    return r
  }

  for (const m of matches) {
    const sides = [
      { team: m.home, goals: m.result.goalsHome, cards: m.result.cardsHome },
      { team: m.away, goals: m.result.goalsAway, cards: m.result.cardsAway },
    ]
    for (const s of sides) {
      for (const g of s.goals || []) {
        if (!g.owngoal && g.name) row(g.name, s.team).goals++
        if (g.assist) row(g.assist, s.team).assists++
      }
      for (const c of s.cards || []) {
        if (!c.name) continue
        if (c.red) row(c.name, s.team).red++
        else row(c.name, s.team).yellow++
      }
    }
  }

  return [...rows.values()]
}

export interface StatGroup {
  rank: number
  value: number
  players: StatRow[]
}

// Group an already value-sorted list into ranks: players sharing the same
// value land on the same rank (dense ranking, so ranks increment by one per
// distinct value — rank N is the Nth line).
export function groupByRank(list: StatRow[], val: (s: StatRow) => number): StatGroup[] {
  const groups: StatGroup[] = []
  for (const s of list) {
    const v = val(s)
    const last = groups[groups.length - 1]
    if (last && last.value === v) last.players.push(s)
    else groups.push({ rank: groups.length + 1, value: v, players: [s] })
  }
  return groups
}
