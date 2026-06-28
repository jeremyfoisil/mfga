<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useParticipantsStore } from '../../stores/participants'
import { useMatchesStore } from '../../stores/matches'
import { usePronosticsStore } from '../../stores/pronostics'
import { useAdminStore } from '../../stores/admin'
import { useAuthStore } from '../../stores/auth'
import { C, sCard, sInput, sLabel, KO_STAGES, GROUP_IDS } from '../../constants/ui'
import { calcMatchPoints, matchStartsAtMs, formatDate, formatMatchTime } from '../../utils/match'
import { getFlag, getFlagBg, initials } from '../../utils/ui'
import LineupModal, { type LineupData } from '../modals/LineupModal.vue'
import MatchOdds from '../ui/MatchOdds.vue'
import type { Goal, Card } from '../../types'
import { sb } from '../../supabase'

// Merge goals + cards of one team into a single timeline (each line carries its emoji).
// Own goals are stored on the scorer's team but count for the opponent, so a side's
// goals = its own (non-own) goals + the opponent's own goals it benefits from.
interface SideEvent { name: string; minute: number; emoji: string; penalty?: boolean; owngoal?: boolean }
function sideEvents(teamGoals: Goal[], oppGoals: Goal[], cards: Card[]): SideEvent[] {
  return [
    ...(teamGoals || []).filter(g => !g.owngoal).map(g => ({ name: g.name, minute: g.minute, emoji: '⚽', penalty: g.penalty })),
    ...(oppGoals || []).filter(g => g.owngoal).map(g => ({ name: g.name, minute: g.minute, emoji: '⚽', owngoal: true })),
    ...(cards || []).map(c => ({ name: c.name, minute: c.minute, emoji: c.red ? '🟥' : '🟨' })),
  ].sort((a, b) => a.minute - b.minute)
}

const parts        = useParticipantsStore()
const matchesStore = useMatchesStore()
const pronos       = usePronosticsStore()
const admin        = useAdminStore()
const auth         = useAuthStore()

const activeGroup       = ref('A')
const activeStageType   = ref<'live' | 'group' | 'knockout'>('live')
const activeKOStage     = ref('r32')
const activeParticipant = ref<number | null>(null)
const now = ref(Date.now())

const myParticipantId = computed(() => auth.profile?.participant_id ?? null)

onMounted(() => {
  activeParticipant.value = myParticipantId.value
})

let timer: ReturnType<typeof setInterval>
onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 30000) })
onUnmounted(() => clearInterval(timer))

const grabSound = new Audio('https://www.myinstants.com/media/sounds/gebtp.mp3')
grabSound.preload = 'auto'

// Débloque l'autoplay au premier clic sur la page
onMounted(() => {
  const prime = () => {
    grabSound.play().then(() => { grabSound.pause(); grabSound.currentTime = 0 }).catch(() => {})
  }
  document.addEventListener('click', prime, { once: true })
})

// Joue le son quand un résultat exact est nouvellement détecté (realtime)
const knownResults = new Set<string>()
onMounted(() => {
  matchesStore.matches.forEach(m => {
    if (m.result.home !== '' && m.result.away !== '') knownResults.add(String(m.id))
  })
})
watch(() => matchesStore.matches.map(m => m.result.home + ':' + m.result.away + ':' + m.id).join('|'), () => {
  matchesStore.matches.forEach(m => {
    const key = String(m.id)
    const hasResult = m.result.home !== '' && m.result.away !== ''
    if (hasResult && !knownResults.has(key)) {
      knownResults.add(key)
      if (getMatchPts(activeParticipant.value, m.id) === 3) {
        grabSound.currentTime = 0
        grabSound.play().catch(() => {})
      }
    }
  })
})

const canEditProno  = computed(() => admin.isAdmin || activeParticipant.value === myParticipantId.value)
const canEditResult = computed(() => admin.isAdmin)

function isMe(pid: number | null) { return pid === myParticipantId.value }
function isJokerMatch(pid: number | null, mid: number) { return pid !== null && pronos.jokers[pid] === mid }

function hasMatchStarted(m: import('../../types').Match) { return now.value >= matchStartsAtMs(m) }

// Minute en cours d'un match live, depuis l'API (ex. "42'" ou "45+2'").
function liveMinuteLabel(m: import('../../types').Match): string {
  if (m.liveStatus !== 'live' || m.liveMinute == null) return ''
  return m.liveExtra != null ? `${m.liveMinute}+${m.liveExtra}'` : `${m.liveMinute}'`
}

function canEditMatchProno(matchId: number) {
  const m = matchesStore.matches.find(x => x.id === matchId)
  if (!m) return false
  return !hasMatchStarted(m)
}

// Saisie autorisée seulement sur ses propres pronostics (ou admin) ET tant que
// le match n'a pas débuté. Empêche d'éditer le score d'un autre participant.
function canEditPronoInput(matchId: number) {
  return canEditProno.value && canEditMatchProno(matchId)
}

// Le joker est consommé définitivement dès que le match sur lequel il est posé
// a débuté : on ne peut alors plus le retirer ni le reposer ailleurs.
function isJokerLocked(pid: number | null) {
  if (pid === null) return false
  const jokerMatchId = pronos.jokers[pid]
  if (jokerMatchId == null) return false
  const m = matchesStore.matches.find(x => x.id === jokerMatchId)
  return !!m && hasMatchStarted(m)
}

function canToggleJoker(matchId: number) {
  return canEditProno.value && canEditMatchProno(matchId) && !isJokerLocked(activeParticipant.value)
}

function activeParticipantName() {
  return parts.participants.find(p => p.id === activeParticipant.value)?.name ?? '?'
}

function activeParticipantColor() {
  return parts.participants.find(p => p.id === activeParticipant.value)?.color ?? C.accent
}

const groupMatches = computed(() =>
  matchesStore.matches
    .filter(m => m.stage === 'group' && m.group === activeGroup.value)
    .sort((a, b) => matchStartsAtMs(a) - matchStartsAtMs(b))
)

const koStageMatches = computed(() =>
  matchesStore.matches
    .filter(m => m.stage === activeKOStage.value)
    .sort((a, b) => matchStartsAtMs(a) - matchStartsAtMs(b))
)

const hasKOMatches = computed(() => matchesStore.matches.some(m => m.stage !== 'group'))

// ── Live mode ──────────────────────────────────────────────────────
function localDateStr(ms: number) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const todayStr = computed(() => localDateStr(now.value))

// A match's day in the user's local timezone, derived from its absolute kickoff
// instant. Comparing local-day to local-day (rather than the stored venue date,
// which can read "yesterday" for an evening match in the Americas) is what stops
// late-night matches from being dropped when the local day rolls over at midnight.
function matchLocalDate(m: import('../../types').Match): string {
  const ms = matchStartsAtMs(m)
  return ms === Infinity ? '' : localDateStr(ms)
}

