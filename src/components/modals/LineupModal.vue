<script setup lang="ts">
import { computed, ref } from 'vue'
import { getFlag, getFlagBg } from '../../utils/ui'
import { C } from '../../constants/ui'
import MatchStats from './MatchStats.vue'

interface Player { id?: number; name: string; position: 'GK' | 'DEF' | 'MID' | 'FWD'; number?: number; age?: number; photo?: string; onMin?: number; offMin?: number }
interface TeamData { name: string; players: Player[]; substitutes?: Player[] }
export interface LineupData {
  source: 'lineup' | 'squad'
  home: TeamData
  away: TeamData
}

interface Goal { id?: number; name: string; minute: number; penalty?: boolean; owngoal?: boolean }
interface Card { id?: number; name: string; minute: number; red?: boolean }

const props = withDefaults(defineProps<{
  matchId: number
  loading: boolean
  data: LineupData | null
  homeName: string
  awayName: string
  error: string | null
  homeGoals?: Goal[]
  awayGoals?: Goal[]
  homeCards?: Card[]
  awayCards?: Card[]
}>(), {
  homeGoals: () => [], awayGoals: () => [],
  homeCards: () => [], awayCards: () => [],
})
const emit = defineEmits<{ (e: 'close'): void }>()

const activeTab = ref<'lineup' | 'stats'>('lineup')
const statsVisited = ref(false)
function showStats() { activeTab.value = 'stats'; statsVisited.value = true }

// ── Goal / card badges per player ──────────────────────────────────
// Primary match is the API-Football player id (exact). Events or lineups
// without an id (manual admin entries, partial squads) fall back to an
// accent-insensitive last name + first initial key.
const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
function nameKey(name: string): string {
  const parts = name.trim().split(/\s+/)
  const last = parts.length === 1 ? parts[0] : parts.slice(1).join(' ')
  return stripAccents(last.toLowerCase()) + '|' + stripAccents((name.trim()[0] ?? '').toLowerCase())
}

type BadgeEvent = { icon: string; minute: number }
interface BadgeMaps { byId: Map<number, BadgeEvent[]>; byName: Map<string, BadgeEvent[]> }

function buildBadges(goals: Goal[], cards: Card[]): BadgeMaps {
  const byId = new Map<number, BadgeEvent[]>()
  const byName = new Map<string, BadgeEvent[]>()
  const get = (id: number | undefined, name: string): BadgeEvent[] => {
    const map = id != null ? byId : byName
    const key = id != null ? id : nameKey(name)
    let e = (map as Map<number | string, BadgeEvent[]>).get(key)
    if (!e) { e = []; (map as Map<number | string, BadgeEvent[]>).set(key, e) }
    return e
  }
  for (const g of goals) get(g.id, g.name).push({ icon: '⚽', minute: g.minute })
  for (const c of cards) get(c.id, c.name).push({ icon: c.red ? '🟥' : '🟨', minute: c.minute })
  return { byId, byName }
}

// A side's scorers = its own (non-own) goals + own goals it conceded to the
// other side (stored on the beneficiary side, credited back to the scorer here).
const homeBadges = computed(() => buildBadges(
  [...props.homeGoals.filter(g => !g.owngoal), ...props.awayGoals.filter(g => g.owngoal)],
  props.homeCards,
))
const awayBadges = computed(() => buildBadges(
  [...props.awayGoals.filter(g => !g.owngoal), ...props.homeGoals.filter(g => g.owngoal)],
  props.awayCards,
))

// One formatted entry per goal/card, chronological, minute in parentheses when known.
function badgeList(maps: BadgeMaps, player: { id?: number; name: string }): string[] {
  const ev = (player.id != null && maps.byId.get(player.id)) || maps.byName.get(nameKey(player.name))
  if (!ev || !ev.length) return []
  return [...ev].sort((a, b) => a.minute - b.minute)
    .map(e => e.minute ? `${e.icon} (${e.minute}')` : e.icon)
}
// Single-line variant for the inline lists (substitutes / squad fallback).
function badgeText(maps: BadgeMaps, player: { id?: number; name: string }): string {
  return badgeList(maps, player).join(' ')
}

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

