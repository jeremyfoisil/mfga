<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { sb } from '../../supabase'
import { C } from '../../constants/ui'
import { getFlag } from '../../utils/ui'

interface StandingRow { rank: number; team: string; played: number; win: number; draw: number; lose: number; diff: number; points: number }
interface GroupStanding { group: string; rows: StandingRow[] }

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

function fmtDiff(d: number): string { return d > 0 ? '+' + d : String(d) }
</script>

<template>
  <!-- Loading -->
  <div v-if="loading" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 0; gap: 14px">
    <div class="res-spinner"></div>
    <div style="font-size: 12px; color: #64748b; letter-spacing: 1px; font-family: Anton, sans-serif">CHARGEMENT…</div>
  </div>

  <!-- Error -->
  <div v-else-if="error" style="text-align: center; padding: 40px; color: #ef4444; font-size: 13px">{{ error }}</div>

  <!-- Empty -->
  <div v-else-if="groups.length === 0" :style="{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '40px 20px', textAlign: 'center', marginTop: '10px' }">
    <div style="font-size: 13px; font-family: Anton, sans-serif; letter-spacing: 1px; color: #fbbf24">CLASSEMENTS PAS ENCORE DISPONIBLES</div>
    <div style="font-size: 11px; color: #475569; margin-top: 6px">Ils apparaîtront une fois les matchs de poule joués.</div>
  </div>

  <!-- Groups -->
  <template v-else>
    <div v-for="g in groups" :key="g.group" :style="{ background: C.card, border: '1px solid ' + C.border, borderRadius: '12px', padding: '0', marginTop: '12px', overflow: 'hidden' }">
      <div style="padding: 10px 14px; border-bottom: 1px solid #1e293b; font-family: Anton, sans-serif; font-size: 13px; letter-spacing: 1.5px; color: #fbbf24">GROUPE {{ g.group }}</div>
      <table style="width: 100%; border-collapse: collapse">
        <thead>
          <tr style="font-size: 9px; color: #475569; text-transform: uppercase; letter-spacing: 0.5px">
            <th style="padding: 6px 4px 6px 10px; text-align: center; width: 22px">#</th>
            <th style="padding: 6px 4px; text-align: left">Équipe</th>
            <th style="padding: 6px 4px; text-align: center; width: 24px">J</th>
            <th style="padding: 6px 4px; text-align: center; width: 24px">G</th>
            <th style="padding: 6px 4px; text-align: center; width: 24px">N</th>
            <th style="padding: 6px 4px; text-align: center; width: 24px">P</th>
            <th style="padding: 6px 4px; text-align: center; width: 34px">Diff</th>
            <th style="padding: 6px 10px 6px 4px; text-align: center; width: 30px">Pts</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in g.rows" :key="r.team"
            :style="{ borderTop: '1px solid #0f172a', background: r.rank <= 2 ? 'rgba(34,197,94,0.08)' : 'transparent' }">
            <td style="padding: 8px 4px 8px 10px; text-align: center; position: relative">
              <span v-if="r.rank <= 2" style="position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: #22c55e"></span>
              <span style="font-family: Anton, sans-serif; font-size: 12px; color: #94a3b8">{{ r.rank }}</span>
            </td>
            <td style="padding: 8px 4px">
              <span style="display: inline-flex; align-items: center; gap: 6px">
                <span class="flag" style="font-size: 15px">{{ getFlag(r.team) }}</span>
                <span style="font-size: 12px; font-weight: 700; color: #f8fafc">{{ r.team }}</span>
              </span>
            </td>
            <td style="padding: 8px 4px; text-align: center; font-size: 12px; color: #94a3b8">{{ r.played }}</td>
            <td style="padding: 8px 4px; text-align: center; font-size: 12px; color: #94a3b8">{{ r.win }}</td>
            <td style="padding: 8px 4px; text-align: center; font-size: 12px; color: #94a3b8">{{ r.draw }}</td>
            <td style="padding: 8px 4px; text-align: center; font-size: 12px; color: #94a3b8">{{ r.lose }}</td>
            <td style="padding: 8px 4px; text-align: center; font-size: 12px; color: #cbd5e1">{{ fmtDiff(r.diff) }}</td>
            <td style="padding: 8px 10px 8px 4px; text-align: center; font-family: Anton, sans-serif; font-size: 14px; color: #f8fafc">{{ r.points }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
</template>

<style scoped>
.res-spinner {
  width: 32px; height: 32px;
  border: 3px solid #1e293b;
  border-top-color: #22c55e;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg) } }
</style>
