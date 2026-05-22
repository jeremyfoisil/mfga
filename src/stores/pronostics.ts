import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Prono } from '../types'
import { sb } from '../supabase'

const writeTimers: Record<string, ReturnType<typeof setTimeout>> = {}

function debounce(key: string, fn: () => Promise<void>, delay = 600) {
  if (writeTimers[key]) clearTimeout(writeTimers[key])
  writeTimers[key] = setTimeout(fn, delay)
}

export const usePronosticsStore = defineStore('pronostics', () => {
  const pronostics = ref<Record<number, Record<number, Prono>>>({})
  const jokers     = ref<Record<number, number | null>>({})

  function setProno(pid: number, matchId: number, side: 'home' | 'away', val: string) {
    const cur = pronostics.value
    pronostics.value = { ...cur, [pid]: { ...cur[pid], [matchId]: { ...(cur[pid]?.[matchId] || {}), [side]: val } } }
    debounce("prono_" + pid + "_" + matchId, async () => {
      const prono = pronostics.value[pid]?.[matchId]
      if (!prono) return
      await sb.from("pronostics").upsert({
        participant_id: pid, match_id: matchId,
        prono_home: prono.home === "" ? null : parseInt(prono.home),
        prono_away: prono.away === "" ? null : parseInt(prono.away),
        is_joker: jokers.value[pid] === matchId,
      }, { onConflict: "participant_id,match_id" })
    })
  }

  async function toggleJoker(pid: number, matchId: number, currentProno: Prono | undefined) {
    const isCurrentJoker = jokers.value[pid] === matchId
    const oldJokerMatchId = jokers.value[pid]
    jokers.value = { ...jokers.value, [pid]: isCurrentJoker ? null : matchId }
    if (oldJokerMatchId && oldJokerMatchId !== matchId) {
      const oldProno = pronostics.value[pid]?.[oldJokerMatchId] || { home: '', away: '' }
      await sb.from("pronostics").upsert({
        participant_id: pid, match_id: oldJokerMatchId,
        prono_home: oldProno.home === "" ? null : parseInt(oldProno.home),
        prono_away: oldProno.away === "" ? null : parseInt(oldProno.away),
        is_joker: false,
      }, { onConflict: "participant_id,match_id" })
    }
    const prono = currentProno || { home: '', away: '' }
    await sb.from("pronostics").upsert({
      participant_id: pid, match_id: matchId,
      prono_home: prono.home === "" ? null : parseInt(prono.home),
      prono_away: prono.away === "" ? null : parseInt(prono.away),
      is_joker: !isCurrentJoker,
    }, { onConflict: "participant_id,match_id" })
  }

  return { pronostics, jokers, setProno, toggleJoker }
})
