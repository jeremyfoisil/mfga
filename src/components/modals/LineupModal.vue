<script setup lang="ts">
import { computed } from 'vue'
import { getFlag, getFlagBg } from '../../utils/ui'
import { C } from '../../constants/ui'

interface Player { name: string; position: 'GK' | 'DEF' | 'MID' | 'FWD' }
interface TeamData { name: string; players: Player[] }
export interface LineupData {
  source: 'lineup' | 'squad'
  home: TeamData
  away: TeamData
}

const props = defineProps<{
  loading: boolean
  data: LineupData | null
  homeName: string
  awayName: string
  error: string | null
}>()
const emit = defineEmits<{ (e: 'close'): void }>()

// ── Formation builder ──────────────────────────────────────────────
const X_POS: Record<number, number[]> = {
  1: [50],
  2: [28, 72],
  3: [18, 50, 82],
  4: [11, 36, 64, 89],
  5: [8, 26, 50, 74, 92],
  6: [7, 21, 38, 62, 79, 93],
}

function buildXI(players: Player[]) {
  const gks  = players.filter(p => p.position === 'GK').slice(0, 1)
  const defs = players.filter(p => p.position === 'DEF').slice(0, 4)
  const mids = players.filter(p => p.position === 'MID')
  const fwds = players.filter(p => p.position === 'FWD')

  let midN: number, fwdN: number
  if (fwds.length >= 3)      { midN = 3; fwdN = 3 }
  else if (fwds.length === 2) { midN = 4; fwdN = 2 }
  else if (fwds.length === 1) { midN = 5; fwdN = 1 }
  else                        { midN = Math.min(6, mids.length); fwdN = 0 }

  midN = Math.min(midN, mids.length)
  return {
    gks, defs,
    mids: mids.slice(0, midN),
    fwds: fwds.slice(0, fwdN),
    formation: `${defs.length}-${midN}${fwdN ? '-' + fwdN : ''}`,
  }
}

type Dot = Player & { x: number; y: number }

function toDots(xi: ReturnType<typeof buildXI>, side: 'home' | 'away'): Dot[] {
  const rows = [
    { players: xi.gks,  y: side === 'home' ? 88 : 12 },
    { players: xi.defs, y: side === 'home' ? 73 : 27 },
    { players: xi.mids, y: side === 'home' ? 57 : 43 },
    { players: xi.fwds, y: side === 'home' ? 42 : 58 },
  ]
  return rows.flatMap(row => {
    const xs = X_POS[row.players.length] ?? X_POS[3]
    return row.players.map((p, i) => ({ ...p, x: xs[i], y: row.y }))
  })
}

function lastName(full: string) {
  const parts = full.trim().split(' ')
  return parts.length === 1 ? full : parts.slice(1).join(' ')
}

// ── Computed ───────────────────────────────────────────────────────
const homeXI   = computed(() => props.data ? buildXI(props.data.home.players) : null)
const awayXI   = computed(() => props.data ? buildXI(props.data.away.players) : null)
const homeDots = computed(() => homeXI.value ? toDots(homeXI.value, 'home') : [])
const awayDots = computed(() => awayXI.value ? toDots(awayXI.value, 'away') : [])

const POS_LABEL: Record<string, string> = { GK: 'Gardien', DEF: 'Défenseurs', MID: 'Milieux', FWD: 'Attaquants' }

function groupedSquad(players: Player[]) {
  const order = ['GK', 'DEF', 'MID', 'FWD']
  return order
    .map(pos => ({ pos, label: POS_LABEL[pos], players: players.filter(p => p.position === pos) }))
    .filter(g => g.players.length > 0)
}
</script>

