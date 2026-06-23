<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { sb } from '../../supabase'
import { C, sCard } from '../../constants/ui'
import { getFlag } from '../../utils/ui'
import { groupByRank, computeMatchStats, type StatRow } from '../../utils/stats'
import { useMatchesStore } from '../../stores/matches'

const matchesStore = useMatchesStore()

// Classement officiel issu de l'API (players/topscorers, topassists,
// topyellowcards, topredcards), agrégée par la fonction edge `stats-proxy`.
// Source faisant foi : évite les doublons de noms qu'on avait en agrégeant les
// événements stockés par match (ex. « K. Mbappe » vs « Kylian Mbappé »).
const TTL = 2 * 60_000 // ne re-sollicite l'API qu'une fois toutes les 2 min (quota)
// Cache au niveau module : persiste entre les montages (les onglets sont
// démontés à chaque changement dans App.vue).
let cache: { rows: StatRow[]; at: number } | null = null

const rows = ref<StatRow[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

async function load() {
  if (cache && Date.now() - cache.at < TTL) {
    rows.value = cache.rows
    loading.value = false
    return
  }
  loading.value = true
  error.value = null
  try {
    const { data, error: err } = await sb.functions.invoke('stats-proxy', { body: {} })
    if (err) throw err
    const list = (data as { data: StatRow[] }).data ?? []
    cache = { rows: list, at: Date.now() }
    rows.value = list
  } catch (e) {
    error.value = (e as Error).message || 'Erreur réseau — réessaie.'
  } finally {
    loading.value = false
  }
}
onMounted(load)

const anyData = computed(() => rows.value.length > 0)

// Aggregated per-match events from the DB. Source faisant foi pour les *totaux*
// et le décompte de joueurs : les classements de l'API (rows) sont plafonnés à
// ~20 joueurs par catégorie, donc on ne peut en déduire ni le vrai total ni le
// nombre réel de joueurs concernés (surtout les cartons jaunes, longue traîne
// de joueurs à 1 carton).
const matchStats = computed(() => computeMatchStats(matchesStore.matches))

// Tournament-wide totals: every goal/assist/card event counted once.
const totals = computed(() => matchStats.value.reduce((t, s) => {
  t.goals += s.goals
  t.assists += s.assists
  t.yellow += s.yellow
  t.red += s.red
  return t
}, { goals: 0, assists: 0, yellow: 0, red: 0 }))

// Real number of distinct players with ≥1 in each category, used for the
// "+N autres" tail — based on match events, not the capped API leaderboards.
const playerCounts = computed(() => ({
  goals:   matchStats.value.filter(s => s.goals   > 0).length,
  assists: matchStats.value.filter(s => s.assists > 0).length,
  yellow:  matchStats.value.filter(s => s.yellow  > 0).length,
  red:     matchStats.value.filter(s => s.red     > 0).length,
}))

const goals   = (s: StatRow) => s.goals
const assists = (s: StatRow) => s.assists
const yellows = (s: StatRow) => s.yellow
const reds    = (s: StatRow) => s.red

const allScorers = computed(() => rows.value.filter(s => s.goals > 0)  .sort((a,b) => b.goals   - a.goals))
const allAssists = computed(() => rows.value.filter(s => s.assists > 0).sort((a,b) => b.assists - a.assists))
const allYellows = computed(() => rows.value.filter(s => s.yellow > 0) .sort((a,b) => b.yellow  - a.yellow))
const allReds    = computed(() => rows.value.filter(s => s.red > 0)    .sort((a,b) => b.red     - a.red))

// On affiche tout le classement renvoyé par l'API (déjà plafonné à ~20 joueurs
// par catégorie). Pas de slice par nombre de joueurs : il coupait des paliers
// entiers d'ex æquo (ex. tous les passeurs à 1 passe) et tronquait un groupe au
// milieu. groupByRank regroupe les ex æquo sur une seule ligne, donc la liste
// reste compacte. Le tail "+N autres" couvre les joueurs au-delà de l'API.

// "+N autres" = total distinct players in the category (from match events)
// minus those actually displayed. Clamped at 0 in case the match-event count
// trails the API leaderboard (e.g. very early, before events are synced).
const hiddenCount = (real: number, shown: number) => Math.max(0, real - shown)

const sections = computed(() => [
  { key: 'goals',   label: 'Buteurs',            icon: '⚽', color: '#22c55e', groups: groupByRank(allScorers.value, goals),   hidden: hiddenCount(playerCounts.value.goals,   allScorers.value.length) },
  { key: 'assists', label: 'Passeurs décisifs',   icon: '🎯', color: '#60a5fa', groups: groupByRank(allAssists.value, assists), hidden: hiddenCount(playerCounts.value.assists, allAssists.value.length) },
  { key: 'yellow',  label: 'Cartons jaunes',      icon: '🟨', color: '#fbbf24', groups: groupByRank(allYellows.value, yellows), hidden: hiddenCount(playerCounts.value.yellow,  allYellows.value.length) },
  { key: 'red',     label: 'Cartons rouges',      icon: '🟥', color: '#ef4444', groups: groupByRank(allReds.value, reds),       hidden: hiddenCount(playerCounts.value.red,     allReds.value.length) },
])
</script>

<template>
  <div>
    <!-- Loading -->
    <div v-if="loading && !anyData" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 0; gap: 14px">
      <div class="stats-spinner"></div>
      <div style="font-size: 12px; color: #64748b; letter-spacing: 1px; font-family: Anton, sans-serif">CHARGEMENT…</div>
    </div>

    <!-- Error -->
    <div v-else-if="error && !anyData" :style="{ ...sCard, textAlign: 'center', padding: '40px 20px' }">
      <div style="font-size: 40px; margin-bottom: 12px">📡</div>
      <div style="font-size: 13px; color: #ef4444">{{ error }}</div>
    </div>

    <!-- Empty -->
    <div v-else-if="!anyData" :style="{ ...sCard, textAlign: 'center', padding: '40px 20px' }">
      <div style="font-size: 40px; margin-bottom: 12px">📊</div>
      <div style="font-family: Anton, sans-serif; font-size: 14px; color: #475569; letter-spacing: 1px; margin-bottom: 8px">PAS ENCORE DE DONNÉES</div>
      <div style="font-size: 12px; color: #334155">Les statistiques seront disponibles dès le coup d'envoi du premier match.</div>
    </div>

    <!-- Stats sections -->
    <template v-else>
      <!-- Totals -->
      <div :style="{ ...sCard, padding: '0', marginBottom: '16px', overflow: 'hidden', display: 'flex' }">
        <div v-for="(t, i) in [
          { icon: '⚽', label: 'Buts',           value: totals.goals,   color: '#22c55e' },
          { icon: '🎯', label: 'Passes',         value: totals.assists, color: '#60a5fa' },
          { icon: '🟨', label: 'Cartons jaunes', value: totals.yellow,  color: '#fbbf24' },
          { icon: '🟥', label: 'Cartons rouges', value: totals.red,     color: '#ef4444' },
        ]" :key="t.label"
          :style="{ flex: 1, padding: '12px 8px', textAlign: 'center', borderRight: i < 3 ? '1px solid #0f172a' : 'none' }">
          <div style="font-size: 16px; margin-bottom: 4px">{{ t.icon }}</div>
          <div :style="{ fontFamily: 'Anton, sans-serif', fontSize: '24px', lineHeight: '1', color: t.color }">{{ t.value }}</div>
          <div style="font-size: 10px; color: #64748b; letter-spacing: 1px; text-transform: uppercase; margin-top: 4px">{{ t.label }}</div>
        </div>
      </div>

      <div v-for="section in sections" :key="section.key" :style="{ ...sCard, padding: '0', marginBottom: '16px', overflow: 'hidden' }">
        <!-- Section header -->
        <div :style="{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', borderBottom: '1px solid ' + C.border, background: 'rgba(15,23,42,0.5)' }">
          <span style="font-size: 18px">{{ section.icon }}</span>
          <span style="font-family: Anton, sans-serif; font-size: 13px; letter-spacing: 1.5px; text-transform: uppercase" :style="{ color: section.color }">{{ section.label }}</span>
        </div>

        <!-- Empty section -->
        <div v-if="section.groups.length === 0" style="padding: 16px; text-align: center; font-size: 12px; color: #334155">
          Aucune donnée pour l'instant
        </div>

        <!-- Table: one row per rank, tied players share the line -->
        <table v-else style="width: 100%; border-collapse: collapse">
          <tbody>
            <tr v-for="(g, idx) in section.groups" :key="g.rank"
              :style="{ borderBottom: idx < section.groups.length - 1 ? '1px solid #0f172a' : 'none', background: idx % 2 === 0 ? 'rgba(15,23,42,0.3)' : 'transparent' }">
              <!-- Rank -->
              <td style="padding: 8px 10px 8px 14px; width: 28px; text-align: center; vertical-align: middle">
                <span v-if="g.rank === 1" style="font-size: 14px">🥇</span>
                <span v-else-if="g.rank === 2" style="font-size: 14px">🥈</span>
                <span v-else-if="g.rank === 3" style="font-size: 14px">🥉</span>
                <span v-else style="font-family: Anton, sans-serif; font-size: 11px; color: #475569">{{ g.rank }}</span>
              </td>
              <!-- Players sharing this rank: inline chips that wrap -->
              <td style="padding: 8px 6px">
                <div style="display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center">
                  <span v-for="s in g.players" :key="s.player + s.team"
                    style="display: inline-flex; align-items: center; gap: 4px">
                    <span class="flag" style="font-size: 14px">{{ getFlag(s.team) }}</span>
                    <span style="font-size: 12px; font-weight: 700; color: #f8fafc">{{ s.player }}</span>
                  </span>
                  <!-- Remaining players not shown, at the end of the last line -->
                  <span v-if="idx === section.groups.length - 1 && section.hidden > 0"
                    style="font-size: 12px; color: #94a3b8; font-style: italic; font-weight: 600">
                    + {{ section.hidden }} {{ section.hidden > 1 ? 'autres' : 'autre' }}
                  </span>
                </div>
              </td>
              <!-- Value -->
              <td style="padding: 8px 14px 8px 6px; text-align: right; width: 48px; vertical-align: middle">
                <span :style="{ fontFamily: 'Anton, sans-serif', fontSize: '20px', color: section.color }">{{ g.value }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.stats-spinner {
  width: 32px; height: 32px;
  border: 3px solid #1e293b;
  border-top-color: #22c55e;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg) } }
</style>
