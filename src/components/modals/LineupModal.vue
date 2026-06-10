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
// Y spread (vertical distribution of players in each row)
const Y_POS: Record<number, number[]> = {
  1: [50],
  2: [28, 72],
  3: [18, 50, 82],
  4: [11, 36, 64, 89],
  5: [8, 26, 50, 74, 92],
  6: [7, 21, 38, 62, 79, 93],
}

// X position per row type — landscape pitch, home on left, away on right
const HOME_X: Record<string, number> = { GK: 6, DEF: 22, MID: 38, FWD: 52 }
const AWAY_X: Record<string, number> = { GK: 94, DEF: 78, MID: 62, FWD: 48 }

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
  const xMap = side === 'home' ? HOME_X : AWAY_X
  const rows = [
    { players: xi.gks,  pos: 'GK'  },
    { players: xi.defs, pos: 'DEF' },
    { players: xi.mids, pos: 'MID' },
    { players: xi.fwds, pos: 'FWD' },
  ]
  return rows.flatMap(row => {
    const ys = Y_POS[row.players.length] ?? Y_POS[3]
    return row.players.map((p, i) => ({ ...p, x: xMap[row.pos], y: ys[i] }))
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
  <Teleport to="body">
  <!-- Backdrop — click outside the card to close -->
  <div
    style="position: fixed; inset: 0; background: rgba(0,0,0,0.82); z-index: 1000; display: flex; align-items: flex-start; justify-content: center; overflow-y: auto; padding: 20px 12px 40px"
    @click.self="emit('close')"
  >
    <!-- Card — click.stop so backdrop's @click.self never fires on card clicks -->
    <div
      style="width: 100%; max-width: 600px; background: #0f172a; border: 1px solid #1e293b; border-radius: 14px; overflow: hidden"
      @click.stop
    >

      <!-- Header -->
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 14px 10px; gap: 8px">
        <div style="display: flex; align-items: center; gap: 8px; min-width: 0">
          <span style="font-size: 26px; line-height: 1; flex-shrink: 0">{{ getFlag(homeName) }}</span>
          <div style="min-width: 0">
            <div style="font-family: Anton, sans-serif; font-size: 14px; color: #f8fafc; letter-spacing: 0.8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{ homeName }}</div>
            <div v-if="homeXI" style="font-size: 10px; color: #64748b; letter-spacing: 1px">{{ homeXI.formation }}</div>
          </div>
        </div>
        <div style="font-family: Anton, sans-serif; font-size: 11px; color: #475569; letter-spacing: 2px; flex-shrink: 0">VS</div>
        <div style="display: flex; align-items: center; gap: 8px; flex-direction: row-reverse; min-width: 0">
          <span style="font-size: 26px; line-height: 1; flex-shrink: 0">{{ getFlag(awayName) }}</span>
          <div style="text-align: right; min-width: 0">
            <div style="font-family: Anton, sans-serif; font-size: 14px; color: #f8fafc; letter-spacing: 0.8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{ awayName }}</div>
            <div v-if="awayXI" style="font-size: 10px; color: #64748b; letter-spacing: 1px">{{ awayXI.formation }}</div>
          </div>
        </div>
        <button @click="emit('close')"
          style="flex-shrink: 0; background: #1e293b; border: 1px solid #334155; border-radius: 50%; width: 28px; height: 28px; color: #64748b; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center">✕</button>
      </div>

      <!-- Loading -->
      <div v-if="loading" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 0; gap: 14px">
        <div class="lineup-spinner"></div>
        <div style="font-size: 12px; color: #64748b; letter-spacing: 1px; font-family: Anton, sans-serif">CHARGEMENT…</div>
      </div>

      <!-- Error -->
      <div v-else-if="error" style="text-align: center; padding: 40px; color: #ef4444; font-size: 13px">{{ error }}</div>

      <!-- Pitch -->
      <div v-else-if="data" style="position: relative; overflow: hidden">
        <!-- Source badge -->
        <div style="position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: 10; background: rgba(0,0,0,0.55); border: 1px solid rgba(255,255,255,0.15); border-radius: 999px; padding: 2px 10px; font-size: 9px; color: rgba(255,255,255,0.6); letter-spacing: 1.5px; font-family: Anton, sans-serif; white-space: nowrap">
          {{ data.source === 'lineup' ? '⚡ COMPO OFFICIELLE' : '📋 LISTE DU GROUPE' }}
        </div>

        <!-- Home team label (left) -->
        <div style="position: absolute; bottom: 8px; left: 10px; z-index: 10; font-size: 9px; color: rgba(255,255,255,0.5); letter-spacing: 1px; font-family: Anton, sans-serif">◀ {{ homeName.toUpperCase() }}</div>
        <!-- Away team label (right) -->
        <div style="position: absolute; bottom: 8px; right: 10px; z-index: 10; font-size: 9px; color: rgba(255,255,255,0.5); letter-spacing: 1px; font-family: Anton, sans-serif">{{ awayName.toUpperCase() }} ▶</div>

        <!-- Pitch surface — landscape (65% padding-top ≈ 154×100 ratio) -->
        <div style="position: relative; padding-top: 65%; background: linear-gradient(90deg, #166534 0%, #15803d 25%, #166534 50%, #15803d 75%, #166534 100%)">
          <!-- SVG field markings — landscape viewBox 0 0 154 100 -->
          <svg style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none" viewBox="0 0 154 100" preserveAspectRatio="none">
            <!-- outer border -->
            <rect x="3" y="3" width="148" height="94" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="0.5"/>
            <!-- center line (vertical) -->
            <line x1="77" y1="3" x2="77" y2="97" stroke="rgba(255,255,255,0.25)" stroke-width="0.5"/>
            <!-- center circle -->
            <circle cx="77" cy="50" r="10" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="0.5"/>
            <circle cx="77" cy="50" r="0.8" fill="rgba(255,255,255,0.3)"/>
            <!-- home penalty area (left) -->
            <rect x="3" y="22" width="22" height="56" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="0.4"/>
            <rect x="3" y="36" width="9" height="28" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="0.4"/>
            <circle cx="17" cy="50" r="0.8" fill="rgba(255,255,255,0.25)"/>
            <!-- away penalty area (right) -->
            <rect x="129" y="22" width="22" height="56" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="0.4"/>
            <rect x="142" y="36" width="9" height="28" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="0.4"/>
            <circle cx="137" cy="50" r="0.8" fill="rgba(255,255,255,0.25)"/>
            <!-- home goal (left edge) -->
            <rect x="0" y="43" width="3" height="14" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="0.5"/>
            <!-- away goal (right edge) -->
            <rect x="151" y="43" width="3" height="14" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="0.5"/>
          </svg>

          <!-- Home players (left half) -->
          <div v-for="dot in homeDots" :key="'home-' + dot.name"
            style="position: absolute; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 2px; pointer-events: none"
            :style="{ left: dot.x + '%', top: dot.y + '%' }">
            <div :style="{
              width: '24px', height: '24px', borderRadius: '50%',
              background: getFlagBg(homeName),
              border: dot.position === 'GK' ? '2px solid #fbbf24' : '2px solid rgba(255,255,255,0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '7px', fontWeight: 700, color: '#fff',
              fontFamily: 'Anton, sans-serif',
              textShadow: '0 1px 2px rgba(0,0,0,0.8)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
              flexShrink: 0,
            }">{{ dot.position === 'GK' ? 'GK' : '' }}</div>
            <div style="font-size: 7px; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.9); font-weight: 700; text-align: center; max-width: 40px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.2">
              {{ lastName(dot.name) }}
            </div>
          </div>

          <!-- Away players (right half) -->
          <div v-for="dot in awayDots" :key="'away-' + dot.name"
            style="position: absolute; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 2px; pointer-events: none"
            :style="{ left: dot.x + '%', top: dot.y + '%' }">
            <div :style="{
              width: '24px', height: '24px', borderRadius: '50%',
              background: getFlagBg(awayName),
              border: dot.position === 'GK' ? '2px solid #fbbf24' : '2px solid rgba(255,255,255,0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '7px', fontWeight: 700, color: '#fff',
              fontFamily: 'Anton, sans-serif',
              textShadow: '0 1px 2px rgba(0,0,0,0.8)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
              flexShrink: 0,
            }">{{ dot.position === 'GK' ? 'GK' : '' }}</div>
            <div style="font-size: 7px; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.9); font-weight: 700; text-align: center; max-width: 40px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.2">
              {{ lastName(dot.name) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Squad lists -->
      <div v-if="data && !loading" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #1e293b; border-top: 1px solid #1e293b; margin-top: 0">
        <!-- Home squad -->
        <div style="background: #0a0e1a; padding: 12px 10px">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #1e293b">
            <span style="font-size: 16px">{{ getFlag(homeName) }}</span>
            <span style="font-family: Anton, sans-serif; font-size: 10px; color: #94a3b8; letter-spacing: 0.8px">{{ homeName }}</span>
          </div>
          <div v-for="group in groupedSquad(data.home.players)" :key="group.pos" style="margin-bottom: 10px">
            <div style="font-size: 8px; color: #334155; letter-spacing: 1.5px; font-weight: 700; text-transform: uppercase; margin-bottom: 4px">{{ group.label }}</div>
            <div v-for="p in group.players" :key="p.name" style="font-size: 10px; color: #cbd5e1; padding: 2px 0; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{ p.name }}</div>
          </div>
        </div>
        <!-- Away squad -->
        <div style="background: #0a0e1a; padding: 12px 10px">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #1e293b">
            <span style="font-size: 16px">{{ getFlag(awayName) }}</span>
            <span style="font-family: Anton, sans-serif; font-size: 10px; color: #94a3b8; letter-spacing: 0.8px">{{ awayName }}</span>
          </div>
          <div v-for="group in groupedSquad(data.away.players)" :key="group.pos" style="margin-bottom: 10px">
            <div style="font-size: 8px; color: #334155; letter-spacing: 1.5px; font-weight: 700; text-transform: uppercase; margin-bottom: 4px">{{ group.label }}</div>
            <div v-for="p in group.players" :key="p.name" style="font-size: 10px; color: #cbd5e1; padding: 2px 0; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{ p.name }}</div>
          </div>
        </div>
      </div>

    </div>
  </div>
  </Teleport>
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
