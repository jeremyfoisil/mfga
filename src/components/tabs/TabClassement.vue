<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { sb } from '../../supabase'
import GroupStandings from '../ui/GroupStandings.vue'
import KnockoutBracket from '../ui/KnockoutBracket.vue'
import type { GroupRank } from '../../utils/bracket'

interface StandingRow { rank: number; team: string; played: number; win: number; draw: number; lose: number; diff: number; points: number }
interface GroupStanding { group: string; rows: StandingRow[] }

const view = ref<'elim' | 'poules'>('elim')
const loading = ref(true)
const error = ref<string | null>(null)
const groups = ref<GroupStanding[]>([])

onMounted(async () => {
  try {
    const { data, error: err } = await sb.functions.invoke('standings-proxy')
    if (err) throw err
    groups.value = (data as { data: GroupStanding[] }).data ?? []
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
})

// Graines (vainqueur/2e par groupe) pour le seeding du bracket.
const ranks = computed<GroupRank[]>(() =>
  groups.value.flatMap(g => g.rows
    .filter(r => r.rank === 1 || r.rank === 2)
    .map(r => ({ group: g.group, team: r.team, rank: r.rank })))
)
</script>

<template>
  <div>
    <!-- Toggle sous-onglets -->
    <div style="display: flex; gap: 6px; margin-bottom: 12px; background: #0f172a; border-radius: 10px; padding: 4px">
      <button
        :style="{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontFamily: 'Anton, sans-serif', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase', background: view === 'elim' ? 'linear-gradient(135deg, #f59e0b, #b45309)' : 'transparent', color: view === 'elim' ? '#0a0e1a' : '#64748b', boxShadow: view === 'elim' ? '0 2px 0 #451a03' : 'none' }"
        @click="view = 'elim'">🏆 Élimination</button>
      <button
        :style="{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontFamily: 'Anton, sans-serif', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase', background: view === 'poules' ? 'linear-gradient(135deg, #dc2626, #991b1b)' : 'transparent', color: view === 'poules' ? '#fff' : '#64748b', boxShadow: view === 'poules' ? '0 2px 0 #1e3a8a' : 'none' }"
        @click="view = 'poules'">⚽ Poules</button>
    </div>

    <KnockoutBracket v-if="view === 'elim'" :ranks="ranks" />
    <GroupStandings v-else :groups="groups" :loading="loading" :error="error" />
  </div>
</template>
