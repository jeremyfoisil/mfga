<script setup lang="ts">
import { computed } from 'vue'
import type { RadarAxis } from '../../utils/playerRadar'

const props = defineProps<{ axes: RadarAxis[] }>()

const SIZE = 240
const MID = SIZE / 2   // centre
const R = 84           // rayon max
const N = 6            // nb d'axes

// vecteur unitaire de l'axe i (départ en haut, sens horaire)
function unit(i: number): { x: number; y: number } {
  const a = (-90 + i * (360 / N)) * Math.PI / 180
  return { x: Math.cos(a), y: Math.sin(a) }
}
function point(i: number, frac: number): { x: number; y: number } {
  const u = unit(i)
  return { x: MID + R * frac * u.x, y: MID + R * frac * u.y }
}
const toPoints = (pts: { x: number; y: number }[]) =>
  pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

const norm = (v: number) => Math.max(0, Math.min(100, v)) / 100

const rings = [0.25, 0.5, 0.75, 1].map(f =>
  toPoints(Array.from({ length: N }, (_, i) => point(i, f))))

const spokes = Array.from({ length: N }, (_, i) => point(i, 1))

const polygon = computed(() =>
  toPoints(props.axes.map((a, i) => point(i, norm(a.value)))))

const vertices = computed(() =>
  props.axes.map((a, i) => ({ ...point(i, norm(a.value)) })))

const labels = computed(() => props.axes.map((a, i) => {
  const p = point(i, 1.2)
  const u = unit(i)
  const anchor = Math.abs(u.x) < 0.3 ? 'middle' : (u.x > 0 ? 'start' : 'end')
  return { x: p.x, y: p.y, anchor, label: a.label, value: a.value }
}))
</script>

<template>
  <svg :viewBox="`0 0 ${SIZE} ${SIZE}`" width="100%"
    style="max-width: 320px; display: block; margin: 0 auto; overflow: visible">
    <!-- anneaux de grille -->
    <polygon v-for="(r, i) in rings" :key="'r' + i" :points="r" fill="none" stroke="#1e293b" stroke-width="1" />
    <!-- rayons -->
    <line v-for="(s, i) in spokes" :key="'s' + i" :x1="MID" :y1="MID" :x2="s.x" :y2="s.y" stroke="#1e293b" stroke-width="1" />
    <!-- polygone du joueur -->
    <polygon :points="polygon" fill="#3b82f6" fill-opacity="0.25" stroke="#3b82f6" stroke-width="2" stroke-linejoin="round" />
    <!-- sommets -->
    <circle v-for="(v, i) in vertices" :key="'v' + i" :cx="v.x" :cy="v.y" r="2.5" fill="#3b82f6" />
    <!-- labels d'axes -->
    <text v-for="(l, i) in labels" :key="'l' + i" :x="l.x" :y="l.y" :text-anchor="l.anchor"
      dominant-baseline="middle" font-size="11" fill="#cbd5e1"
      style="font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif">
      {{ l.label }}<tspan font-size="10" fill="#64748b"> {{ l.value }}</tspan>
    </text>
  </svg>
</template>