const liveMatches = computed(() =>
  matchesStore.matches
    .filter(m => m.liveStatus === 'live')
    .sort((a, b) => matchStartsAtMs(a) - matchStartsAtMs(b))
)
const nextMatch = computed(() =>
  matchesStore.matches
    .filter(m => matchStartsAtMs(m) > now.value)
    .sort((a, b) => matchStartsAtMs(a) - matchStartsAtMs(b))[0] || null
)
// The user-local day whose programme the Live tab shows when nothing is in
// progress: the slate of the soonest match still to come. Anchoring on the next
// match means the evening programme keeps showing tonight's late matches right
// through midnight instead of zapping them. Falls back to today once the season's over.
const programmeDay = computed(() => nextMatch.value ? matchLocalDate(nextMatch.value) : todayStr.value)
const todayMatches = computed(() =>
  matchesStore.matches
    .filter(m => matchLocalDate(m) === programmeDay.value)
    .sort((a, b) => matchStartsAtMs(a) - matchStartsAtMs(b))
)
// Live tab content: matches in progress first, else the day's programme, else the next match.
const liveDisplayMatches = computed(() => {
  if (liveMatches.value.length) return liveMatches.value
  if (todayMatches.value.length) return todayMatches.value
  return nextMatch.value ? [nextMatch.value] : []
})
function matchStageLabel(m: import('../../types').Match) {
  return m.stage === 'group' ? `GROUPE ${m.group}` : koStageLabel(m.stage)
}
function koStageLabel(stage: string): string {
  return KO_STAGES.find(s => s.id === stage)?.label ?? 'ÉLIMINATION'
}

function getProno(pid: number | null, matchId: number) {
  return (pid !== null ? pronos.pronostics[pid]?.[matchId] : undefined) || {}
}

function getMatchPts(pid: number | null, matchId: number) {
  const m = matchesStore.matches.find(x => x.id === matchId)
  if (!m || pid === null) return 0
  return calcMatchPoints(pronos.pronostics[pid]?.[m.id], m.result)
}

// ── Lineup modal ───────────────────────────────────────────────────
const lineup = ref<{
  open: boolean
  homeName: string
  awayName: string
  matchId: number
  loading: boolean
  data: LineupData | null
  error: string | null
}>({ open: false, homeName: '', awayName: '', matchId: 0, loading: false, data: null, error: null })

const lineupMatch = computed(() => matchesStore.matches.find(m => m.id === lineup.value.matchId))

async function openLineup(m: import('../../types').Match) {
  lineup.value = { open: true, homeName: m.home, awayName: m.away, matchId: m.id, loading: true, data: null, error: null }
  try {
    const { data, error } = await sb.functions.invoke('squad-proxy', {
      body: { home: m.home, away: m.away, matchId: m.id },
    })
    if (error) throw error
    lineup.value.data = data as LineupData
  } catch (e) {
    lineup.value.error = (e as Error).message
  } finally {
    lineup.value.loading = false
  }
}

function ptColor(pts: number, hasRes: boolean) {
  return pts === 3 ? C.green : pts === 1 ? C.yellow : hasRes ? "#ef4444" : C.muted
}

function setMatchResult(matchId: number, side: 'home' | 'away', val: string) {
  matchesStore.setMatchResult(matchId, side, val)
}
function setMatchGoalText(matchId: number, side: 'home' | 'away', text: string) {
  matchesStore.setMatchGoalText(matchId, side, text)
}
function setProno(pid: number | null, matchId: number, side: 'home' | 'away', val: string) {
  if (pid === null) return
  // Seul le propriétaire du pronostic (ou l'admin) peut le modifier.
  if (!canEditProno.value) return
  pronos.setProno(pid, matchId, side, val)
}
function toggleJoker(pid: number | null, matchId: number) {
  if (pid === null) return
  // Seul le propriétaire du pronostic (ou l'admin) peut poser/retirer son joker.
  if (!canEditProno.value) return
  // Joker déjà consommé sur un match débuté : interdit de le déplacer.
  if (isJokerLocked(pid) && pronos.jokers[pid] !== matchId) return
  pronos.toggleJoker(pid, matchId, pronos.pronostics[pid]?.[matchId])
}
</script>

