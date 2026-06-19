<script setup lang="ts">
import { ref } from 'vue'
import { sb } from '../../supabase'
import { sCard } from '../../constants/ui'
import { getFlag } from '../../utils/ui'
import PlayerSearch from '../ui/PlayerSearch.vue'

interface PlayerStats {
  profile: {
    name: string; photo: string | null; age: number | null
    nationality: string | null; height: string | null; weight: string | null; injured: boolean
  }
  stats: {
    appearances: number; lineups: number; minutes: number; position: string; rating: string | null
    shotsTotal: number | null; shotsOn: number | null; goals: number; assists: number
    passesTotal: number | null; passesKey: number | null; passesAccuracy: number | null
    dribblesAttempts: number | null; dribblesSuccess: number | null
    tacklesTotal: number | null; interceptions: number | null; blocks: number | null
    duelsTotal: number | null; duelsWon: number | null
    foulsDrawn: number | null; foulsCommitted: number | null; yellow: number; red: number
    penWon: number | null; penScored: number | null; penMissed: number | null
  }
}

interface SelectedPlayer { name: string; team: string; api_id: number }

const selected = ref<SelectedPlayer | null>(null)
const data = ref<PlayerStats | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const cache = new Map<number, PlayerStats | null>()
const searchQuery = ref('')

const POSITION_FR: Record<string, string> = {
  Goalkeeper: 'Gardien', Defender: 'Défenseur', Midfielder: 'Milieu', Attacker: 'Attaquant',
}

async function onSelect(p: SelectedPlayer) {
  selected.value = p
  error.value = null
  if (cache.has(p.api_id)) { data.value = cache.get(p.api_id) ?? null; return }
  loading.value = true
  data.value = null
  try {
    const { data: res, error: err } = await sb.functions.invoke('player-stats-proxy', { body: { apiId: p.api_id } })
    if (err) throw err
    const stats = (res as { data: PlayerStats | null }).data
    cache.set(p.api_id, stats)
    data.value = stats
  } catch (e) {
    error.value = (e as Error).message
    data.value = null
  } finally {
    loading.value = false
  }
}

const fmt = (v: number | string | null) => v === null || v === '' ? '—' : String(v)
const pct = (v: number | null) => v === null ? '—' : v + '%'
const posFr = (p: string) => POSITION_FR[p] ?? (p || '—')

function sections(s: PlayerStats['stats']): { label: string; icon: string; rows: [string, string][] }[] {
  return [
    { label: 'Temps de jeu', icon: '⏱️', rows: [
      ['Matchs joués', fmt(s.appearances)], ['Titularisations', fmt(s.lineups)],
      ['Minutes', fmt(s.minutes)], ['Poste', posFr(s.position)], ['Note moyenne', fmt(s.rating)],
    ] },
    { label: 'Attaque', icon: '⚽', rows: [
      ['Tirs', fmt(s.shotsTotal)], ['Tirs cadrés', fmt(s.shotsOn)],
      ['Buts', fmt(s.goals)], ['Passes décisives', fmt(s.assists)],
    ] },
    { label: 'Construction', icon: '🎯', rows: [
      ['Passes', fmt(s.passesTotal)], ['Passes clés', fmt(s.passesKey)],
      ['Précision passes', pct(s.passesAccuracy)],
      ['Dribbles tentés', fmt(s.dribblesAttempts)], ['Dribbles réussis', fmt(s.dribblesSuccess)],
    ] },
    { label: 'Défense', icon: '🛡️', rows: [
      ['Tacles', fmt(s.tacklesTotal)], ['Interceptions', fmt(s.interceptions)],
      ['Contres', fmt(s.blocks)], ['Duels', fmt(s.duelsTotal)], ['Duels gagnés', fmt(s.duelsWon)],
    ] },
    { label: 'Discipline', icon: '🟨', rows: [
      ['Fautes subies', fmt(s.foulsDrawn)], ['Fautes commises', fmt(s.foulsCommitted)],
      ['Cartons jaunes', fmt(s.yellow)], ['Cartons rouges', fmt(s.red)],
    ] },
    { label: 'Penalties', icon: '🥅', rows: [
      ['Obtenus', fmt(s.penWon)], ['Marqués', fmt(s.penScored)], ['Ratés', fmt(s.penMissed)],
    ] },
  ]
}
</script>

<template>
  <div>
    <div style="margin-bottom: 14px">
      <PlayerSearch :value="searchQuery" @update="searchQuery = $event" @select="onSelect" />
    </div>

    <!-- idle -->
    <div v-if="!selected" :style="{ ...sCard, textAlign: 'center', padding: '40px 20px' }">
      <div style="font-size: 40px; margin-bottom: 12px">🔎</div>
      <div style="font-family: Anton, sans-serif; font-size: 14px; color: #475569; letter-spacing: 1px">RECHERCHE UN JOUEUR</div>
      <div style="font-size: 12px; color: #334155; margin-top: 8px">Tape un nom pour voir ses statistiques de la Coupe du Monde 2026.</div>
    </div>

    <template v-else>
      <!-- header -->
      <div :style="{ ...sCard, display: 'flex', alignItems: 'center', gap: '14px' }">
        <img v-if="data?.profile.photo" :src="data.profile.photo" :alt="selected.name"
          style="width: 64px; height: 64px; border-radius: 50%; object-fit: cover; border: 2px solid #1e293b; background: #0a0e1a" />
        <div v-else style="width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 28px; background: #0a0e1a; border: 2px solid #1e293b">👤</div>
        <div style="min-width: 0">
          <div style="font-family: Anton, sans-serif; font-size: 20px; color: #f8fafc; letter-spacing: 0.5px">{{ data?.profile.name ?? selected.name }}</div>
          <div style="font-size: 12px; color: #94a3b8; margin-top: 2px">
            <span class="flag">{{ getFlag(selected.team) }}</span> {{ selected.team }}
            <template v-if="data?.profile.age"> · {{ data.profile.age }} ans</template>
          </div>
          <div v-if="data?.profile.injured" style="font-size: 11px; color: #ef4444; margin-top: 4px; font-weight: 600">⚠ Blessé</div>
        </div>
      </div>

      <!-- loading -->
      <div v-if="loading" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 0; gap: 14px">
        <div class="res-spinner"></div>
        <div style="font-size: 12px; color: #64748b; letter-spacing: 1px; font-family: Anton, sans-serif">CHARGEMENT…</div>
      </div>

      <!-- error -->
      <div v-else-if="error" style="text-align: center; padding: 30px; color: #ef4444; font-size: 13px">{{ error }}</div>

      <!-- no data -->
      <div v-else-if="!data" :style="{ ...sCard, textAlign: 'center', padding: '30px 20px' }">
        <div style="font-size: 32px; margin-bottom: 10px">📭</div>
        <div style="font-size: 13px; color: #94a3b8">Pas encore de statistiques sur cette Coupe du Monde.</div>
      </div>

      <!-- stats -->
      <template v-else>
        <div v-for="sec in sections(data.stats)" :key="sec.label" :style="sCard">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px">
            <span style="font-size: 16px">{{ sec.icon }}</span>
            <span style="font-family: Anton, sans-serif; font-size: 14px; color: #f8fafc; letter-spacing: 1px">{{ sec.label.toUpperCase() }}</span>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px">
            <div v-for="row in sec.rows" :key="row[0]" style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #1e293b; padding-bottom: 4px">
              <span style="font-size: 12px; color: #94a3b8">{{ row[0] }}</span>
              <span style="font-size: 13px; color: #f1f5f9; font-family: Anton, sans-serif">{{ row[1] }}</span>
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
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
