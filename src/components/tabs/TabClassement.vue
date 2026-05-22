<script setup lang="ts">
import { computed } from 'vue'
import { useParticipantsStore } from '../../stores/participants'
import { useMatchesStore } from '../../stores/matches'
import { usePronosticsStore } from '../../stores/pronostics'
import { useBonusStore } from '../../stores/bonus'
import { C, sCard, sLabel, medalColors, medalIcons } from '../../constants/ui'
import { BONUS_TYPES } from '../../constants/bonus'
import { calcMatchPoints } from '../../utils/match'
import { initials } from '../../utils/ui'

const parts      = useParticipantsStore()
const matches    = useMatchesStore()
const pronos     = usePronosticsStore()
const bonusStore = useBonusStore()

function matchesPlayedCount() {
  return matches.matches.filter(m => m.result.home !== "" && m.result.away !== "").length
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
  BONUS_TYPES.forEach(b => {
    for (let i = 0; i < b.count; i++) {
      const res   = bonusStore.bonusResults[b.id + '_' + i]
      const prono = bonusStore.bonusPronostics[pid]?.[b.id + '_' + i]
      if (res && prono && res.toLowerCase().trim() === prono.toLowerCase().trim()) total += b.points
    }
  })
  return { total, exactCount, diagCount }
}

const rankings = computed(() =>
  parts.participants.map(p => ({ ...p, ...calcScore(p.id) }))
    .sort((a, b) => b.total - a.total || b.exactCount - a.exactCount)
)

function matchPtsForRanking(pid: number) {
  let total = 0
  matches.matches.forEach(m => {
    if (m.result.home === "" || m.result.away === "") return
    const pts = calcMatchPoints(pronos.pronostics[pid]?.[m.id], m.result)
    total += pronos.jokers[pid] === m.id ? pts * 2 : pts
  })
  return total
}
</script>

