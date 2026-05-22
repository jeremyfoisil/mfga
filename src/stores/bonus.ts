import { defineStore } from 'pinia'
import { ref } from 'vue'
import { sb } from '../supabase'

const writeTimers: Record<string, ReturnType<typeof setTimeout>> = {}

function debounce(key: string, fn: () => Promise<void>, delay = 600) {
  if (writeTimers[key]) clearTimeout(writeTimers[key])
  writeTimers[key] = setTimeout(fn, delay)
}

export const useBonusStore = defineStore('bonus', () => {
  const bonusPronostics = ref<Record<number, Record<string, string>>>({})
  const bonusResults    = ref<Record<string, string>>({})

  function setBonus(pid: number, bonusId: string, idx: number, val: string) {
    const key = bonusId + "_" + idx
    bonusPronostics.value = { ...bonusPronostics.value, [pid]: { ...bonusPronostics.value[pid], [key]: val } }
    debounce("bp_" + pid + "_" + key, async () => {
      await sb.from("bonus_pronostics").upsert({ participant_id: pid, bonus_key: key, value: val }, { onConflict: "participant_id,bonus_key" })
    })
  }

  function setBonusResult(bonusId: string, idx: number, val: string) {
    const key = bonusId + "_" + idx
    bonusResults.value = { ...bonusResults.value, [key]: val }
    debounce("br_" + key, async () => {
      await sb.from("bonus_results").upsert({ bonus_key: key, value: val }, { onConflict: "bonus_key" })
    })
  }

  return { bonusPronostics, bonusResults, setBonus, setBonusResult }
})
