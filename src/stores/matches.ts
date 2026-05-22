import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Match } from '../types'
import { sb } from '../supabase'
import { parseGoals } from '../utils/goals'

const writeTimers: Record<string, ReturnType<typeof setTimeout>> = {}

function debounce(key: string, fn: () => Promise<void>, delay = 600) {
  if (writeTimers[key]) clearTimeout(writeTimers[key])
  writeTimers[key] = setTimeout(fn, delay)
}

export const useMatchesStore = defineStore('matches', () => {
  const matches = ref<Match[]>([])

  function setMatchResult(matchId: number, side: 'home' | 'away', val: string) {
    matches.value = matches.value.map(m =>
      m.id !== matchId ? m : { ...m, result: { ...m.result, [side]: val } }
    )
    debounce("mr_" + matchId, async () => {
      const m = matches.value.find(x => x.id === matchId)
      if (!m) return
      await sb.from("matches").update({
        result_home: m.result.home === "" ? null : parseInt(m.result.home),
        result_away: m.result.away === "" ? null : parseInt(m.result.away),
        goals_home: m.result.goalsHome || [],
        goals_away: m.result.goalsAway || [],
      }).eq("id", matchId)
    })
  }

  function setMatchGoalText(matchId: number, side: 'home' | 'away', text: string) {
    const goals = parseGoals(text)
    const key = side === "home" ? "goalsHome" : "goalsAway"
    const textKey = side === "home" ? "goalsHomeText" : "goalsAwayText"
    matches.value = matches.value.map(m =>
      m.id !== matchId ? m : { ...m, result: { ...m.result, [key]: goals, [textKey]: text } }
    )
    debounce("mg_" + matchId, async () => {
      const m = matches.value.find(x => x.id === matchId)
      if (!m) return
      await sb.from("matches").update({
        goals_home: m.result.goalsHome || [],
        goals_away: m.result.goalsAway || [],
      }).eq("id", matchId)
    })
  }

  return { matches, setMatchResult, setMatchGoalText }
})