<template>
  <div>
    <!-- Toggle Live / Groupe / Élimination -->
    <div style="display: flex; gap: 6px; margin-bottom: 12px; background: #0f172a; border-radius: 10px; padding: 4px">
      <button
        :style="{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontFamily: 'Anton, sans-serif', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase', background: activeStageType === 'live' ? 'linear-gradient(135deg, #ef4444, #b91c1c)' : 'transparent', color: activeStageType === 'live' ? '#fff' : '#64748b', boxShadow: activeStageType === 'live' ? '0 2px 0 #7f1d1d' : 'none' }"
        @click="activeStageType = 'live'">
        <span v-if="liveMatches.length" class="live-dot" style="width: 7px; height: 7px; background: #fff"></span><span v-else>🔴</span> Live
        <span v-if="liveMatches.length" style="background: rgba(0,0,0,0.3); border-radius: 999px; padding: 0 6px; font-size: 10px">{{ liveMatches.length }}</span>
      </button>
      <button
        :style="{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontFamily: 'Anton, sans-serif', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase', background: activeStageType === 'knockout' ? 'linear-gradient(135deg, #f59e0b, #b45309)' : 'transparent', color: activeStageType === 'knockout' ? '#0a0e1a' : '#64748b', boxShadow: activeStageType === 'knockout' ? '0 2px 0 #451a03' : 'none', opacity: !hasKOMatches && activeStageType !== 'knockout' ? 0.4 : 1 }"
        @click="activeStageType = 'knockout'">🏆 Élimination</button>
      <button
        :style="{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontFamily: 'Anton, sans-serif', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase', background: activeStageType === 'group' ? 'linear-gradient(135deg, #dc2626, #991b1b)' : 'transparent', color: activeStageType === 'group' ? '#fff' : '#64748b', boxShadow: activeStageType === 'group' ? '0 2px 0 #1e3a8a' : 'none' }"
        @click="activeStageType = 'group'">⚽ Groupes</button>
    </div>

    <!-- Groupe pills -->
    <div v-if="activeStageType === 'group'" style="margin-bottom: 14px">
      <div :style="sLabel">★ Groupe</div>
      <div style="display: flex; flex-wrap: wrap; gap: 6px">
        <button v-for="gid in GROUP_IDS" :key="gid" class="group-pill"
          :style="{ background: activeGroup === gid ? 'linear-gradient(135deg, #dc2626, #991b1b)' : '#1e293b', color: activeGroup === gid ? '#fff' : '#94a3b8', borderColor: activeGroup === gid ? '#fbbf24' : 'transparent', boxShadow: activeGroup === gid ? '0 2px 0 #1e3a8a' : 'none' }"
          @click="activeGroup = gid">{{ gid }}</button>
      </div>
    </div>

    <!-- KO stage pills -->
    <div v-if="activeStageType === 'knockout'" style="margin-bottom: 14px">
      <div :style="sLabel">★ Phase</div>
      <div style="display: flex; flex-wrap: wrap; gap: 6px">
        <button v-for="s in KO_STAGES" :key="s.id" class="group-pill"
          :style="{ background: activeKOStage === s.id ? 'linear-gradient(135deg, #f59e0b, #b45309)' : '#1e293b', color: activeKOStage === s.id ? '#0a0e1a' : '#94a3b8', borderColor: activeKOStage === s.id ? '#f59e0b' : 'transparent', boxShadow: activeKOStage === s.id ? '0 2px 0 #451a03' : 'none' }"
          @click="activeKOStage = s.id">{{ s.label }}</button>
      </div>
    </div>

    <!-- Participant selector -->
    <div style="margin-bottom: 14px">
      <div :style="sLabel">★ Pronostics de</div>
      <div style="display: flex; flex-wrap: wrap; gap: 6px">
        <button v-for="p in parts.participants" :key="p.id"
          :style="{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px 6px 6px', background: activeParticipant === p.id ? p.color : '#1e293b', color: activeParticipant === p.id ? '#fff' : '#94a3b8', border: '1px solid ' + (activeParticipant === p.id ? p.color : C.border), borderRadius: '999px', cursor: 'pointer', fontFamily: 'Anton, sans-serif', fontSize: '13px', letterSpacing: '0.5px', boxShadow: activeParticipant === p.id ? '0 2px 0 ' + p.color + '66' : 'none' }"
          @click="activeParticipant = p.id">
          <span :style="{ width: '22px', height: '22px', borderRadius: '50%', background: activeParticipant === p.id ? 'rgba(0,0,0,0.25)' : p.color, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }">{{ initials(p.name) }}</span>
          {{ p.name }}{{ isMe(p.id) ? ' (moi)' : '' }}
        </button>
      </div>
    </div>

    <!-- Read-only notice -->
    <div v-if="!canEditProno" :style="{ background: '#1e293b', border: '1px solid ' + C.border, borderRadius: '8px', padding: '8px 14px', marginBottom: '12px', fontSize: '12px', color: C.muted, display: 'flex', alignItems: 'center', gap: '6px' }">
      👁 Mode lecture seule — pronostics de {{ activeParticipantName() }}
    </div>

    <!-- Pronostic deadline notice (only shown when editing own pronostics) -->
    <div v-if="canEditProno" :style="{ background: 'linear-gradient(135deg, rgba(30,58,138,0.4), rgba(30,41,59,0.6))', border: '1px solid rgba(96,165,250,0.3)', borderRadius: '10px', padding: '10px 14px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }">
      <span style="font-size: 20px; flex-shrink: 0">⏱️</span>
      <div>
        <div style="font-family: Anton, sans-serif; font-size: 12px; letter-spacing: 1px; color: #60a5fa; margin-bottom: 2px">DEADLINE PRONOSTICS</div>
        <div style="font-size: 11px; color: #94a3b8">Saisissez vos pronostics <b style="color: #f8fafc">avant le coup d'envoi</b> — une fois le match lancé, la saisie est verrouillée 🔒</div>
      </div>
    </div>

    <!-- Admin sync buttons -->
    <div v-if="admin.isAdmin" style="display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 12px">
      <button
        :disabled="admin.syncLoading"
        :style="{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'linear-gradient(135deg, #0f172a, #1e293b)', border: '1px solid rgba(34,197,94,0.4)', borderRadius: '8px', cursor: admin.syncLoading ? 'not-allowed' : 'pointer', fontFamily: 'Anton, sans-serif', fontSize: '11px', letterSpacing: '1px', color: '#22c55e', opacity: admin.syncLoading ? 0.6 : 1 }"
        @click="admin.syncFromApi()">
        <span>{{ admin.syncLoading ? '⏳' : '🔄' }}</span>
        {{ admin.syncLoading ? 'SYNC…' : 'SYNC SCORES' }}
      </button>
      <button
        :disabled="admin.scheduleLoading"
        :style="{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'linear-gradient(135deg, #0f172a, #1e293b)', border: '1px solid rgba(96,165,250,0.4)', borderRadius: '8px', cursor: admin.scheduleLoading ? 'not-allowed' : 'pointer', fontFamily: 'Anton, sans-serif', fontSize: '11px', letterSpacing: '1px', color: '#60a5fa', opacity: admin.scheduleLoading ? 0.6 : 1 }"
        @click="admin.syncSchedule()">
        <span>{{ admin.scheduleLoading ? '⏳' : '📅' }}</span>
        {{ admin.scheduleLoading ? 'SYNC…' : 'SYNC HORAIRES' }}
      </button>
      <button
        :disabled="admin.oddsLoading"
        :style="{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'linear-gradient(135deg, #0f172a, #1e293b)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: '8px', cursor: admin.oddsLoading ? 'not-allowed' : 'pointer', fontFamily: 'Anton, sans-serif', fontSize: '11px', letterSpacing: '1px', color: '#f59e0b', opacity: admin.oddsLoading ? 0.6 : 1 }"
        @click="admin.syncOdds()">
        <span>{{ admin.oddsLoading ? '⏳' : '💰' }}</span>
        {{ admin.oddsLoading ? 'SYNC…' : 'SYNC COTES' }}
      </button>
      <span v-if="admin.syncMsg" style="font-size: 11px; color: #22c55e">{{ admin.syncMsg }}</span>
      <span v-if="admin.scheduleMsg" style="font-size: 11px; color: #60a5fa">{{ admin.scheduleMsg }}</span>
      <span v-if="admin.oddsMsg" style="font-size: 11px; color: #f59e0b">{{ admin.oddsMsg }}</span>
    </div>

    <!-- ══ LIVE MODE ══ -->
    <template v-if="activeStageType === 'live'">
      <!-- Banner: état du direct -->
      <div :style="{ background: liveMatches.length ? 'linear-gradient(135deg, rgba(239,68,68,0.18), rgba(127,29,29,0.25))' : 'rgba(15,23,42,0.6)', border: '1px solid ' + (liveMatches.length ? 'rgba(239,68,68,0.4)' : C.border), borderRadius: '10px', padding: '10px 14px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }">
        <span v-if="liveMatches.length" class="live-dot" style="width: 10px; height: 10px; background: #ef4444; flex-shrink: 0"></span>
        <span v-else style="font-size: 18px; flex-shrink: 0">📺</span>
        <div>
          <div class="anton" :style="{ fontSize: '12px', letterSpacing: '1px', color: liveMatches.length ? '#fca5a5' : '#94a3b8' }">
            {{ liveMatches.length ? (liveMatches.length > 1 ? liveMatches.length + ' MATCHS EN DIRECT' : 'MATCH EN DIRECT') : 'AUCUN MATCH EN DIRECT' }}
          </div>
          <div style="font-size: 11px; color: #94a3b8">
            <template v-if="liveMatches.length">Suivez les scores en temps réel ⚽</template>
            <template v-else-if="todayMatches.length">Programme du jour ci-dessous</template>
            <template v-else-if="nextMatch">Prochain match : {{ nextMatch.home }} – {{ nextMatch.away }} · {{ formatDate(nextMatch.matchDate) }} {{ formatMatchTime(nextMatch) }}</template>
            <template v-else>Aucun match programmé</template>
          </div>
        </div>
      </div>

      <!-- Live / programme cards -->
      <div v-for="m in liveDisplayMatches" :key="'live' + m.id" style="position: relative; margin-bottom: 12px">
        <div class="card-rel"
          :style="{ ...sCard, padding: '0', border: '1px solid ' + (m.liveStatus === 'live' ? 'rgba(239,68,68,0.5)' : (isJokerMatch(activeParticipant, m.id) ? '#f59e0b66' : C.border)), boxShadow: m.liveStatus === 'live' ? '0 0 0 1px rgba(239,68,68,0.25), 0 4px 14px rgba(239,68,68,0.18)' : 'none' }">
          <div style="height: 4px; border-radius: 4px 4px 0 0" :style="{ background: m.liveStatus === 'live' ? 'linear-gradient(90deg, #ef4444, #b91c1c, #7f1d1d)' : 'linear-gradient(90deg, #334155, #1e293b)' }"></div>
          <!-- Header -->
          <div :style="{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: '1px solid ' + C.border, background: 'rgba(15,23,42,0.5)' }">
            <div style="display: flex; align-items: center; gap: 8px">
              <span class="anton" style="font-size: 11px; color: #fbbf24; letter-spacing: 1.5px">{{ matchStageLabel(m) }}</span>
              <template v-if="m.matchDate">
                <span :style="{ color: C.muted, fontSize: '10px' }">·</span>
                <span :style="{ color: '#94a3b8', fontSize: '10px' }">📅 {{ formatDate(m.matchDate) }}</span>
                <span v-if="m.matchTime" :style="{ color: '#64748b', fontSize: '10px' }">{{ formatMatchTime(m) }}</span>
              </template>
            </div>
            <div style="display: flex; align-items: center; gap: 8px">
              <span v-if="m.venue" :style="{ color: '#475569', fontSize: '10px' }">📍 {{ m.venue }}</span>
              <div v-if="isJokerMatch(activeParticipant, m.id)" style="font-size: 10px; background: linear-gradient(90deg, #f59e0b, #d97706); color: #0a0e1a; border-radius: 4px; padding: 3px 8px; font-weight: 800; font-family: Anton, sans-serif; letter-spacing: 1px">🃏 JOKER ×2</div>
              <div v-if="m.liveStatus === 'live'"
                style="display: flex; align-items: center; gap: 5px; background: rgba(220,38,38,0.15); border: 1px solid rgba(220,38,38,0.4); border-radius: 6px; padding: 3px 8px">
                <span class="live-dot" style="width: 6px; height: 6px; background: #ef4444"></span>
                <span style="font-family: Anton, sans-serif; font-size: 10px; color: #fca5a5; letter-spacing: 1px">EN DIRECT</span>
              </div>
            </div>
          </div>

          <div style="padding: 14px">
            <!-- Teams -->
            <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: stretch; margin-bottom: 14px">
              <div class="team-block home" :style="{ cursor: m.homeKnown ? 'pointer' : 'default' }" :title="m.homeKnown ? 'Voir la composition' : ''" @click.stop="m.homeKnown && openLineup(m)">
                <div class="flag-bg" :style="{ background: m.homeKnown ? getFlagBg(m.home) : 'linear-gradient(135deg, #33415544, #1e293b)' }"></div>
                <span class="name">{{ m.home }}</span>
                <span v-if="m.homeKnown" class="flag" style="position: relative; z-index: 1; font-size: 20px; flex-shrink: 0; line-height: 1">{{ getFlag(m.home) }}</span>
              </div>
              <div style="display: flex; align-items: center"><span class="vs-chunk">VS</span></div>
              <div class="team-block away" :style="{ cursor: m.awayKnown ? 'pointer' : 'default' }" :title="m.awayKnown ? 'Voir la composition' : ''" @click.stop="m.awayKnown && openLineup(m)">
                <div class="flag-bg" :style="{ background: m.awayKnown ? getFlagBg(m.away) : 'linear-gradient(135deg, #1e293b, #33415544)' }"></div>
                <span v-if="m.awayKnown" class="flag" style="position: relative; z-index: 1; font-size: 20px; flex-shrink: 0; line-height: 1">{{ getFlag(m.away) }}</span>
                <span class="name">{{ m.away }}</span>
              </div>
            </div>

            <MatchOdds :match="m" />

            <!-- Pronostic + résultat -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px">
              <!-- Pronostic panel -->
              <div :style="{ background: '#0a0e1a', borderRadius: '10px', padding: '10px 8px', border: '1px solid ' + activeParticipantColor() + '44' }">
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px">
                  <span :style="{ width: '6px', height: '6px', borderRadius: '50%', background: activeParticipantColor() }"></span>
                  <span :style="{ fontSize: '9px', color: activeParticipantColor(), fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase' }">{{ activeParticipantName() || 'Pronostic' }}</span>
                  <span v-if="canEditProno && !canEditMatchProno(m.id)" style="font-size: 9px; color: #ef4444; margin-left: 2px" title="Match débuté">🔒</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px; justify-content: center">
                  <input class="score-led" type="number" min="0" max="20" placeholder="–"
                    :style="{ opacity: canEditPronoInput(m.id) ? 1 : 0.5 }"
                    :disabled="!canEditPronoInput(m.id)"
                    :value="(getProno(activeParticipant, m.id) as any).home ?? ''"
                    @input="setProno(activeParticipant, m.id, 'home', ($event.target as HTMLInputElement).value)" />
                  <span style="color: #475569; font-weight: 700; font-size: 22px; font-family: Anton, sans-serif">:</span>
                  <input class="score-led" type="number" min="0" max="20" placeholder="–"
                    :style="{ opacity: canEditPronoInput(m.id) ? 1 : 0.5 }"
                    :disabled="!canEditPronoInput(m.id)"
                    :value="(getProno(activeParticipant, m.id) as any).away ?? ''"
                    @input="setProno(activeParticipant, m.id, 'away', ($event.target as HTMLInputElement).value)" />
                </div>
              </div>
              <!-- Result / live score panel -->
              <div :style="{ background: '#0a0e1a', borderRadius: '10px', padding: '10px 8px', border: '1px solid ' + (m.liveStatus === 'live' ? 'rgba(239,68,68,0.4)' : (m.result.home !== '' && m.result.away !== '' ? '#22c55e44' : C.border)), position: 'relative', overflow: 'hidden' }">
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px">
                  <span :class="(m.liveStatus === 'live' || (m.result.home !== '' && m.result.away !== '')) ? 'live-dot' : ''"
                    :style="{ width: '6px', height: '6px', borderRadius: '50%', background: m.liveStatus === 'live' ? '#ef4444' : (m.result.home !== '' && m.result.away !== '' ? '#22c55e' : '#475569') }"></span>
                  <span :style="{ fontSize: '9px', color: m.liveStatus === 'live' ? '#fca5a5' : (m.result.home !== '' && m.result.away !== '' ? '#22c55e' : '#475569'), fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase' }">{{ m.liveStatus === 'live' ? 'Score en direct' : 'Résultat' }}</span>
                  <span v-if="liveMinuteLabel(m)" style="font-size: 11px; font-weight: 700; color: #fff; padding-left: 5px; border-left: 1px solid rgba(239,68,68,0.4)">⏱ {{ liveMinuteLabel(m) }}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px; justify-content: center">
                  <div class="score-led-ro" :style="{ color: m.result.home !== '' ? (m.liveStatus === 'live' ? '#fca5a5' : '#fbbf24') : '#334155' }">{{ m.result.home !== '' ? m.result.home : '–' }}</div>
                  <span style="color: #475569; font-weight: 700; font-size: 22px; font-family: Anton, sans-serif">:</span>
                  <div class="score-led-ro" :style="{ color: m.result.away !== '' ? (m.liveStatus === 'live' ? '#fca5a5' : '#fbbf24') : '#334155' }">{{ m.result.away !== '' ? m.result.away : '–' }}</div>
                </div>
              </div>
            </div>

            <!-- Buts + Cartons -->
            <div v-if="m.result.goalsHome.length || m.result.goalsAway.length || m.result.cardsHome.length || m.result.cardsAway.length"
              style="margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px">
              <div style="text-align: right">
                <div v-for="(e, i) in sideEvents(m.result.goalsHome, m.result.goalsAway, m.result.cardsHome)" :key="'h' + i" style="font-size: 10px; color: #cbd5e1; line-height: 1.7">
                  {{ e.name }}<span v-if="e.owngoal" style="color: #ef4444"> (csc)</span><span v-if="e.penalty" style="color: #f59e0b"> (p)</span> {{ e.emoji }} <span style="color: #64748b">{{ e.minute }}'</span>
                </div>
              </div>
              <div>
                <div v-for="(e, i) in sideEvents(m.result.goalsAway, m.result.goalsHome, m.result.cardsAway)" :key="'a' + i" style="font-size: 10px; color: #cbd5e1; line-height: 1.7">
                  <span style="color: #64748b">{{ e.minute }}'</span> {{ e.emoji }}<span v-if="e.penalty" style="color: #f59e0b"> (p)</span><span v-if="e.owngoal" style="color: #ef4444"> (csc)</span> {{ e.name }}
                </div>
              </div>
            </div>

            <!-- Footer: joker + pts -->
            <div :style="{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed ' + C.border }">
              <button v-if="canToggleJoker(m.id)"
                :style="{ background: isJokerMatch(activeParticipant, m.id) ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'transparent', color: isJokerMatch(activeParticipant, m.id) ? '#0a0e1a' : '#94a3b8', border: '1px solid ' + (isJokerMatch(activeParticipant, m.id) ? '#f59e0b' : C.border), borderRadius: '999px', padding: '5px 12px', cursor: 'pointer', fontFamily: 'Anton, sans-serif', fontSize: '11px', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '4px' }"
                @click="toggleJoker(activeParticipant, m.id)">
                🃏 {{ isJokerMatch(activeParticipant, m.id) ? 'RETIRER JOKER' : 'POSER LE JOKER' }}
              </button>
              <div v-else-if="isJokerLocked(activeParticipant) && canEditMatchProno(m.id)" style="font-size: 10px; color: #64748b; font-family: Anton, sans-serif; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px">🃏 Joker déjà utilisé</div>
          <div v-else></div>
              <div v-if="m.result.home !== '' && m.result.away !== ''" style="display: flex; align-items: center; gap: 8px">
                <span v-if="m.liveStatus === 'live'" style="font-size: 10px; color: #fca5a5; font-family: Anton, sans-serif; letter-spacing: 0.5px">PROVISOIRE</span>
                <span v-if="getMatchPts(activeParticipant, m.id) === 3" style="font-size: 18px">🎯</span>
                <span v-else-if="getMatchPts(activeParticipant, m.id) === 1" style="font-size: 16px">✅</span>
                <span v-else style="font-size: 16px; opacity: 0.6">❌</span>
                <span class="anton" :style="{ fontSize: '18px', color: ptColor(getMatchPts(activeParticipant, m.id), true) }">
                  +{{ isJokerMatch(activeParticipant, m.id) ? getMatchPts(activeParticipant, m.id) * 2 : getMatchPts(activeParticipant, m.id) }} pts
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Aucun match du tout -->
      <div v-if="liveDisplayMatches.length === 0"
        :style="{ ...sCard, textAlign: 'center', padding: '32px 20px', color: C.muted }">
        <div style="font-size: 36px; margin-bottom: 8px">😴</div>
        <div class="anton" style="font-size: 14px; color: #475569; letter-spacing: 1px">Aucun match à l'horizon</div>
        <div style="font-size: 12px; margin-top: 6px">Reviens quand le ballon roule !</div>
      </div>
    </template>

    <!-- KO : aucun match disponible -->
    <div v-if="activeStageType === 'knockout' && koStageMatches.length === 0"
      :style="{ ...sCard, textAlign: 'center', padding: '32px 20px', color: C.muted }">
      <div style="font-size: 36px; margin-bottom: 8px">⏳</div>
      <div class="anton" style="font-size: 14px; color: #475569; letter-spacing: 1px">Matchs à venir</div>
      <div style="font-size: 12px; margin-top: 6px">Les équipes qualifiées apparaîtront ici à l'issue de la phase de groupes.</div>
    </div>

    <!-- KO match cards -->
    <div v-if="activeStageType === 'knockout'" v-for="m in koStageMatches" :key="m.id" style="position: relative; margin-bottom: 12px">
    <div class="card-rel"
      :style="{ ...sCard, padding: '0', border: '1px solid ' + (isJokerMatch(activeParticipant, m.id) ? '#f59e0b66' : '#f59e0b33') }">
      <div style="height: 4px; background: linear-gradient(90deg, #f59e0b, #d97706, #92400e); border-radius: 4px 4px 0 0"></div>
      <!-- KO header -->
      <div :style="{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: '1px solid ' + C.border, background: 'rgba(15,23,42,0.5)' }">
        <div style="display: flex; align-items: center; gap: 8px">
          <span class="anton" style="font-size: 11px; color: #f59e0b; letter-spacing: 1.5px">{{ koStageLabel(m.stage) }}</span>
          <template v-if="m.matchDate">
            <span :style="{ color: C.muted, fontSize: '10px' }">·</span>
            <span :style="{ color: '#94a3b8', fontSize: '10px' }">📅 {{ formatDate(m.matchDate) }}</span>
            <span v-if="m.matchTime" :style="{ color: '#64748b', fontSize: '10px' }">{{ formatMatchTime(m) }}</span>
          </template>
        </div>
        <div style="display: flex; align-items: center; gap: 8px">
          <span v-if="m.venue" :style="{ color: '#475569', fontSize: '10px' }">📍 {{ m.venue }}</span>
          <div v-if="isJokerMatch(activeParticipant, m.id)" style="font-size: 10px; background: linear-gradient(90deg, #f59e0b, #d97706); color: #0a0e1a; border-radius: 4px; padding: 3px 8px; font-weight: 800; font-family: Anton, sans-serif; letter-spacing: 1px">🃏 JOKER ×2</div>
          <div v-if="m.liveStatus === 'live'"
            style="display: flex; align-items: center; gap: 5px; background: rgba(220,38,38,0.15); border: 1px solid rgba(220,38,38,0.4); border-radius: 6px; padding: 3px 8px">
            <span class="live-dot" style="width: 6px; height: 6px; background: #ef4444"></span>
            <span style="font-family: Anton, sans-serif; font-size: 10px; color: #fca5a5; letter-spacing: 1px">EN DIRECT</span>
          </div>
        </div>
      </div>
      <div style="padding: 14px">
        <!-- Équipes (connues ou labels) -->
        <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: stretch; margin-bottom: 14px">
          <div class="team-block home" :style="{ cursor: m.homeKnown ? 'pointer' : 'default' }" :title="m.homeKnown ? 'Voir la composition' : ''" @click.stop="m.homeKnown && openLineup(m)">
            <div class="flag-bg" :style="{ background: m.homeKnown ? getFlagBg(m.home) : 'linear-gradient(135deg, #f59e0b33, #451a03)' }"></div>
            <span class="name" :style="{ color: m.homeKnown ? '#fff' : '#f59e0b' }">{{ m.home }}</span>
            <span v-if="m.homeKnown" class="flag" style="position: relative; z-index: 1; font-size: 20px; flex-shrink: 0; line-height: 1">{{ getFlag(m.home) }}</span>
          </div>
          <div style="display: flex; align-items: center"><span class="vs-chunk">VS</span></div>
          <div class="team-block away" :style="{ cursor: m.awayKnown ? 'pointer' : 'default' }" :title="m.awayKnown ? 'Voir la composition' : ''" @click.stop="m.awayKnown && openLineup(m)">
            <div class="flag-bg" :style="{ background: m.awayKnown ? getFlagBg(m.away) : 'linear-gradient(135deg, #451a03, #f59e0b33)' }"></div>
            <span v-if="m.awayKnown" class="flag" style="position: relative; z-index: 1; font-size: 20px; flex-shrink: 0; line-height: 1">{{ getFlag(m.away) }}</span>
            <span class="name" :style="{ color: m.awayKnown ? '#fff' : '#f59e0b' }">{{ m.away }}</span>
          </div>
        </div>

        <MatchOdds :match="m" />

        <!-- Pronostic + résultat (seulement si les deux équipes sont connues) -->
        <div v-if="m.homeKnown && m.awayKnown" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px">
          <!-- Pronostic panel -->
          <div :style="{ background: '#0a0e1a', borderRadius: '10px', padding: '10px 8px', border: '1px solid ' + activeParticipantColor() + '44' }">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px">
              <span :style="{ width: '6px', height: '6px', borderRadius: '50%', background: activeParticipantColor() }"></span>
              <span :style="{ fontSize: '9px', color: activeParticipantColor(), fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase' }">{{ activeParticipantName() || 'Pronostic' }}</span>
              <span v-if="canEditProno && !canEditMatchProno(m.id)" style="font-size: 9px; color: #ef4444; margin-left: 2px" title="Match débuté">🔒</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px; justify-content: center">
              <input class="score-led" type="number" min="0" max="20" placeholder="–"
                :style="{ opacity: canEditPronoInput(m.id) ? 1 : 0.5 }"
                :disabled="!canEditPronoInput(m.id)"
                :value="(getProno(activeParticipant, m.id) as any).home ?? ''"
                @input="setProno(activeParticipant, m.id, 'home', ($event.target as HTMLInputElement).value)" />
              <span style="color: #475569; font-weight: 700; font-size: 22px; font-family: Anton, sans-serif">:</span>
              <input class="score-led" type="number" min="0" max="20" placeholder="–"
                :style="{ opacity: canEditPronoInput(m.id) ? 1 : 0.5 }"
                :disabled="!canEditPronoInput(m.id)"
                :value="(getProno(activeParticipant, m.id) as any).away ?? ''"
                @input="setProno(activeParticipant, m.id, 'away', ($event.target as HTMLInputElement).value)" />
            </div>
          </div>
          <!-- Result panel -->
          <div :style="{ background: '#0a0e1a', borderRadius: '10px', padding: '10px 8px', border: '1px solid ' + (m.result.home !== '' && m.result.away !== '' ? '#22c55e44' : (canEditResult ? '#fbbf2444' : C.border)), position: 'relative', overflow: 'hidden' }">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px">
              <span :class="m.result.home !== '' && m.result.away !== '' ? 'live-dot' : ''"
                :style="{ width: '6px', height: '6px', borderRadius: '50%', background: m.result.home !== '' && m.result.away !== '' ? '#22c55e' : (canEditResult ? '#fbbf24' : '#475569') }"></span>
              <span :style="{ fontSize: '9px', color: m.result.home !== '' && m.result.away !== '' ? '#22c55e' : (canEditResult ? '#fbbf24' : '#475569'), fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase' }">Résultat final</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px; justify-content: center">
              <template v-if="canEditResult">
                <input class="score-led" type="number" min="0" max="20" placeholder="–"
                  :value="m.result.home !== '' ? m.result.home : ''"
                  @input="setMatchResult(m.id, 'home', ($event.target as HTMLInputElement).value)" />
                <span style="color: #475569; font-weight: 700; font-size: 22px; font-family: Anton, sans-serif">:</span>
                <input class="score-led" type="number" min="0" max="20" placeholder="–"
                  :value="m.result.away !== '' ? m.result.away : ''"
                  @input="setMatchResult(m.id, 'away', ($event.target as HTMLInputElement).value)" />
              </template>
              <template v-else>
                <div class="score-led-ro" :style="{ color: m.result.home !== '' ? '#fbbf24' : '#334155' }">{{ m.result.home !== '' ? m.result.home : '–' }}</div>
                <span style="color: #475569; font-weight: 700; font-size: 22px; font-family: Anton, sans-serif">:</span>
                <div class="score-led-ro" :style="{ color: m.result.away !== '' ? '#fbbf24' : '#334155' }">{{ m.result.away !== '' ? m.result.away : '–' }}</div>
              </template>
            </div>
          </div>
        </div>
        <!-- Message si équipes inconnues -->
        <div v-else :style="{ textAlign: 'center', padding: '12px', color: '#64748b', fontSize: '12px', fontStyle: 'italic' }">
          Équipes à définir à l'issue de la phase de groupes
        </div>

        <!-- Buts + Cartons KO — 2 colonnes sous chaque équipe -->
        <div v-if="m.homeKnown && m.awayKnown && (m.result.goalsHome.length || m.result.goalsAway.length || m.result.cardsHome.length || m.result.cardsAway.length)"
          style="margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px">
          <div style="text-align: right">
            <div v-for="(e, i) in sideEvents(m.result.goalsHome, m.result.goalsAway, m.result.cardsHome)" :key="'h' + i" style="font-size: 10px; color: #cbd5e1; line-height: 1.7">
              {{ e.name }}<span v-if="e.owngoal" style="color: #ef4444"> (csc)</span><span v-if="e.penalty" style="color: #f59e0b"> (p)</span> {{ e.emoji }} <span style="color: #64748b">{{ e.minute }}'</span>
            </div>
          </div>
          <div>
            <div v-for="(e, i) in sideEvents(m.result.goalsAway, m.result.goalsHome, m.result.cardsAway)" :key="'a' + i" style="font-size: 10px; color: #cbd5e1; line-height: 1.7">
              <span style="color: #64748b">{{ e.minute }}'</span> {{ e.emoji }}<span v-if="e.penalty" style="color: #f59e0b"> (p)</span><span v-if="e.owngoal" style="color: #ef4444"> (csc)</span> {{ e.name }}
            </div>
          </div>
        </div>

        <!-- Édition buteurs KO (admin) -->
        <div v-if="m.homeKnown && m.awayKnown && canEditResult" style="margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px">
          <div>
            <div style="font-size: 9px; color: #64748b; margin-bottom: 2px; text-align: right">← Buteurs dom.</div>
            <textarea :style="{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '4px', color: '#94a3b8', fontSize: '10px', width: '100%', padding: '4px 6px', fontFamily: 'Syne, sans-serif', resize: 'vertical', minHeight: '40px', outline: 'none', lineHeight: '1.5' }" placeholder='Nom, min [, pen/csc]' :value="m.result.goalsHomeText" @input="setMatchGoalText(m.id, 'home', ($event.target as HTMLTextAreaElement).value)"></textarea>
          </div>
          <div>
            <div style="font-size: 9px; color: #64748b; margin-bottom: 2px">Buteurs ext. →</div>
            <textarea :style="{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '4px', color: '#94a3b8', fontSize: '10px', width: '100%', padding: '4px 6px', fontFamily: 'Syne, sans-serif', resize: 'vertical', minHeight: '40px', outline: 'none', lineHeight: '1.5' }" placeholder='Nom, min [, pen/csc]' :value="m.result.goalsAwayText" @input="setMatchGoalText(m.id, 'away', ($event.target as HTMLTextAreaElement).value)"></textarea>
          </div>
        </div>

        <!-- Footer KO -->
        <div v-if="m.homeKnown && m.awayKnown" :style="{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed ' + C.border }">
          <button v-if="canToggleJoker(m.id)"
            :style="{ background: isJokerMatch(activeParticipant, m.id) ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'transparent', color: isJokerMatch(activeParticipant, m.id) ? '#0a0e1a' : '#94a3b8', border: '1px solid ' + (isJokerMatch(activeParticipant, m.id) ? '#f59e0b' : C.border), borderRadius: '999px', padding: '5px 12px', cursor: 'pointer', fontFamily: 'Anton, sans-serif', fontSize: '11px', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '4px' }"
            @click="toggleJoker(activeParticipant, m.id)">
            🃏 {{ isJokerMatch(activeParticipant, m.id) ? 'RETIRER JOKER' : 'POSER LE JOKER' }}
          </button>
          <div v-else-if="isJokerLocked(activeParticipant) && canEditMatchProno(m.id)" style="font-size: 10px; color: #64748b; font-family: Anton, sans-serif; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px">🃏 Joker déjà utilisé</div>
          <div v-else></div>
          <div v-if="m.result.home !== '' && m.result.away !== ''" style="display: flex; align-items: center; gap: 8px">
            <span v-if="getMatchPts(activeParticipant, m.id) === 3" style="font-size: 18px">🎯</span>
            <span v-else-if="getMatchPts(activeParticipant, m.id) === 1" style="font-size: 16px">✅</span>
            <span v-else style="font-size: 16px; opacity: 0.6">❌</span>
            <span class="anton" :style="{ fontSize: '18px', color: ptColor(getMatchPts(activeParticipant, m.id), true) }">
              +{{ isJokerMatch(activeParticipant, m.id) ? getMatchPts(activeParticipant, m.id) * 2 : getMatchPts(activeParticipant, m.id) }} pts
            </span>
          </div>
        </div>
      </div>
    </div>
    <img v-if="m.homeKnown && m.awayKnown && m.result.home !== '' && m.result.away !== '' && getMatchPts(activeParticipant, m.id) === 3"
      src="/assets/trump-dance.gif" alt="🕺" class="trump-dance"
      style="position: absolute; top: 38%; right: 18px; transform: translateY(-50%); width: 95px; z-index: 20; pointer-events: none; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.6))" />
    </div>

    <!-- Group match cards -->
    <div v-if="activeStageType === 'group'" v-for="(m, idx) in groupMatches" :key="m.id" style="position: relative; margin-bottom: 12px">
    <div class="card-rel"
      :style="{ ...sCard, padding: '0', border: '1px solid ' + (isJokerMatch(activeParticipant, m.id) ? '#f59e0b66' : C.border), boxShadow: isJokerMatch(activeParticipant, m.id) ? '0 0 0 1px rgba(245,158,11,0.2), 0 4px 12px rgba(245,158,11,0.15)' : 'none' }">
      <div class="scoreboard-strip"></div>
      <!-- Match header -->
      <div :style="{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: '1px solid ' + C.border, background: 'rgba(15,23,42,0.5)' }">
        <div style="display: flex; align-items: center; gap: 8px">
          <span class="anton" style="font-size: 11px; color: #fbbf24; letter-spacing: 1.5px">GROUPE {{ m.group }}</span>
          <span :style="{ color: C.muted, fontSize: '10px' }">·</span>
          <span :style="{ color: C.muted, fontSize: '10px', letterSpacing: '1px' }">MATCH {{ idx + 1 }}/6</span>
          <template v-if="m.matchDate">
            <span :style="{ color: C.muted, fontSize: '10px' }">·</span>
            <span :style="{ color: '#94a3b8', fontSize: '10px' }">📅 {{ formatDate(m.matchDate) }}</span>
            <span v-if="m.matchTime" :style="{ color: '#64748b', fontSize: '10px' }">{{ formatMatchTime(m) }}</span>
          </template>
        </div>
        <div style="display: flex; align-items: center; gap: 8px">
          <span v-if="m.venue" :style="{ color: '#475569', fontSize: '10px' }">📍 {{ m.venue }}</span>
          <div v-if="isJokerMatch(activeParticipant, m.id)" style="font-size: 10px; background: linear-gradient(90deg, #f59e0b, #d97706); color: #0a0e1a; border-radius: 4px; padding: 3px 8px; font-weight: 800; font-family: Anton, sans-serif; letter-spacing: 1px">🃏 JOKER ×2</div>
          <div v-if="m.liveStatus === 'live'"
            style="display: flex; align-items: center; gap: 5px; background: rgba(220,38,38,0.15); border: 1px solid rgba(220,38,38,0.4); border-radius: 6px; padding: 3px 8px">
            <span class="live-dot" style="width: 6px; height: 6px; background: #ef4444"></span>
            <span style="font-family: Anton, sans-serif; font-size: 10px; color: #fca5a5; letter-spacing: 1px">EN DIRECT</span>
          </div>
        </div>
      </div>

      <!-- Teams + score inputs -->
      <div style="padding: 14px">
        <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: stretch; margin-bottom: 14px">
          <div class="team-block home" style="cursor: pointer" title="Voir la composition" @click.stop="openLineup(m)">
            <div class="flag-bg" :style="{ background: getFlagBg(m.home) }"></div>
            <span class="name">{{ m.home }}</span>
            <span class="flag" style="position: relative; z-index: 1; font-size: 20px; flex-shrink: 0; line-height: 1">{{ getFlag(m.home) }}</span>
          </div>
          <div style="display: flex; align-items: center">
            <span class="vs-chunk">VS</span>
          </div>
          <div class="team-block away" style="cursor: pointer" title="Voir la composition" @click.stop="openLineup(m)">
            <div class="flag-bg" :style="{ background: getFlagBg(m.away) }"></div>
            <span class="flag" style="position: relative; z-index: 1; font-size: 20px; flex-shrink: 0; line-height: 1">{{ getFlag(m.away) }}</span>
            <span class="name">{{ m.away }}</span>
          </div>
        </div>

        <MatchOdds :match="m" />

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px">
          <!-- Pronostic panel -->
          <div :style="{ background: '#0a0e1a', borderRadius: '10px', padding: '10px 8px', border: '1px solid ' + activeParticipantColor() + '44', position: 'relative' }">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px">
              <span :style="{ width: '6px', height: '6px', borderRadius: '50%', background: activeParticipantColor() }"></span>
              <span :style="{ fontSize: '9px', color: activeParticipantColor(), fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase' }">{{ activeParticipantName() || 'Pronostic' }}</span>
              <span v-if="canEditProno && !canEditMatchProno(m.id)" style="font-size: 9px; color: #ef4444; margin-left: 2px" title="Match débuté">🔒</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px; justify-content: center">
              <input class="score-led" type="number" min="0" max="20" placeholder="–"
                :style="{ opacity: canEditPronoInput(m.id) ? 1 : 0.5 }"
                :disabled="!canEditPronoInput(m.id)"
                :value="(getProno(activeParticipant, m.id) as any).home ?? ''"
                @input="setProno(activeParticipant, m.id, 'home', ($event.target as HTMLInputElement).value)" />
              <span style="color: #475569; font-weight: 700; font-size: 22px; font-family: Anton, sans-serif">:</span>
              <input class="score-led" type="number" min="0" max="20" placeholder="–"
                :style="{ opacity: canEditPronoInput(m.id) ? 1 : 0.5 }"
                :disabled="!canEditPronoInput(m.id)"
                :value="(getProno(activeParticipant, m.id) as any).away ?? ''"
                @input="setProno(activeParticipant, m.id, 'away', ($event.target as HTMLInputElement).value)" />
            </div>
          </div>
          <!-- Result panel -->
          <div :style="{ background: '#0a0e1a', borderRadius: '10px', padding: '10px 8px', border: '1px solid ' + (m.result.home !== '' && m.result.away !== '' ? '#22c55e44' : (canEditResult ? '#fbbf2444' : C.border)), position: 'relative', overflow: 'hidden' }">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px">
              <span :class="m.result.home !== '' && m.result.away !== '' ? 'live-dot' : ''"
                :style="{ width: '6px', height: '6px', borderRadius: '50%', background: m.result.home !== '' && m.result.away !== '' ? '#22c55e' : (canEditResult ? '#fbbf24' : '#475569') }"></span>
              <span :style="{ fontSize: '9px', color: m.result.home !== '' && m.result.away !== '' ? '#22c55e' : (canEditResult ? '#fbbf24' : '#475569'), fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase' }">{{ canEditResult ? 'Résultat (admin)' : 'Résultat final' }}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px; justify-content: center">
              <template v-if="canEditResult">
                <input class="score-led" type="number" min="0" max="20" placeholder="–"
                  :value="m.result.home !== '' ? m.result.home : ''"
                  @input="setMatchResult(m.id, 'home', ($event.target as HTMLInputElement).value)" />
                <span style="color: #475569; font-weight: 700; font-size: 22px; font-family: Anton, sans-serif">:</span>
                <input class="score-led" type="number" min="0" max="20" placeholder="–"
                  :value="m.result.away !== '' ? m.result.away : ''"
                  @input="setMatchResult(m.id, 'away', ($event.target as HTMLInputElement).value)" />
              </template>
              <template v-else>
                <div class="score-led-ro" :style="{ color: m.result.home !== '' ? '#fbbf24' : '#334155' }">{{ m.result.home !== '' ? m.result.home : '–' }}</div>
                <span style="color: #475569; font-weight: 700; font-size: 22px; font-family: Anton, sans-serif">:</span>
                <div class="score-led-ro" :style="{ color: m.result.away !== '' ? '#fbbf24' : '#334155' }">{{ m.result.away !== '' ? m.result.away : '–' }}</div>
              </template>
            </div>
          </div>
        </div>

        <!-- Buts + Cartons — 2 colonnes sous chaque équipe -->
        <div v-if="m.result.goalsHome.length || m.result.goalsAway.length || m.result.cardsHome.length || m.result.cardsAway.length"
          style="margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px">
          <div style="text-align: right">
            <div v-for="(e, i) in sideEvents(m.result.goalsHome, m.result.goalsAway, m.result.cardsHome)" :key="'h' + i" style="font-size: 10px; color: #cbd5e1; line-height: 1.7">
              {{ e.name }}<span v-if="e.owngoal" style="color: #ef4444"> (csc)</span><span v-if="e.penalty" style="color: #f59e0b"> (p)</span> {{ e.emoji }} <span style="color: #64748b">{{ e.minute }}'</span>
            </div>
          </div>
          <div>
            <div v-for="(e, i) in sideEvents(m.result.goalsAway, m.result.goalsHome, m.result.cardsAway)" :key="'a' + i" style="font-size: 10px; color: #cbd5e1; line-height: 1.7">
              <span style="color: #64748b">{{ e.minute }}'</span> {{ e.emoji }}<span v-if="e.penalty" style="color: #f59e0b"> (p)</span><span v-if="e.owngoal" style="color: #ef4444"> (csc)</span> {{ e.name }}
            </div>
          </div>
        </div>

        <!-- Édition buteurs (admin) -->
        <div v-if="canEditResult" style="margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px">
          <div>
            <div style="font-size: 9px; color: #64748b; margin-bottom: 2px; text-align: right">← Buteurs dom. (Nom, min [, pen/csc])</div>
            <textarea
              :style="{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '4px', color: '#94a3b8', fontSize: '10px', width: '100%', padding: '4px 6px', fontFamily: 'Syne, sans-serif', resize: 'vertical', minHeight: '40px', outline: 'none', lineHeight: '1.5' }"
              placeholder="Messi, 10, pen
