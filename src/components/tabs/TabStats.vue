<script setup lang="ts">
import { computed } from 'vue'
import { C, sCard } from '../../constants/ui'
import { getFlag } from '../../utils/ui'
import { useMatchesStore } from '../../stores/matches'
import { computeMatchStats, groupByRank, type StatRow } from '../../utils/stats'

const matchesStore = useMatchesStore()

const raw = computed(() => computeMatchStats(matchesStore.matches))
const anyData = computed(() => raw.value.length > 0)

// Tournament-wide totals across all players.
const totals = computed(() => raw.value.reduce((t, s) => {
  t.goals += s.goals
  t.assists += s.assists
  t.yellow += s.yellow
  t.red += s.red
  return t
}, { goals: 0, assists: 0, yellow: 0, red: 0 }))

const goals   = (s: StatRow) => s.goals
const assists = (s: StatRow) => s.assists
const yellows = (s: StatRow) => s.yellow
const reds    = (s: StatRow) => s.red

const allScorers = computed(() => raw.value.filter(s => s.goals > 0)  .sort((a,b) => b.goals   - a.goals))
const allAssists = computed(() => raw.value.filter(s => s.assists > 0).sort((a,b) => b.assists - a.assists))
const allYellows = computed(() => raw.value.filter(s => s.yellow > 0) .sort((a,b) => b.yellow  - a.yellow))
const allReds    = computed(() => raw.value.filter(s => s.red > 0)    .sort((a,b) => b.red     - a.red))

const topScorers = computed(() => allScorers.value.slice(0, 15))
const topAssists = computed(() => allAssists.value.slice(0, 10))
const topYellows = computed(() => allYellows.value.slice(0, 10))
const topReds    = computed(() => allReds.value.slice(0, 10))

const sections = computed(() => [
  { key: 'goals',   label: 'Buteurs',            icon: '⚽', color: '#22c55e', groups: groupByRank(topScorers.value, goals),   hidden: allScorers.value.length - topScorers.value.length },
  { key: 'assists', label: 'Passeurs décisifs',   icon: '🎯', color: '#60a5fa', groups: groupByRank(topAssists.value, assists), hidden: allAssists.value.length - topAssists.value.length },
  { key: 'yellow',  label: 'Cartons jaunes',      icon: '🟨', color: '#fbbf24', groups: groupByRank(topYellows.value, yellows), hidden: allYellows.value.length - topYellows.value.length },
  { key: 'red',     label: 'Cartons rouges',      icon: '🟥', color: '#ef4444', groups: groupByRank(topReds.value, reds),       hidden: allReds.value.length - topReds.value.length },
])
</script>

<template>
  <div>
    <!-- Empty -->
    <div v-if="!anyData" :style="{ ...sCard, textAlign: 'center', padding: '40px 20px' }">
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
