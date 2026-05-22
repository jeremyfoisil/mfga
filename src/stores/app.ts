import { defineStore } from 'pinia'
import { ref } from 'vue'
import { sb } from '../supabase'
import { mapMatchRow } from '../utils/match'
import { useAuthStore } from './auth'
import { useParticipantsStore } from './participants'
import { useMatchesStore } from './matches'
import { usePronosticsStore } from './pronostics'
import { useBonusStore } from './bonus'

export const useAppStore = defineStore('app', () => {
  const loaded   = ref(false)
  const saveMsg  = ref('')
  const rtStatus = ref('connecting')
  const tab      = ref(0)
  let realtimeChannel: ReturnType<typeof sb.channel> | null = null

  function flash() {
    saveMsg.value = "✓ Sauvegardé"
    setTimeout(() => { saveMsg.value = '' }, 2000)
  }

  async function loadData(userId: string) {
    const auth         = useAuthStore()
    const parts        = useParticipantsStore()
    const matchesStore = useMatchesStore()
    const pronos       = usePronosticsStore()
    const bonus        = useBonusStore()

    try {
      let { data: prof } = await sb.from("profiles").select("*").eq("id", userId).single()
      if (!prof) {
        await new Promise(r => setTimeout(r, 900))
        const { data: retry } = await sb.from("profiles").select("*").eq("id", userId).single()
        prof = retry
      }
      if (!prof) { auth.authError = "Profil introuvable. Contactez l'administrateur."; return }
      auth.profile = prof

      const [{ data: pData }, { data: mData }, { data: prData }, { data: brData }, { data: bpData }] = await Promise.all([
        sb.from("participants").select("*").order("id"),
        sb.from("matches").select("*").order("id"),
        sb.from("pronostics").select("*"),
        sb.from("bonus_results").select("*"),
        sb.from("bonus_pronostics").select("*"),
      ])

      parts.participants = (pData || []).map((p: Record<string, unknown>) => ({ id: p.id as number, name: p.name as string, color: p.color as string }))
      matchesStore.matches = (mData || []).map(mapMatchRow)

      const pronosMap: Record<number, Record<number, { home: string; away: string }>> = {}
      const jkrs: Record<number, number | null> = {}
      ;(prData || []).forEach((p: Record<string, unknown>) => {
        const pid = p.participant_id as number
        const mid = p.match_id as number
        if (!pronosMap[pid]) pronosMap[pid] = {}
        pronosMap[pid][mid] = {
          home: p.prono_home !== null && p.prono_home !== undefined ? String(p.prono_home) : "",
          away: p.prono_away !== null && p.prono_away !== undefined ? String(p.prono_away) : "",
        }
        if (p.is_joker) jkrs[pid] = mid
      })
      pronos.pronostics = pronosMap
      pronos.jokers = jkrs

      const bRes: Record<string, string> = {}
      ;(brData || []).forEach((r: Record<string, unknown>) => { bRes[r.bonus_key as string] = r.value as string })
      bonus.bonusResults = bRes

      const bPronos: Record<number, Record<string, string>> = {}
      ;(bpData || []).forEach((p: Record<string, unknown>) => {
        const pid = p.participant_id as number
        if (!bPronos[pid]) bPronos[pid] = {}
        bPronos[pid][p.bonus_key as string] = p.value as string
      })
      bonus.bonusPronostics = bPronos

      loaded.value = true
      startRealtime()
    } catch (_e) {
      auth.authError = "Erreur de chargement — vérifie ta connexion et recharge la page."
    }
  }

  function startRealtime() {
    const parts        = useParticipantsStore()
    const matchesStore = useMatchesStore()
    const pronos       = usePronosticsStore()
    const bonus        = useBonusStore()

    if (realtimeChannel) sb.removeChannel(realtimeChannel)
    realtimeChannel = sb.channel("mfga-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "participants" }, ({ eventType, new: n, old: o }: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
        if (eventType === "INSERT") {
          if (!parts.participants.find(x => x.id === n.id as number))
            parts.participants = [...parts.participants, { id: n.id as number, name: n.name as string, color: n.color as string }]
        } else if (eventType === "DELETE") {
          parts.participants = parts.participants.filter(x => x.id !== o.id as number)
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, ({ eventType, new: r }: { eventType: string; new: Record<string, unknown> }) => {
        if (eventType === "INSERT") {
          if (!matchesStore.matches.find(m => m.id === r.id as number))
            matchesStore.matches = [...matchesStore.matches, mapMatchRow(r)].sort((a, b) => a.id - b.id)
        } else if (eventType === "UPDATE") {
          matchesStore.matches = matchesStore.matches.map(m => m.id === r.id as number ? mapMatchRow(r) : m)
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "pronostics" }, ({ eventType, new: p }: { eventType: string; new: Record<string, unknown> }) => {
        if (eventType === "INSERT" || eventType === "UPDATE") {
          const pid = p.participant_id as number
          const mid = p.match_id as number
          pronos.pronostics = { ...pronos.pronostics, [pid]: { ...pronos.pronostics[pid], [mid]: {
            home: p.prono_home !== null ? String(p.prono_home) : "",
            away: p.prono_away !== null ? String(p.prono_away) : "",
          }}}
          const j = { ...pronos.jokers }
          if (p.is_joker) j[pid] = mid
          else if (j[pid] === mid) j[pid] = null
          pronos.jokers = j
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "bonus_results" }, ({ eventType, new: r }: { eventType: string; new: Record<string, unknown> }) => {
        if (eventType === "INSERT" || eventType === "UPDATE")
          bonus.bonusResults = { ...bonus.bonusResults, [r.bonus_key as string]: r.value as string }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "bonus_pronostics" }, ({ eventType, new: p }: { eventType: string; new: Record<string, unknown> }) => {
        if (eventType === "INSERT" || eventType === "UPDATE") {
          const pid = p.participant_id as number
          bonus.bonusPronostics = { ...bonus.bonusPronostics, [pid]: { ...bonus.bonusPronostics[pid], [p.bonus_key as string]: p.value as string } }
        }
      })
      .subscribe((status: string) => { rtStatus.value = status === "SUBSCRIBED" ? "connected" : "connecting" })
  }

  function stopRealtime() {
    if (realtimeChannel) { sb.removeChannel(realtimeChannel); realtimeChannel = null }
  }

  return { loaded, saveMsg, rtStatus, tab, flash, loadData, startRealtime, stopRealtime }
})