// X position per row type — landscape pitch, home on left, away on right (max 47 / min 53)
const HOME_X: Record<string, number> = { GK: 6, DEF: 20, MID: 34, FWD: 46 }
const AWAY_X: Record<string, number> = { GK: 94, DEF: 80, MID: 66, FWD: 54 }

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

// ── Hover card (photo / number / age) ──────────────────────────────
const hover = ref<{ p: Player; x: number; y: number } | null>(null)
function showHover(e: MouseEvent, p: Player) {
  // Nothing extra to reveal → don't pop an empty card.
  if (!p.photo && p.number == null && p.age == null) return
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  hover.value = { p, x: r.left + r.width / 2, y: r.top }
}
function hideHover() { hover.value = null }

// ── Computed ───────────────────────────────────────────────────────
const homeXI   = computed(() => props.data ? buildXI(props.data.home.players) : null)
const awayXI   = computed(() => props.data ? buildXI(props.data.away.players) : null)
const homeDots = computed(() => homeXI.value ? toDots(homeXI.value, 'home') : [])
const awayDots = computed(() => awayXI.value ? toDots(awayXI.value, 'away') : [])
const hasPlayers = computed(() => homeDots.value.length > 0 || awayDots.value.length > 0)
const showLineup = computed(() => props.data?.source === 'lineup' && hasPlayers.value)

