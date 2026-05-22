<script setup lang="ts">
import { computed } from 'vue'
import { useParticipantsStore } from '../../stores/participants'
import { useMatchesStore } from '../../stores/matches'
import { usePronosticsStore } from '../../stores/pronostics'
import { useAdminStore } from '../../stores/admin'
import { useAuthStore } from '../../stores/auth'
import { C, sCard, medalColors, medalIcons } from '../../constants/ui'
import { calcMatchPoints } from '../../utils/match'
import { initials } from '../../utils/ui'

const parts   = useParticipantsStore()
const matches = useMatchesStore()
const pronos  = usePronosticsStore()
const admin   = useAdminStore()
const auth    = useAuthStore()

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

function calcScore(pid: number) {
  let total = 0, exactCount = 0, diagCount = 0
  matches.matches.forEach(m => {
    if (m.result.home === "" || m.result.away === "") return
    const pts = calcMatchPoints(pronos.pronostics[pid]?.[m.id], m.result)
    if (pts === 3) exactCount++
    else if (pts === 1) diagCount++
    total += pronos.jokers[pid] === m.id ? pts * 2 : pts
  })
  return { total, exactCount, diagCount }
}

const rankings = computed(() =>
  parts.participants.map(p => ({ ...p, ...calcScore(p.id) }))
    .sort((a, b) => b.total - a.total || b.exactCount - a.exactCount)
)

function badgeStyle(color: string) {
  return { background: color + "22", color, border: "1px solid " + color + "44", borderRadius: "6px", padding: "2px 8px", fontSize: "12px", fontWeight: 700 }
}
</script>

<template>
  <div>
    <div v-if="parts.participants.length === 0" :style="{ ...sCard, textAlign: 'center', padding: '30px', color: C.muted }">
      <div style="font-size: 36px; margin-bottom: 6px">🎉</div>
      Aucun participant enregistré.
    </div>

    <div v-for="(p, idx) in rankings" :key="p.id" class="card-rel"
      :style="{ ...sCard, display: 'flex', alignItems: 'center', gap: '12px', border: (rankings[0] && p.id === rankings[0].id && p.total > 0) ? '1px solid #f59e0b66' : '1px solid ' + C.border, background: (rankings[0] && p.id === rankings[0].id && p.total > 0) ? 'linear-gradient(90deg, #1c1507 0%, #111827 60%)' : C.card }">
      <div v-if="rankings[0] && p.id === rankings[0].id && p.total > 0"
        style="position: absolute; top: 0; right: 0; background: #f59e0b; color: #0a0e1a; font-size: 9px; font-weight: 800; padding: 2px 8px 2px 10px; letter-spacing: 1px; font-family: Anton, sans-serif; clip-path: polygon(15% 0, 100% 0, 100% 100%, 0 100%)">LEADER</div>
      <div class="avatar-disc star" :style="{ background: 'linear-gradient(135deg, ' + p.color + ', ' + p.color + 'cc)' }">
        {{ initials(p.name) }}
      </div>
      <div style="flex: 1; min-width: 0">
        <div class="anton" style="font-size: 16px; color: #f1f5f9; letter-spacing: 0.5px">{{ p.name }}</div>
        <div style="display: flex; align-items: center; gap: 6px; margin-top: 2px">
          <div style="font-size: 11px; color: #64748b">🎯 {{ p.exactCount }} exact{{ p.exactCount > 1 ? 's' : '' }}</div>
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
      <div style="text-align: right">
        <div class="anton" :style="{ fontSize: '22px', color: (rankings[0] && p.id === rankings[0].id && p.total > 0) ? '#fbbf24' : C.text, lineHeight: 1 }">{{ p.total }}</div>
        <div style="font-size: 9px; color: #64748b; letter-spacing: 1px; text-transform: uppercase">points</div>
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