<template>
  <div>
    <!-- Banner -->
    <div class="card-rel" :style="{ ...sCard, background: 'linear-gradient(135deg, #1e3a8a 0%, #7f1d1d 100%)', marginBottom: '16px', textAlign: 'center', padding: '22px 16px', border: '1px solid #f59e0b66' }">
      <div style="position: absolute; top: -10px; left: -10px; font-size: 60px; opacity: 0.12">★</div>
      <div style="position: absolute; bottom: -20px; right: -10px; font-size: 80px; opacity: 0.10">🏆</div>
      <div style="font-size: 36px; line-height: 1; margin-bottom: 6px">🏆</div>
      <div class="anton" style="font-size: 22px; color: #fbbf24; letter-spacing: 2px; margin-bottom: 4px">CLASSEMENT GÉNÉRAL</div>
      <div style="font-size: 11px; color: #fef3c7; letter-spacing: 1px">★ Mis à jour en direct · partagé avec tous ★</div>
    </div>

    <div v-if="rankings.length === 0" :style="{ ...sCard, color: C.muted, textAlign: 'center', padding: '40px' }">
      <div style="font-size: 32px; margin-bottom: 6px">🥁</div>
      Pas encore de participants.
    </div>

    <!-- Podium -->
    <div v-if="rankings.length >= 2">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px">
        <div class="ribbon" style="background: linear-gradient(180deg, #f59e0b, #b45309)">PODIUM</div>
        <div :style="{ fontSize: '11px', color: C.muted }">The Goats</div>
      </div>
      <div class="podium">
        <!-- 2nd -->
        <div v-if="rankings[1]">
          <div class="podium-step silver" style="min-height: 110px">
            <div class="avatar-disc" :style="{ background: 'linear-gradient(135deg, ' + rankings[1].color + ', ' + rankings[1].color + 'cc)', margin: '0 auto 6px' }">{{ initials(rankings[1].name) }}</div>
            <div class="medal">🥈</div>
            <div class="p-name">{{ rankings[1].name }}</div>
            <div class="pts" style="color: #cbd5e1">{{ rankings[1].total }}</div>
            <div class="lbl">pts</div>
          </div>
          <div class="podium-base">2</div>
        </div>
        <div v-else></div>

        <!-- 1st -->
        <div>
          <div class="podium-step gold" style="min-height: 140px">
            <div style="position: absolute; top: -16px; left: 50%; transform: translateX(-50%); font-size: 26px">👑</div>
            <div class="avatar-disc" :style="{ background: 'linear-gradient(135deg, ' + rankings[0].color + ', ' + rankings[0].color + 'cc)', margin: '0 auto 6px', width: '44px', height: '44px', fontSize: '18px' }">{{ initials(rankings[0].name) }}</div>
            <div class="medal">🥇</div>
            <div class="p-name" style="font-size: 16px">{{ rankings[0].name }}</div>
            <div class="pts" style="font-size: 30px; color: #fbbf24">{{ rankings[0].total }}</div>
            <div class="lbl">points</div>
          </div>
          <div class="podium-base" style="background: linear-gradient(180deg, #78350f, #451a03); border-color: #f59e0b; color: #fbbf24">1</div>
        </div>

        <!-- 3rd -->
        <div v-if="rankings[2]">
          <div class="podium-step bronze" style="min-height: 90px">
            <div class="avatar-disc" :style="{ background: 'linear-gradient(135deg, ' + rankings[2].color + ', ' + rankings[2].color + 'cc)', margin: '0 auto 4px', width: '32px', height: '32px', fontSize: '13px' }">{{ initials(rankings[2].name) }}</div>
            <div class="medal" style="font-size: 20px">🥉</div>
            <div class="p-name">{{ rankings[2].name }}</div>
            <div class="pts" style="font-size: 20px; color: #fb923c">{{ rankings[2].total }}</div>
            <div class="lbl">pts</div>
          </div>
          <div class="podium-base">3</div>
        </div>
        <div v-else></div>
      </div>
    </div>

    <!-- Solo leader -->
    <div v-if="rankings.length === 1" class="card-rel" :style="{ ...sCard, background: 'linear-gradient(135deg, #78350f, #1c1507)', border: '1px solid #f59e0b66', padding: '20px', textAlign: 'center' }">
      <div style="font-size: 36px; margin-bottom: 4px">👑</div>
      <div class="anton" style="font-size: 18px; color: #fff; margin-bottom: 4px">{{ rankings[0].name }}</div>
      <div class="anton" style="font-size: 36px; color: #fbbf24; line-height: 1">{{ rankings[0].total }}</div>
      <div :style="{ fontSize: '10px', color: C.muted, letterSpacing: '1.5px', marginTop: '4px' }">POINTS · GOAT SOLO</div>
    </div>

    <!-- Positions 4+ -->
    <div v-if="rankings.length > 3" style="margin-top: 8px">
      <div :style="sLabel">★ Autres positions</div>
      <div v-for="(p, i) in rankings.slice(3)" :key="p.id" class="card-rel" :style="{ ...sCard, display: 'flex', alignItems: 'center', gap: '12px', padding: '10px' }">
        <div class="anton" :style="{ fontSize: '18px', width: '30px', textAlign: 'center', color: C.muted }">#{{ i + 4 }}</div>
        <div class="avatar-disc" :style="{ background: 'linear-gradient(135deg, ' + p.color + ', ' + p.color + 'cc)', width: '30px', height: '30px', fontSize: '12px' }">{{ initials(p.name) }}</div>
        <div style="flex: 1">
          <div class="anton" :style="{ fontSize: '14px', color: C.text }">{{ p.name }}</div>
          <div :style="{ fontSize: '10px', color: C.muted, marginTop: '2px' }">🎯 {{ p.exactCount }} exact{{ p.exactCount > 1 ? 's' : '' }}</div>
        </div>
        <div style="text-align: right">
          <div class="anton" :style="{ fontSize: '20px', color: C.text, lineHeight: 1 }">{{ p.total }}</div>
          <div :style="{ fontSize: '9px', color: C.muted, letterSpacing: '1px' }">PTS</div>
        </div>
      </div>
    </div>

    <!-- Stats table -->
    <div v-if="rankings.length > 1" :style="{ ...sCard, marginTop: '16px', background: '#0a0e1a', border: '1px solid #1e293b' }">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px">
        <div class="ribbon" style="background: linear-gradient(180deg, #1e3a8a, #1e293b)">STATS</div>
        <div :style="{ fontSize: '11px', color: C.muted }">détail par joueur</div>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px">
        <thead>
          <tr :style="{ color: C.muted }">
            <th style="text-align: left; padding: 6px; font-weight: 700; font-size: 10px; letter-spacing: 1px; text-transform: uppercase">Joueur</th>
            <th style="text-align: center; padding: 6px; font-weight: 700; font-size: 10px; letter-spacing: 1px; text-transform: uppercase">Joués</th>
            <th style="text-align: center; padding: 6px; font-weight: 700; font-size: 10px; letter-spacing: 1px; text-transform: uppercase">✅</th>
            <th style="text-align: center; padding: 6px; font-weight: 700; font-size: 10px; letter-spacing: 1px; text-transform: uppercase">🎯</th>
            <th style="text-align: right; padding: 6px; font-weight: 700; font-size: 10px; letter-spacing: 1px; text-transform: uppercase">Bonus</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(p, i) in rankings" :key="p.id" :style="{ borderTop: '1px solid ' + C.border }">
            <td style="padding: 8px 6px; font-weight: 700; font-family: Anton, sans-serif; letter-spacing: 0.5px">
              <span :style="{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: p.color, marginRight: '6px' }"></span>
              {{ p.name }}
            </td>
            <td :style="{ textAlign: 'center', padding: '8px 6px', color: C.muted }">{{ matchesPlayedCount() }}</td>
            <td :style="{ textAlign: 'center', padding: '8px 6px', color: '#60a5fa', fontWeight: 700 }">{{ p.diagCount }}</td>
            <td :style="{ textAlign: 'center', padding: '8px 6px', color: C.green, fontWeight: 700 }">{{ p.exactCount }}</td>
            <td :style="{ textAlign: 'right', padding: '8px 6px', color: C.gold, fontWeight: 700 }">{{ (p.total - matchPtsForRanking(p.id)) > 0 ? '+' + (p.total - matchPtsForRanking(p.id)) : '–' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
