<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { sb } from '../../supabase'
import { teamBarColors } from '../../utils/ui'

interface StatLine { key: string; label: string; home: number; away: number; kind: 'percent' | 'number' }

const props = defineProps<{ matchId: number; homeName: string; awayName: string }>()

const loading = ref(true)
const error = ref<string | null>(null)
const lines = ref<StatLine[]>([])

onMounted(async () => {
  try {
    const { data, error: err } = await sb.functions.invoke('match-stats-proxy', {
      body: { matchId: props.matchId, home: props.homeName, away: props.awayName },
    })
    if (err) throw err
    lines.value = (data as { data: StatLine[] }).data ?? []
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
})

function fmt(v: number, kind: 'percent' | 'number'): string {
  if (kind === 'percent') return v + '%'
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}
// Width % of the home segment; neutral 50 when there's no data on either side.
function homePct(l: StatLine): number {
  const t = l.home + l.away
  return t === 0 ? 50 : Math.round((l.home / t) * 100)
}
// Solid, guaranteed-distinct team colors for readable bars (flag gradients are
// unreadable at 6px tall, and two similar flag colors would be indistinguishable).
const barColors = computed(() => teamBarColors(props.homeName, props.awayName))
const homeColor = computed(() => barColors.value[0])
const awayColor = computed(() => barColors.value[1])
const hasXg = computed(() => lines.value.some(l => l.key === 'xg'))
</script>

<template>
  <!-- Loading -->
  <div v-if="loading" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 0; gap: 14px">
    <div class="stats-spinner"></div>
    <div style="font-size: 12px; color: #64748b; letter-spacing: 1px; font-family: Anton, sans-serif">CHARGEMENT…</div>
  </div>

  <!-- Error -->
  <div v-else-if="error" style="text-align: center; padding: 40px; color: #ef4444; font-size: 13px">{{ error }}</div>

  <!-- Empty -->
  <div v-else-if="lines.length === 0" style="text-align: center; padding: 40px 20px; color: #64748b">
    <div style="font-size: 13px; font-family: Anton, sans-serif; letter-spacing: 1px">Statistiques pas encore disponibles</div>
    <div style="font-size: 11px; color: #334155; margin-top: 6px">Elles apparaîtront une fois le match commencé.</div>
  </div>

  <!-- Bars -->
  <div v-else style="padding: 14px 16px 18px">
    <div v-for="l in lines" :key="l.key" style="margin-bottom: 12px">
      <!-- values + label -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px">
        <span style="font-family: Anton, sans-serif; font-size: 14px; color: #f8fafc; min-width: 40px; text-align: left">{{ fmt(l.home, l.kind) }}</span>
        <span style="font-size: 10px; color: #94a3b8; letter-spacing: 1px; text-transform: uppercase">{{ l.label }}</span>
        <span style="font-family: Anton, sans-serif; font-size: 14px; color: #f8fafc; min-width: 40px; text-align: right">{{ fmt(l.away, l.kind) }}</span>
      </div>
      <!-- comparison bar -->
      <div style="display: flex; height: 6px; border-radius: 3px; overflow: hidden; background: #1e293b">
        <div :style="{ width: homePct(l) + '%', background: l.home + l.away === 0 ? '#334155' : homeColor }"></div>
        <div :style="{ width: (100 - homePct(l)) + '%', background: l.home + l.away === 0 ? '#1e293b' : awayColor }"></div>
      </div>
    </div>

    <!-- xG note -->
    <div v-if="hasXg" style="margin-top: 14px; padding-top: 10px; border-top: 1px solid #1e293b; font-size: 10px; color: #64748b; line-height: 1.5">
      <strong style="color: #94a3b8">xG (buts attendus)</strong> : nombre de buts qu'une équipe aurait dû marquer compte tenu de la qualité de ses occasions.
    </div>
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