<template>
  <div
    style="position: fixed; inset: 0; background: rgba(0,0,0,0.88); z-index: 300; display: flex; flex-direction: column; align-items: center; overflow-y: auto; padding: 16px 0 32px"
    @click.self="emit('close')"
  >
    <div style="width: 100%; max-width: 420px; padding: 0 12px">

      <!-- Header -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px">
        <div style="display: flex; align-items: center; gap: 10px">
          <span style="font-size: 28px; line-height: 1">{{ getFlag(homeName) }}</span>
          <div>
            <div style="font-family: Anton, sans-serif; font-size: 15px; color: #f8fafc; letter-spacing: 1px">{{ homeName }}</div>
            <div v-if="homeXI" style="font-size: 10px; color: #94a3b8; letter-spacing: 1px">{{ homeXI.formation }}</div>
          </div>
        </div>
        <div style="font-family: Anton, sans-serif; font-size: 12px; color: #64748b; letter-spacing: 1.5px">VS</div>
        <div style="display: flex; align-items: center; gap: 10px; flex-direction: row-reverse">
          <span style="font-size: 28px; line-height: 1">{{ getFlag(awayName) }}</span>
          <div style="text-align: right">
            <div style="font-family: Anton, sans-serif; font-size: 15px; color: #f8fafc; letter-spacing: 1px">{{ awayName }}</div>
            <div v-if="awayXI" style="font-size: 10px; color: #94a3b8; letter-spacing: 1px">{{ awayXI.formation }}</div>
          </div>
        </div>
        <button @click="emit('close')"
          style="position: absolute; right: 20px; top: 20px; background: rgba(30,41,59,0.9); border: 1px solid #334155; border-radius: 50%; width: 32px; height: 32px; color: #94a3b8; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0">✕</button>
      </div>

      <!-- Loading -->
      <div v-if="loading" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 0; gap: 14px">
        <div class="lineup-spinner"></div>
        <div style="font-size: 12px; color: #64748b; letter-spacing: 1px; font-family: Anton, sans-serif">CHARGEMENT…</div>
      </div>

      <!-- Error -->
      <div v-else-if="error" style="text-align: center; padding: 40px; color: #ef4444; font-size: 13px">{{ error }}</div>

      <!-- Pitch -->
      <div v-else-if="data" style="position: relative; border-radius: 10px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.6)">
        <!-- Source badge -->
        <div style="position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: 10; background: rgba(0,0,0,0.55); border: 1px solid rgba(255,255,255,0.15); border-radius: 999px; padding: 2px 10px; font-size: 9px; color: rgba(255,255,255,0.6); letter-spacing: 1.5px; font-family: Anton, sans-serif; white-space: nowrap">
          {{ data.source === 'lineup' ? '⚡ COMPO OFFICIELLE' : '📋 LISTE DU GROUPE' }}
        </div>

        <!-- Away team label (top) -->
        <div style="position: absolute; top: 18px; right: 10px; z-index: 10; font-size: 9px; color: rgba(255,255,255,0.5); letter-spacing: 1px; font-family: Anton, sans-serif">{{ awayName.toUpperCase() }} ▲</div>
        <!-- Home team label (bottom) -->
        <div style="position: absolute; bottom: 18px; left: 10px; z-index: 10; font-size: 9px; color: rgba(255,255,255,0.5); letter-spacing: 1px; font-family: Anton, sans-serif">▼ {{ homeName.toUpperCase() }}</div>

        <!-- Pitch surface -->
        <div style="position: relative; padding-top: 145%; background: linear-gradient(180deg, #166534 0%, #15803d 30%, #166534 50%, #15803d 70%, #166534 100%)">
          <!-- SVG field markings -->
          <svg style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none" viewBox="0 0 100 145" preserveAspectRatio="none">
            <!-- outer border -->
            <rect x="4" y="3" width="92" height="139" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="0.5"/>
            <!-- center line -->
            <line x1="4" y1="72.5" x2="96" y2="72.5" stroke="rgba(255,255,255,0.25)" stroke-width="0.5"/>
            <!-- center circle -->
            <circle cx="50" cy="72.5" r="11" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="0.5"/>
            <circle cx="50" cy="72.5" r="0.8" fill="rgba(255,255,255,0.3)"/>
            <!-- home penalty area (bottom) -->
            <rect x="22" y="119" width="56" height="23" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="0.4"/>
            <rect x="35" y="131" width="30" height="11" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="0.4"/>
            <circle cx="50" cy="127" r="5.5" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="0.4"/>
            <!-- away penalty area (top) -->
            <rect x="22" y="3" width="56" height="23" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="0.4"/>
            <rect x="35" y="3" width="30" height="11" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="0.4"/>
            <circle cx="50" cy="18" r="5.5" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="0.4"/>
            <!-- home goal -->
            <rect x="38" y="142" width="24" height="2.5" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="0.5"/>
            <!-- away goal -->
            <rect x="38" y="0.5" width="24" height="2.5" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="0.5"/>
          </svg>

          <!-- Away players (top) -->
          <div v-for="dot in awayDots" :key="'away-' + dot.name"
            style="position: absolute; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 2px; pointer-events: none"
            :style="{ left: dot.x + '%', top: dot.y + '%' }">
            <div :style="{
              width: '26px', height: '26px', borderRadius: '50%',
              background: getFlagBg(awayName),
              border: dot.position === 'GK' ? '2px solid #fbbf24' : '2px solid rgba(255,255,255,0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '8px', fontWeight: 700, color: '#fff',
              fontFamily: 'Anton, sans-serif', letterSpacing: '0.3px',
              textShadow: '0 1px 2px rgba(0,0,0,0.8)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
              flexShrink: 0,
            }">{{ dot.position === 'GK' ? 'GK' : '' }}</div>
            <div style="font-size: 7.5px; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.9); font-weight: 700; text-align: center; max-width: 44px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.2">
              {{ lastName(dot.name) }}
            </div>
          </div>

          <!-- Home players (bottom) -->
          <div v-for="dot in homeDots" :key="'home-' + dot.name"
            style="position: absolute; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 2px; pointer-events: none"
            :style="{ left: dot.x + '%', top: dot.y + '%' }">
            <div :style="{
              width: '26px', height: '26px', borderRadius: '50%',
              background: getFlagBg(homeName),
              border: dot.position === 'GK' ? '2px solid #fbbf24' : '2px solid rgba(255,255,255,0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '8px', fontWeight: 700, color: '#fff',
              fontFamily: 'Anton, sans-serif', letterSpacing: '0.3px',
              textShadow: '0 1px 2px rgba(0,0,0,0.8)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
              flexShrink: 0,
            }">{{ dot.position === 'GK' ? 'GK' : '' }}</div>
            <div style="font-size: 7.5px; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.9); font-weight: 700; text-align: center; max-width: 44px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.2">
              {{ lastName(dot.name) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Squad lists -->
      <div v-if="data && !loading" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px">
        <!-- Home squad -->
        <div :style="{ background: '#0f172a', border: '1px solid ' + C.border, borderRadius: '10px', padding: '10px', overflow: 'hidden' }">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #1e293b">
            <span style="font-size: 18px">{{ getFlag(homeName) }}</span>
            <span style="font-family: Anton, sans-serif; font-size: 11px; color: #f8fafc; letter-spacing: 0.8px">{{ homeName }}</span>
          </div>
          <div v-for="group in groupedSquad(data.home.players)" :key="group.pos" style="margin-bottom: 10px">
            <div style="font-size: 8px; color: #475569; letter-spacing: 1.5px; font-weight: 700; text-transform: uppercase; margin-bottom: 4px">{{ group.label }}</div>
            <div v-for="p in group.players" :key="p.name" style="font-size: 10px; color: #cbd5e1; padding: 2px 0; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{ p.name }}</div>
          </div>
        </div>
        <!-- Away squad -->
        <div :style="{ background: '#0f172a', border: '1px solid ' + C.border, borderRadius: '10px', padding: '10px', overflow: 'hidden' }">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #1e293b">
            <span style="font-size: 18px">{{ getFlag(awayName) }}</span>
            <span style="font-family: Anton, sans-serif; font-size: 11px; color: #f8fafc; letter-spacing: 0.8px">{{ awayName }}</span>
          </div>
          <div v-for="group in groupedSquad(data.away.players)" :key="group.pos" style="margin-bottom: 10px">
            <div style="font-size: 8px; color: #475569; letter-spacing: 1.5px; font-weight: 700; text-transform: uppercase; margin-bottom: 4px">{{ group.label }}</div>
            <div v-for="p in group.players" :key="p.name" style="font-size: 10px; color: #cbd5e1; padding: 2px 0; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{ p.name }}</div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.lineup-spinner {
  width: 36px; height: 36px;
  border: 3px solid #1e293b;
  border-top-color: #22c55e;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg) } }
</style>