Alvarez, 39"
              :value="m.result.goalsHomeText"
              @input="setMatchGoalText(m.id, 'home', ($event.target as HTMLTextAreaElement).value)"></textarea>
          </div>
          <div>
            <div style="font-size: 9px; color: #64748b; margin-bottom: 2px">Buteurs ext. → (Nom, min [, pen/csc])</div>
            <textarea
              :style="{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '4px', color: '#94a3b8', fontSize: '10px', width: '100%', padding: '4px 6px', fontFamily: 'Syne, sans-serif', resize: 'vertical', minHeight: '40px', outline: 'none', lineHeight: '1.5' }"
              placeholder="Mbappe, 80, pen
Giroud, 45"
              :value="m.result.goalsAwayText"
              @input="setMatchGoalText(m.id, 'away', ($event.target as HTMLTextAreaElement).value)"></textarea>
          </div>
        </div>

        <!-- Footer: joker + result pts -->
        <div :style="{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed ' + C.border }">
          <button v-if="canToggleJoker(m.id)"
            :style="{ background: isJokerMatch(activeParticipant, m.id) ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'transparent', color: isJokerMatch(activeParticipant, m.id) ? '#0a0e1a' : '#94a3b8', border: '1px solid ' + (isJokerMatch(activeParticipant, m.id) ? '#f59e0b' : C.border), borderRadius: '999px', padding: '5px 12px', cursor: 'pointer', fontFamily: 'Anton, sans-serif', fontSize: '11px', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '4px' }"
            @click="toggleJoker(activeParticipant, m.id)">
            🃏 {{ isJokerMatch(activeParticipant, m.id) ? 'RETIRER JOKER' : 'POSER LE JOKER' }}
          </button>
          <div v-else-if="isJokerLocked(activeParticipant) && canEditMatchProno(m.id)" style="font-size: 10px; color: #64748b; font-family: Anton, sans-serif; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px">🃏 Joker déjà utilisé</div>
          <div v-else></div>
          <div v-if="m.result.home !== '' && m.result.away !== ''" style="display: flex; align-items: center; gap: 8px">
            <span v-if="getMatchPts(activeParticipant, m.id) === 3" style="font-size: 18px">🎯</span>
            <span v-else-if="getMatchPts(activeParticipant, m.id) === 1" style="font-size: 16px">✅</span>
            <span v-else style="font-size: 16px; opacity: 0.6">❌</span>
            <span class="anton" :style="{ fontSize: '18px', color: ptColor(getMatchPts(activeParticipant, m.id), true) }">
              +{{ isJokerMatch(activeParticipant, m.id) ? getMatchPts(activeParticipant, m.id) * 2 : getMatchPts(activeParticipant, m.id) }} pts
            </span>
            <span v-if="isJokerMatch(activeParticipant, m.id) && getMatchPts(activeParticipant, m.id) > 0" style="font-size: 11px; color: #f59e0b; font-family: Anton, sans-serif">({{ getMatchPts(activeParticipant, m.id) }}×2)</span>
          </div>
        </div>
      </div>
    </div>
    <img v-if="m.result.home !== '' && m.result.away !== '' && getMatchPts(activeParticipant, m.id) === 3"
      src="/assets/trump-dance.gif" alt="🕺" class="trump-dance"
      style="position: absolute; top: 38%; right: 18px; transform: translateY(-50%); width: 95px; z-index: 20; pointer-events: none; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.6))" />
    </div>
  </div>

  <!-- Lineup modal -->
  <LineupModal
    v-if="lineup.open"
    :match-id="lineup.matchId"
    :loading="lineup.loading"
    :data="lineup.data"
    :home-name="lineup.homeName"
    :away-name="lineup.awayName"
    :error="lineup.error"
    :home-goals="lineupMatch?.result.goalsHome ?? []"
    :away-goals="lineupMatch?.result.goalsAway ?? []"
    :home-cards="lineupMatch?.result.cardsHome ?? []"
    :away-cards="lineupMatch?.result.cardsAway ?? []"
    @close="lineup.open = false"
  />
</template>