// Substitutes only exist on an official lineup (the squad view already lists everyone).
const homeSubs = computed(() => (showLineup.value && props.data?.home.substitutes) || [])
const awaySubs = computed(() => (showLineup.value && props.data?.away.substitutes) || [])
const hasSubs = computed(() => homeSubs.value.length > 0 || awaySubs.value.length > 0)

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
          <span class="flag" style="font-size: 26px; line-height: 1; flex-shrink: 0">{{ getFlag(homeName) }}</span>
          <div style="min-width: 0">
            <div style="font-family: Anton, sans-serif; font-size: 14px; color: #f8fafc; letter-spacing: 0.8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{ homeName }}</div>
            <div v-if="homeXI" style="font-size: 10px; color: #64748b; letter-spacing: 1px">{{ homeXI.formation }}</div>
          </div>
        </div>
        <div style="font-family: Anton, sans-serif; font-size: 11px; color: #475569; letter-spacing: 2px; flex-shrink: 0">VS</div>
        <div style="display: flex; align-items: center; gap: 8px; flex-direction: row-reverse; min-width: 0">
          <span class="flag" style="font-size: 26px; line-height: 1; flex-shrink: 0">{{ getFlag(awayName) }}</span>
          <div style="text-align: right; min-width: 0">
            <div style="font-family: Anton, sans-serif; font-size: 14px; color: #f8fafc; letter-spacing: 0.8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{ awayName }}</div>
            <div v-if="awayXI" style="font-size: 10px; color: #64748b; letter-spacing: 1px">{{ awayXI.formation }}</div>
          </div>
        </div>
        <button @click="emit('close')"
          style="flex-shrink: 0; background: #1e293b; border: 1px solid #334155; border-radius: 50%; width: 28px; height: 28px; color: #64748b; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center">✕</button>
      </div>

      <!-- Tab bar -->
      <div style="display: flex; border-bottom: 1px solid #1e293b">
        <button
          @click="activeTab = 'lineup'"
          :style="{ flex: 1, padding: '10px 0', background: 'transparent', border: 'none', borderBottom: activeTab === 'lineup' ? '2px solid #22c55e' : '2px solid transparent', color: activeTab === 'lineup' ? '#f8fafc' : '#64748b', fontFamily: 'Anton, sans-serif', fontSize: '12px', letterSpacing: '1.5px', textTransform: 'uppercase', cursor: 'pointer' }">
          Compositions
        </button>
        <button
          @click="showStats"
          :style="{ flex: 1, padding: '10px 0', background: 'transparent', border: 'none', borderBottom: activeTab === 'stats' ? '2px solid #22c55e' : '2px solid transparent', color: activeTab === 'stats' ? '#f8fafc' : '#64748b', fontFamily: 'Anton, sans-serif', fontSize: '12px', letterSpacing: '1.5px', textTransform: 'uppercase', cursor: 'pointer' }">
          Statistiques
        </button>
      </div>

      <!-- Compositions tab body -->
      <div v-show="activeTab === 'lineup'">

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

          <!-- Message si pas de lineup officiel -->
          <div v-if="!showLineup"
            style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none">
            <div style="background: rgba(0,0,0,0.65); border: 1px solid rgba(255,255,255,0.15); border-radius: 10px; padding: 10px 20px; font-family: Anton, sans-serif; font-size: 13px; color: rgba(255,255,255,0.7); letter-spacing: 1px; text-align: center">
              Compositions non disponibles
            </div>
          </div>

          <!-- Home players (left half) -->
          <template v-if="showLineup">
          <div v-for="dot in homeDots" :key="'home-' + dot.name"
            style="position: absolute; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 2px; pointer-events: none"
            :style="{ left: dot.x + '%', top: dot.y + '%' }">
            <div
              @mouseenter="showHover($event, dot)" @mouseleave="hideHover"
              :style="{
              position: 'relative',
              width: '31px', height: '31px', borderRadius: '50%',
              background: getFlagBg(homeName),
              border: dot.position === 'GK' ? '2px solid #fbbf24' : '2px solid rgba(255,255,255,0.8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '9px', fontWeight: 700, color: '#fff',
              fontFamily: 'Anton, sans-serif',
              textShadow: '0 1px 3px rgba(0,0,0,1)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.7)',
              flexShrink: 0, pointerEvents: 'auto', cursor: 'pointer',
            }">{{ dot.position === 'GK' ? 'GK' : '' }}
              <div v-if="badgeList(homeBadges, dot).length || dot.offMin != null"
                style="position: absolute; left: calc(100% + 4px); top: 50%; transform: translateY(-50%); display: inline-flex; flex-direction: column; align-items: flex-start; gap: 1px; pointer-events: none; z-index: 5; background: rgba(255,255,255,0.5); border: 1px solid rgba(255,255,255,0.35); border-radius: 5px; padding: 2px 5px; white-space: nowrap; font-family: 'Segoe UI', system-ui, sans-serif; font-size: 9px; font-weight: 600; line-height: 1.4">
                <span v-for="(b, i) in badgeList(homeBadges, dot)" :key="i" style="color: #0f172a">{{ b }}</span>
                <span v-if="dot.offMin != null" title="Sorti du jeu" style="color: #dc2626; font-weight: 700">▼ {{ dot.offMin }}'</span>
              </div>
            </div>
            <div style="font-family: Anton, sans-serif; font-size: 10px; color: #fff; white-space: nowrap; letter-spacing: 0.5px; line-height: 1.2">
              {{ lastName(dot.name) }}
            </div>
          </div>

          <!-- Away players (right half) -->
          <div v-for="dot in awayDots" :key="'away-' + dot.name"
            style="position: absolute; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 2px; pointer-events: none"
            :style="{ left: dot.x + '%', top: dot.y + '%' }">
            <div
              @mouseenter="showHover($event, dot)" @mouseleave="hideHover"
              :style="{
              position: 'relative',
              width: '31px', height: '31px', borderRadius: '50%',
              background: getFlagBg(awayName),
              border: dot.position === 'GK' ? '2px solid #fbbf24' : '2px solid rgba(255,255,255,0.8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '9px', fontWeight: 700, color: '#fff',
              fontFamily: 'Anton, sans-serif',
              textShadow: '0 1px 3px rgba(0,0,0,1)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.7)',
              flexShrink: 0, pointerEvents: 'auto', cursor: 'pointer',
            }">{{ dot.position === 'GK' ? 'GK' : '' }}
              <div v-if="badgeList(awayBadges, dot).length || dot.offMin != null"
                style="position: absolute; left: calc(100% + 4px); top: 50%; transform: translateY(-50%); display: inline-flex; flex-direction: column; align-items: flex-start; gap: 1px; pointer-events: none; z-index: 5; background: rgba(255,255,255,0.5); border: 1px solid rgba(255,255,255,0.35); border-radius: 5px; padding: 2px 5px; white-space: nowrap; font-family: 'Segoe UI', system-ui, sans-serif; font-size: 9px; font-weight: 600; line-height: 1.4">
                <span v-for="(b, i) in badgeList(awayBadges, dot)" :key="i" style="color: #0f172a">{{ b }}</span>
                <span v-if="dot.offMin != null" title="Sorti du jeu" style="color: #dc2626; font-weight: 700">▼ {{ dot.offMin }}'</span>
              </div>
            </div>
            <div style="font-family: Anton, sans-serif; font-size: 10px; color: #fff; white-space: nowrap; letter-spacing: 0.5px; line-height: 1.2">
              {{ lastName(dot.name) }}
            </div>
          </div>
          </template>
        </div>
      </div>

      <!-- Substitutes — just below the pitch (official lineup only) -->
      <div v-if="hasSubs" style="background: #0a0e1a; border-top: 1px solid #1e293b; padding: 10px 10px 12px">
        <div style="font-size: 8px; color: #334155; letter-spacing: 1.5px; font-weight: 700; text-transform: uppercase; margin-bottom: 8px; text-align: center">🔁 Remplaçants</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px">
          <!-- Home subs -->
          <div>
            <div
              v-for="p in homeSubs" :key="'hsub-' + p.name"
              @mouseenter="showHover($event, p)" @mouseleave="hideHover"
              :style="{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#94a3b8', padding: '2px 0', lineHeight: 1.4, cursor: (p.photo || p.number != null || p.age != null) ? 'pointer' : 'default' }">
              <span style="flex-shrink: 0; min-width: 16px; text-align: center; font-family: Anton, sans-serif; font-size: 9px; color: #475569">{{ p.number != null ? p.number : '·' }}</span>
              <span :style="{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: p.onMin != null ? '#e2e8f0' : '#94a3b8' }">{{ p.name }}</span>
              <span v-if="badgeText(homeBadges, p)" style="flex-shrink: 0">{{ badgeText(homeBadges, p) }}</span>
              <span style="margin-left: auto; display: inline-flex; gap: 4px; flex-shrink: 0; white-space: nowrap; font-family: 'Segoe UI', system-ui, sans-serif; font-size: 10px; font-weight: 600">
                <span v-if="p.onMin != null" style="color: #22c55e" title="Entré en jeu">▲ {{ p.onMin }}'</span>
                <span v-if="p.offMin != null" style="color: #f87171" title="Sorti du jeu">▼ {{ p.offMin }}'</span>
              </span>
            </div>
          </div>
          <!-- Away subs -->
          <div>
            <div
              v-for="p in awaySubs" :key="'asub-' + p.name"
              @mouseenter="showHover($event, p)" @mouseleave="hideHover"
              :style="{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#94a3b8', padding: '2px 0', lineHeight: 1.4, cursor: (p.photo || p.number != null || p.age != null) ? 'pointer' : 'default' }">
              <span style="flex-shrink: 0; min-width: 16px; text-align: center; font-family: Anton, sans-serif; font-size: 9px; color: #475569">{{ p.number != null ? p.number : '·' }}</span>
              <span :style="{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: p.onMin != null ? '#e2e8f0' : '#94a3b8' }">{{ p.name }}</span>
              <span v-if="badgeText(awayBadges, p)" style="flex-shrink: 0">{{ badgeText(awayBadges, p) }}</span>
              <span style="margin-left: auto; display: inline-flex; gap: 4px; flex-shrink: 0; white-space: nowrap; font-family: 'Segoe UI', system-ui, sans-serif; font-size: 10px; font-weight: 600">
                <span v-if="p.onMin != null" style="color: #22c55e" title="Entré en jeu">▲ {{ p.onMin }}'</span>
                <span v-if="p.offMin != null" style="color: #f87171" title="Sorti du jeu">▼ {{ p.offMin }}'</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Squad lists — only as a fallback when there's no official lineup on the pitch -->
      <div v-if="data && !loading && !showLineup" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #1e293b; border-top: 1px solid #1e293b; margin-top: 0">
        <!-- Home squad -->
        <div style="background: #0a0e1a; padding: 12px 10px">
          <div style="margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #1e293b">
            <span style="font-family: Anton, sans-serif; font-size: 11px; color: #f8fafc; letter-spacing: 0.8px">{{ homeName }}</span>
          </div>
          <div v-for="group in groupedSquad(data.home.players)" :key="group.pos" style="margin-bottom: 10px">
            <div style="font-size: 8px; color: #334155; letter-spacing: 1.5px; font-weight: 700; text-transform: uppercase; margin-bottom: 4px">{{ group.label }}</div>
            <div v-for="p in group.players" :key="p.name" @mouseenter="showHover($event, p)" @mouseleave="hideHover" :style="{ fontSize: '10px', color: '#cbd5e1', padding: '2px 0', lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: (p.photo || p.number != null || p.age != null) ? 'pointer' : 'default' }">{{ p.name }}<span v-if="badgeText(homeBadges, p)" style="margin-left: 4px">{{ badgeText(homeBadges, p) }}</span></div>
          </div>
        </div>
        <!-- Away squad -->
        <div style="background: #0a0e1a; padding: 12px 10px">
          <div style="margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #1e293b">
            <span style="font-family: Anton, sans-serif; font-size: 11px; color: #f8fafc; letter-spacing: 0.8px">{{ awayName }}</span>
          </div>
          <div v-for="group in groupedSquad(data.away.players)" :key="group.pos" style="margin-bottom: 10px">
            <div style="font-size: 8px; color: #334155; letter-spacing: 1.5px; font-weight: 700; text-transform: uppercase; margin-bottom: 4px">{{ group.label }}</div>
            <div v-for="p in group.players" :key="p.name" @mouseenter="showHover($event, p)" @mouseleave="hideHover" :style="{ fontSize: '10px', color: '#cbd5e1', padding: '2px 0', lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: (p.photo || p.number != null || p.age != null) ? 'pointer' : 'default' }">{{ p.name }}<span v-if="badgeText(awayBadges, p)" style="margin-left: 4px">{{ badgeText(awayBadges, p) }}</span></div>
          </div>
        </div>
      </div>

      </div>
      <!-- /Compositions tab body -->

      <!-- Statistiques tab body -->
      <div v-show="activeTab === 'stats'">
        <MatchStats v-if="statsVisited" :match-id="matchId" :home-name="homeName" :away-name="awayName" />
      </div>

    </div>
  </div>

  <!-- Player hover card — photo / number / age -->
  <div v-if="hover"
    :style="{
      position: 'fixed', left: hover.x + 'px', top: (hover.y - 10) + 'px',
      transform: 'translate(-50%, -100%)', zIndex: 2000, pointerEvents: 'none',
      background: '#0f172a', border: '1px solid #334155', borderRadius: '10px',
      padding: '8px 10px', boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', gap: '10px', maxWidth: '220px',
    }">
    <img v-if="hover.p.photo" :src="hover.p.photo" :alt="hover.p.name"
      style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; background: #1e293b; flex-shrink: 0; border: 1px solid #334155" />
    <div style="min-width: 0">
      <div style="font-family: Anton, sans-serif; font-size: 12px; color: #f8fafc; letter-spacing: 0.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{ hover.p.name }}</div>
      <div style="font-size: 10px; color: #94a3b8; margin-top: 2px; white-space: nowrap">
        <span v-if="hover.p.number != null" style="color: #fbbf24; font-weight: 700">#{{ hover.p.number }}</span>
        <span v-if="hover.p.number != null && hover.p.age != null" style="margin: 0 5px; color: #475569">·</span>
        <span v-if="hover.p.age != null">{{ hover.p.age }} ans</span>
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
