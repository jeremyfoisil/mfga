<script setup lang="ts">
import { computed } from 'vue'
import { useParticipantsStore } from '../../stores/participants'
import { useMatchesStore } from '../../stores/matches'
import { usePronosticsStore } from '../../stores/pronostics'
import { useAdminStore } from '../../stores/admin'
import { useAuthStore } from '../../stores/auth'
import { C, sCard } from '../../constants/ui'
import { BONUS_TYPES } from '../../constants/bonus'
import { calcMatchPoints } from '../../utils/match'
import { initials, getFlag } from '../../utils/ui'
import { useBonusStore } from '../../stores/bonus'

// Une ligne condensée de prono gagnant pour les popups au survol des stats.
interface WinLine { home: string; away: string; pH: string; pA: string; pts: number; joker: boolean }
type PopCol = 'all' | 'diag' | 'exact' | 'joker'
const POP_TITLES: Record<PopCol, string> = {
  all:   '🏅 Pronos gagnants',
  diag:  '✅ Bons vainqueurs (+1)',
  exact: '🎯 Scores exacts (+3)',
  joker: '🃏 Joker',
}

const parts   = useParticipantsStore()
const matches = useMatchesStore()
const pronos  = usePronosticsStore()
const admin      = useAdminStore()
const auth       = useAuthStore()
const bonusStore = useBonusStore()

const myParticipantId = computed(() => auth.profile?.participant_id ?? null)

function isMe(pid: number) { return pid === myParticipantId.value }

function matchesPlayedCount() {
  return matches.matches.filter(m => m.result.home !== "" && m.result.away !== "").length
}

function pronoCompletion(pid: number) {
  const total = matches.matches.length
  if (!total) return { filled: 0, total: 0, pct: 0 }
  const filled = matches.matches.filter(m => {
    const p = pronos.pronostics[pid]?.[m.id]
    return p && p.home !== "" && p.away !== ""
  }).length
  return { filled, total, pct: Math.round(filled / total * 100) }
}

function calcScore(pid: number, keep: (m: (typeof matches.matches)[number]) => boolean = () => true) {
  let total = 0, exactCount = 0, diagCount = 0
  // Points supplémentaires rapportés par le joker (la part doublée). null tant que
  // le joker n'est pas posé ou que son match n'est pas encore joué.
  let jokerGain: number | null = null
  // Détail des pronos gagnants, pour les popups au survol des stats.
  const exact: WinLine[] = []
  const diag: WinLine[] = []
  let joker: WinLine | null = null
  matches.matches.forEach(m => {
    if (m.result.home === "" || m.result.away === "") return
    if (!keep(m)) return
    const prono = pronos.pronostics[pid]?.[m.id]
    const pts = calcMatchPoints(prono, m.result)
    const isJoker = pronos.jokers[pid] === m.id
    const line: WinLine = { home: m.home, away: m.away, pH: prono?.home ?? '', pA: prono?.away ?? '', pts, joker: isJoker }
    if (pts === 3) { exactCount++; exact.push(line) }
    else if (pts === 1) { diagCount++; diag.push(line) }
    if (isJoker) { total += pts * 2; jokerGain = pts; joker = line }
    else total += pts
  })
  BONUS_TYPES.forEach(b => {
    for (let i = 0; i < b.count; i++) {
      const res   = bonusStore.bonusResults[b.id + '_' + i]
      const prono = bonusStore.bonusPronostics[pid]?.[b.id + '_' + i]
      if (res && prono && res.toLowerCase().trim() === prono.toLowerCase().trim()) total += b.points
    }
  })
  const win = { exact, diag, joker, all: [...exact, ...diag] }
  return { total, exactCount, diagCount, jokerGain, win }
}

// Lignes à afficher dans la popup d'une stat donnée.
function popLines(p: { win: { exact: WinLine[]; diag: WinLine[]; joker: WinLine | null; all: WinLine[] } }, col: PopCol): WinLine[] {
  if (col === 'exact') return p.win.exact
  if (col === 'diag')  return p.win.diag
  if (col === 'joker') return p.win.joker ? [p.win.joker] : []
  return p.win.all
}

