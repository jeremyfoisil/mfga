import { defineStore } from 'pinia'
import { ref } from 'vue'
import { sb } from '../supabase'
import { TEAM_EN_FR } from '../constants/teams'
import { mapMatchRow } from '../utils/match'
import { useMatchesStore } from './matches'

export const useAdminStore = defineStore('admin', () => {
  const isAdmin        = ref(false)
  const showAdminModal = ref(false)
  const adminPassInput = ref('')
  const adminPassError = ref('')
  const showImportModal = ref(false)
  const importJsonText  = ref('')
  const importStatus    = ref('')
  const importLoading   = ref(false)

  function openAdminModal()  { showAdminModal.value = true; adminPassInput.value = ''; adminPassError.value = '' }
  function closeAdminModal() { showAdminModal.value = false }
  function submitAdminPass() {
    if (adminPassInput.value === "GOAT") { isAdmin.value = true; showAdminModal.value = false }
    else { adminPassError.value = "Mot de passe incorrect" }
  }
  function exitAdmin() { isAdmin.value = false }

  async function importJson() {
    const matchesStore = useMatchesStore()
    importLoading.value = true; importStatus.value = ''
    try {
      const data = JSON.parse(importJsonText.value)
      if (!data.matches) throw new Error("Champ 'matches' manquant")
      const pairMap: Record<string, import('../types').Match> = {}
      matchesStore.matches.filter(m => m.stage === "group").forEach(m => {
        pairMap[[m.home, m.away].sort().join("|")] = m
      })
      const upserts: Record<string, unknown>[] = []
      const mapG = (gs: { name: string; minute: number; penalty?: boolean; owngoal?: boolean }[] | undefined) =>
        (gs || []).map(g => ({ name: g.name, minute: g.minute, ...(g.penalty ? { penalty: true } : {}), ...(g.owngoal ? { owngoal: true } : {}) }))
      for (const jm of data.matches) {
        const rawTime: string | null = jm.time || null
      const match_time = rawTime ? rawTime.replace(/\+(\d+)/, '-$1') : null
      const row: Record<string, unknown> = { match_date: jm.date || null, match_time, venue: jm.ground || null, round: jm.round || null }
        if (jm.num && jm.num >= 73) {
          row.id = jm.num
          if (jm.team1 && !/^\d/.test(jm.team1) && !/^[WL]/.test(jm.team1)) row.home_team = TEAM_EN_FR[jm.team1] || jm.team1
          if (jm.team2 && !/^\d/.test(jm.team2) && !/^[WL]/.test(jm.team2)) row.away_team = TEAM_EN_FR[jm.team2] || jm.team2
          if (jm.score?.ft) { row.result_home = jm.score.ft[0]; row.result_away = jm.score.ft[1] }
          if (jm.goals1 || jm.goals2) { row.goals_home = mapG(jm.goals1); row.goals_away = mapG(jm.goals2) }
        } else {
          if (!jm.team1 || !jm.team2) continue
          const frHome = TEAM_EN_FR[jm.team1] || jm.team1
          const frAway = TEAM_EN_FR[jm.team2] || jm.team2
          const m = pairMap[[frHome, frAway].sort().join("|")]
          if (!m) continue
          const flipped = m.home !== frHome
          row.id = m.id
          if (jm.score?.ft) {
            const [s1, s2] = jm.score.ft
            row.result_home = flipped ? s2 : s1; row.result_away = flipped ? s1 : s2
          }
          if (jm.goals1 || jm.goals2) {
            row.goals_home = flipped ? mapG(jm.goals2) : mapG(jm.goals1)
            row.goals_away = flipped ? mapG(jm.goals1) : mapG(jm.goals2)
          }
        }
        upserts.push(row)
      }
      if (!upserts.length) throw new Error("Aucun match reconnu")
      for (let i = 0; i < upserts.length; i += 20) {
        const { error } = await sb.from("matches").upsert(upserts.slice(i, i + 20), { onConflict: "id" })
        if (error) throw error
      }
      const { data: mData } = await sb.from("matches").select("*").order("id")
      matchesStore.matches = (mData || []).map(mapMatchRow)
      const withScore = upserts.filter(u => u.result_home != null).length
      importStatus.value = `✓ ${upserts.length} matchs mis à jour (${withScore} avec score)`
      setTimeout(() => { showImportModal.value = false; importStatus.value = ''; importJsonText.value = '' }, 2000)
    } catch (e) {
      importStatus.value = "✗ " + (e as Error).message
    } finally {
      importLoading.value = false
    }
  }

  const scheduleLoading = ref(false)
  const scheduleMsg     = ref('')
  let scheduleMsgTimer: ReturnType<typeof setTimeout> | null = null

  async function syncSchedule() {
    const matchesStore = useMatchesStore()
    scheduleLoading.value = true
    scheduleMsg.value = ''
    try {
      const { data, error } = await sb.functions.invoke('sync-schedule')
      if (error) throw error
      const result = data as { synced: number }
      scheduleMsg.value = `✓ ${result.synced} horaires synchronisés`
      const { data: mData } = await sb.from('matches').select('*').order('id')
      matchesStore.matches = (mData || []).map(mapMatchRow)
    } catch (e) {
      scheduleMsg.value = '✗ ' + (e as Error).message
    } finally {
      scheduleLoading.value = false
      if (scheduleMsgTimer) clearTimeout(scheduleMsgTimer)
      scheduleMsgTimer = setTimeout(() => { scheduleMsg.value = '' }, 3000)
    }
  }

  const syncLoading = ref(false)
  const syncMsg     = ref('')
  let syncMsgTimer: ReturnType<typeof setTimeout> | null = null

  async function syncFromApi() {
    const matchesStore = useMatchesStore()
    syncLoading.value = true
    syncMsg.value = ''
    try {
      const { data, error } = await sb.functions.invoke('sync-wc26')
      if (error) throw error
      const result = data as { synced: number; message?: string }
      if (result.synced === 0) {
        syncMsg.value = '– Aucun match en cours'
      } else {
        syncMsg.value = `✓ ${result.synced} match(s) synchronisé(s)`
        const { data: mData } = await sb.from('matches').select('*').order('id')
        matchesStore.matches = (mData || []).map(mapMatchRow)
      }
    } catch (e) {
      syncMsg.value = '✗ ' + (e as Error).message
    } finally {
      syncLoading.value = false
      if (syncMsgTimer) clearTimeout(syncMsgTimer)
      syncMsgTimer = setTimeout(() => { syncMsg.value = '' }, 3000)
    }
  }

  return { isAdmin, showAdminModal, adminPassInput, adminPassError, showImportModal, importJsonText, importStatus, importLoading, openAdminModal, closeAdminModal, submitAdminPass, exitAdmin, importJson, scheduleLoading, scheduleMsg, syncSchedule, syncLoading, syncMsg, syncFromApi }
})
