<script setup lang="ts">
import { computed } from 'vue'
import { C, sCard } from '../../constants/ui'
import { getFlag } from '../../utils/ui'
import { useMatchesStore } from '../../stores/matches'
import { computeMatchStats, type StatRow } from '../../utils/stats'

const matchesStore = useMatchesStore()

const raw = computed(() => computeMatchStats(matchesStore.matches))
const anyData = computed(() => raw.value.length > 0)

const goals   = (s: StatRow) => s.goals
const assists = (s: StatRow) => s.assists
const yellows = (s: StatRow) => s.yellow
const reds    = (s: StatRow) => s.red

const topScorers = computed(() => raw.value.filter(s => s.goals > 0)  .sort((a,b) => b.goals   - a.goals)  .slice(0, 15))
const topAssists = computed(() => raw.value.filter(s => s.assists > 0).sort((a,b) => b.assists - a.assists).slice(0, 10))
const topYellows = computed(() => raw.value.filter(s => s.yellow > 0) .sort((a,b) => b.yellow  - a.yellow) .slice(0, 10))
const topReds    = computed(() => raw.value.filter(s => s.red > 0)    .sort((a,b) => b.red     - a.red)    .slice(0, 10))

const sections = computed(() => [
  { key: 'goals',   label: 'Buteurs',            icon: '⚽', color: '#22c55e', list: topScorers.value,  val: goals   },
  { key: 'assists', label: 'Passeurs décisifs',   icon: '🎯', color: '#60a5fa', list: topAssists.value,  val: assists },
  { key: 'yellow',  label: 'Cartons jaunes',      icon: '🟨', color: '#fbbf24', list: topYellows.value,  val: yellows },
  { key: 'red',     label: 'Cartons rouges',      icon: '🟥', color: '#ef4444', list: topReds.value,     val: reds    },
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
      <div v-for="section in sections" :key="section.key" :style="{ ...sCard, padding: '0', marginBottom: '16px', overflow: 'hidden' }">
        <!-- Section header -->
        <div :style="{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', borderBottom: '1px solid ' + C.border, background: 'rgba(15,23,42,0.5)' }">
          <span style="font-size: 18px">{{ section.icon }}</span>
          <span style="font-family: Anton, sans-serif; font-size: 13px; letter-spacing: 1.5px; text-transform: uppercase" :style="{ color: section.color }">{{ section.label }}</span>
        </div>

        <!-- Empty section -->
        <div v-if="section.list.length === 0" style="padding: 16px; text-align: center; font-size: 12px; color: #334155">
          Aucune donnée pour l'instant
        </div>

        <!-- Table -->
        <table v-else style="width: 100%; border-collapse: collapse">
          <tbody>
            <tr v-for="(s, idx) in section.list" :key="s.player + s.team"
              :style="{ borderBottom: idx < section.list.length - 1 ? '1px solid #0f172a' : 'none', background: idx % 2 === 0 ? 'rgba(15,23,42,0.3)' : 'transparent' }">
              <!-- Rank -->
              <td style="padding: 8px 10px 8px 14px; width: 28px; text-align: center">
                <span v-if="idx === 0" style="font-size: 14px">🥇</span>
                <span v-else-if="idx === 1" style="font-size: 14px">🥈</span>
                <span v-else-if="idx === 2" style="font-size: 14px">🥉</span>
                <span v-else style="font-family: Anton, sans-serif; font-size: 11px; color: #475569">{{ idx + 1 }}</span>
              </td>
              <!-- Flag -->
              <td class="flag" style="padding: 8px 6px; width: 24px; font-size: 16px; text-align: center">{{ getFlag(s.team) }}</td>
              <!-- Player name -->
              <td style="padding: 8px 6px">
                <div style="font-size: 13px; font-weight: 700; color: #f8fafc">{{ s.player }}</div>
                <div style="font-size: 10px; color: #64748b; margin-top: 1px">{{ s.team }}</div>
              </td>
              <!-- Value -->
              <td style="padding: 8px 14px 8px 6px; text-align: right; width: 48px">
                <span :style="{ fontFamily: 'Anton, sans-serif', fontSize: '20px', color: section.color }">{{ section.val(s) }}</span>
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