const rankings = computed(() =>
  parts.participants.map(p => ({ ...p, ...calcScore(p.id) }))
    .sort((a, b) => b.total - a.total || b.exactCount - a.exactCount)
)

// Date de la dernière journée jouée (le match résolu le plus récent). Sert de
// frontière pour le classement "précédent" : son état avant les résultats de
// cette journée, afin d'afficher la variation de rang de chaque participant.
const lastPlayedDate = computed(() => {
  let last = ''
  matches.matches.forEach(m => {
    if (m.result.home !== '' && m.result.away !== '' && m.matchDate && m.matchDate > last) last = m.matchDate
  })
  return last
})

// Construit une table id → rang (rang partagé en cas d'égalité, comme au
// classement). `sorted` doit déjà être trié du meilleur au moins bon.
function buildRankMap(sorted: { id: number; total: number; exactCount: number }[]): Map<number, number> {
  const map = new Map<number, number>()
  sorted.forEach((p, i) => {
    const prev = i > 0 ? sorted[i - 1] : null
    map.set(p.id, prev && prev.total === p.total && prev.exactCount === p.exactCount ? map.get(prev.id)! : i + 1)
  })
  return map
}

const currentRankMap = computed(() => buildRankMap(rankings.value))

// Classement avant la dernière journée jouée (matchs strictement antérieurs).
const previousRankMap = computed(() => {
  const cutoff = lastPlayedDate.value
  if (!cutoff) return null
  const prev = parts.participants
    .map(p => ({ id: p.id, ...calcScore(p.id, m => !!m.matchDate && m.matchDate < cutoff) }))
    .sort((a, b) => b.total - a.total || b.exactCount - a.exactCount)
  return buildRankMap(prev)
})

// 'up' / 'down' / 'same' selon l'évolution du rang depuis le dernier classement.
function rankMove(pid: number): { dir: 'up' | 'down' | 'same'; delta: number } {
  const prevMap = previousRankMap.value
  const prev = prevMap?.get(pid)
  const cur = currentRankMap.value.get(pid)
  if (prev == null || cur == null) return { dir: 'same', delta: 0 }
  const delta = prev - cur // >0 : a gagné des places
  return { dir: delta > 0 ? 'up' : delta < 0 ? 'down' : 'same', delta: Math.abs(delta) }
}


</script>

