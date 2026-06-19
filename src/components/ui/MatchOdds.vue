<script setup lang="ts">
import { computed } from 'vue'
import type { Match } from '../../types'
import { C } from '../../constants/ui'

const props = defineProps<{ match: Match }>()

const show = computed(() =>
  props.match.oddsHome != null && props.match.oddsDraw != null && props.match.oddsAway != null
)

// Indice de la cote la plus basse (favori) parmi [home, draw, away]
const favouriteIdx = computed(() => {
  const o = [props.match.oddsHome, props.match.oddsDraw, props.match.oddsAway] as number[]
  let best = 0
  for (let i = 1; i < o.length; i++) if (o[i] < o[best]) best = i
  return best
})

function fmt(v: number | null) { return v == null ? '' : v.toFixed(2) }
</script>

<template>
  <div v-if="show" style="margin-bottom: 14px">
    <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: center; text-align: center">
      <span class="anton" :style="{ fontSize: '15px', letterSpacing: '0.5px', color: favouriteIdx === 0 ? C.accent : '#94a3b8' }">{{ fmt(match.oddsHome) }}</span>
      <span class="anton" :style="{ fontSize: '15px', letterSpacing: '0.5px', padding: '0 6px', color: favouriteIdx === 1 ? C.accent : '#94a3b8' }">{{ fmt(match.oddsDraw) }}</span>
      <span class="anton" :style="{ fontSize: '15px', letterSpacing: '0.5px', color: favouriteIdx === 2 ? C.accent : '#94a3b8' }">{{ fmt(match.oddsAway) }}</span>
    </div>
    <div style="text-align: center; font-size: 9px; color: #475569; letter-spacing: 1px; margin-top: 2px; text-transform: uppercase">Cotes Unibet · 1 N 2</div>
  </div>
</template>