<template>
  <div>
    <div v-if="parts.participants.length === 0" :style="{ ...sCard, textAlign: 'center', padding: '30px', color: C.muted }">
      <div style="font-size: 36px; margin-bottom: 6px">🎉</div>
      Aucun participant enregistré.
    </div>

    <div v-for="(p, idx) in rankings" :key="p.id" class="card-rel pcard"
      :style="{ ...sCard, display: 'flex', alignItems: 'center', gap: '12px', border: (rankings[0] && p.id === rankings[0].id && p.total > 0) ? '1px solid #f59e0b66' : '1px solid ' + C.border, background: (rankings[0] && p.id === rankings[0].id && p.total > 0) ? 'linear-gradient(90deg, #1c1507 0%, #111827 60%)' : C.card }">
      <div v-if="rankings[0] && p.id === rankings[0].id && p.total > 0"
        style="position: absolute; top: 0; right: 0; background: #f59e0b; color: #0a0e1a; font-size: 9px; font-weight: 800; padding: 2px 8px 2px 10px; letter-spacing: 1px; font-family: Anton, sans-serif; clip-path: polygon(15% 0, 100% 0, 100% 100%, 0 100%)">LEADER</div>
      <div class="avatar-disc" :style="{ background: 'linear-gradient(135deg, ' + p.color + ', ' + p.color + 'cc)' }">
        {{ initials(p.name) }}
      </div>
      <div style="flex: 1; min-width: 0">
        <div class="anton" style="font-size: 16px; color: #f1f5f9; letter-spacing: 0.5px">{{ p.name }}</div>
        <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px; flex-wrap: wrap">
          <!-- Bon vainqueur (sans tooltip : trop de lignes) -->
          <div class="stat-chip" style="border-color: #60a5fa44">
            <span style="color: #60a5fa">✅ {{ p.diagCount }}</span>
          </div>
          <!-- Score exact -->
          <div class="stat-cell stat-chip" style="border-color: #22c55e44">
            <span style="color: #22c55e">🎯 {{ p.exactCount }}</span>
            <div class="stat-pop">
              <div class="stat-pop-title">{{ POP_TITLES.exact }}</div>
              <div v-for="(w, wi) in popLines(p, 'exact')" :key="wi" class="stat-pop-line">
                <span>{{ getFlag(w.home) }}</span><span class="stat-pop-score">{{ w.pH }}-{{ w.pA }}</span><span>{{ getFlag(w.away) }}</span>
                <span class="stat-pop-pts">🎯 +{{ w.joker ? w.pts * 2 : w.pts }}<span v-if="w.joker"> 🃏</span></span>
              </div>
              <div v-if="!popLines(p, 'exact').length" class="stat-pop-empty">Aucun</div>
            </div>
          </div>
          <!-- Joker -->
          <div class="stat-cell stat-chip" style="border-color: #f59e0b44">
            <span :style="{ color: p.jokerGain ? '#f59e0b' : '#64748b' }">🃏 {{ p.jokerGain === null ? '–' : (p.jokerGain > 0 ? '+' + p.jokerGain : '0') }}</span>
            <div class="stat-pop">
              <div class="stat-pop-title">{{ POP_TITLES.joker }}</div>
              <div v-for="(w, wi) in popLines(p, 'joker')" :key="wi" class="stat-pop-line">
                <span>{{ getFlag(w.home) }}</span><span class="stat-pop-score">{{ w.pH }}-{{ w.pA }}</span><span>{{ getFlag(w.away) }}</span>
                <span class="stat-pop-pts">🃏 +{{ w.joker ? w.pts * 2 : w.pts }}</span>
              </div>
              <div v-if="!popLines(p, 'joker').length" class="stat-pop-empty">{{ p.jokerGain === null ? 'Pas encore résolu' : 'Aucun' }}</div>
            </div>
          </div>
          <div v-if="isMe(p.id)" style="font-size: 10px; color: #3b82f6; font-weight: 700; background: #3b82f618; border: 1px solid #3b82f633; border-radius: 4px; padding: 1px 5px">Moi</div>
        </div>
        <div style="margin-top: 6px">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 3px">
            <span style="font-size: 10px; color: #64748b; letter-spacing: 0.5px">Pronos renseignés</span>
            <span style="font-size: 10px; font-weight: 700;" :style="{ color: pronoCompletion(p.id).pct === 100 ? '#22c55e' : pronoCompletion(p.id).pct >= 50 ? '#f59e0b' : '#ef4444' }">
              {{ pronoCompletion(p.id).filled }}/{{ pronoCompletion(p.id).total }} · {{ pronoCompletion(p.id).pct }}%
            </span>
          </div>
          <div style="height: 4px; background: #1e293b; border-radius: 2px; overflow: hidden">
            <div style="height: 100%; border-radius: 2px; transition: width 0.3s"
              :style="{ width: pronoCompletion(p.id).pct + '%', background: pronoCompletion(p.id).pct === 100 ? '#22c55e' : pronoCompletion(p.id).pct >= 50 ? '#f59e0b' : '#ef4444' }">
            </div>
          </div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 9px">
        <span class="rank-move" :class="rankMove(p.id).dir"
          :title="rankMove(p.id).dir === 'up' ? '+' + rankMove(p.id).delta + ' place(s) depuis la dernière journée' : rankMove(p.id).dir === 'down' ? '−' + rankMove(p.id).delta + ' place(s) depuis la dernière journée' : 'Rang inchangé'">
          <template v-if="rankMove(p.id).dir === 'up'">▲</template>
          <template v-else-if="rankMove(p.id).dir === 'down'">▼</template>
          <template v-else>—</template>
        </span>
        <div style="text-align: right">
          <div class="anton" :style="{ fontSize: '22px', color: (rankings[0] && p.id === rankings[0].id && p.total > 0) ? '#fbbf24' : C.text, lineHeight: 1 }">{{ p.total }}</div>
          <div style="font-size: 9px; color: #64748b; letter-spacing: 1px; text-transform: uppercase">points</div>
        </div>
      </div>
    </div>

    <!-- Rules card -->
    <div class="card-rel" :style="{ ...sCard, marginTop: '20px', background: '#0a0e1a', border: '1px solid #1e293b' }">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 14px">
        <div class="ribbon">RÈGLES</div>
        <div style="font-size: 12px; color: #64748b">du scoring</div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px">
        <div class="rule-chip" style="border-color: #22c55e44">
          <div class="num" style="color: #22c55e">3</div>
          <div><div class="lbl">🎯 Score exact</div><div class="sub">Pile poil — 1-2 = 1-2</div></div>
        </div>
        <div class="rule-chip" style="border-color: #eab30844">
          <div class="num" style="color: #eab308">1</div>
          <div><div class="lbl">✅ Bon résultat</div><div class="sub">V/N/D sans score exact</div></div>
        </div>
        <div class="rule-chip" style="border-color: #dc262644">
          <div class="num" style="color: #dc2626">0</div>
          <div><div class="lbl">❌ Mauvais résultat</div><div class="sub">Rien dans la besace</div></div>
        </div>
        <div class="rule-chip" style="border-color: #f59e0b44; background: linear-gradient(135deg, rgba(245,158,11,0.10), rgba(15,23,42,0.7))">
          <div class="num" style="color: #f59e0b">×2</div>
          <div><div class="lbl">🃏 Match Joker</div><div class="sub">1 joker par joueur</div></div>
        </div>
      </div>
      <div style="margin-top: 10px; padding: 8px 10px; background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.2); border-radius: 8px; font-size: 11px; color: #fde68a">
        ★ Bonus de début de tournoi en plus (voir onglet <b>Bonus</b>)
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Les cartes participants doivent laisser dépasser les popups de stats.
   .card-rel impose overflow:hidden globalement → on le rétablit ici, et on
   élève la carte survolée pour que la popup passe au-dessus des voisines. */
.card-rel.pcard { overflow: visible; }
.card-rel.pcard:hover { z-index: 10; }

.stat-chip {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 700;
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 999px;
  padding: 2px 8px;
  line-height: 1.4;
}

/* Popup au survol : liste condensée des pronos gagnants. */
.stat-cell { position: relative; cursor: help; }
.stat-pop {
  position: absolute;
  z-index: 30;
  bottom: 100%;
  left: 0;
  margin-bottom: 6px;
  min-width: 150px;
  max-width: 250px;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 8px 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
  text-align: left;
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  transform: translateY(4px);
  transition: opacity 0.12s ease, transform 0.12s ease;
  pointer-events: none;
}
.stat-cell:hover .stat-pop { opacity: 1; visibility: visible; transform: translateY(0); }
.stat-pop-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: #94a3b8;
  margin-bottom: 5px;
}
.stat-pop-line {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: #e2e8f0;
  padding: 2px 0;
}
.stat-pop-score { font-weight: 700; font-variant-numeric: tabular-nums; }
.stat-pop-pts { margin-left: auto; padding-left: 12px; color: #fbbf24; font-weight: 700; }
.stat-pop-empty { font-size: 11px; font-style: italic; color: #64748b; }

/* Variation de rang depuis le dernier classement (avant la dernière journée). */
.rank-move { font-size: 14px; line-height: 1; cursor: help; }
.rank-move.up   { color: #22c55e; }
.rank-move.down { color: #ef4444; }
.rank-move.same { color: #eab308; }
</style>
