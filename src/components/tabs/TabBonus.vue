<script setup lang="ts">
import { computed } from 'vue'
import { useParticipantsStore } from '../../stores/participants'
import { useBonusStore } from '../../stores/bonus'
import { useAdminStore } from '../../stores/admin'
import { useAuthStore } from '../../stores/auth'
import { C, sCard, sInput, sLabel, BONUS_LOCK_DATE } from '../../constants/ui'
import { BONUS_TYPES, BONUS_ICONS } from '../../constants/bonus'
import { ALL_TEAMS } from '../../constants/teams'
import { initials } from '../../utils/ui'
import PlayerSearch from '../ui/PlayerSearch.vue'

const parts      = useParticipantsStore()
const bonusStore = useBonusStore()
const admin      = useAdminStore()
const auth       = useAuthStore()

const myParticipantId    = computed(() => auth.profile?.participant_id ?? null)
const bonusLocked        = computed(() => new Date() >= BONUS_LOCK_DATE)
const canEditBonusResult = computed(() => admin.isAdmin && !bonusLocked.value)

function isMe(pid: number) { return pid === myParticipantId.value }

function getBonusValue(pid: number, bonusId: string, idx: number) {
  return bonusStore.bonusPronostics[pid]?.[bonusId + '_' + idx] ?? ''
}
function getBonusProno(pid: number, key: string) {
  return bonusStore.bonusPronostics[pid]?.[key] ?? ''
}
function getBonusResult(bonusId: string, idx: number) {
  return bonusStore.bonusResults[bonusId + '_' + idx] ?? ''
}
function isBonusCorrect(pid: number, bonusId: string, idx: number) {
  const r = getBonusResult(bonusId, idx)
  const p = getBonusValue(pid, bonusId, idx)
  return r && p && r.toLowerCase().trim() === p.toLowerCase().trim()
}
function isBonusWrong(pid: number, bonusId: string, idx: number) {
  const r = getBonusResult(bonusId, idx)
  const p = getBonusValue(pid, bonusId, idx)
  return r && p && r.toLowerCase().trim() !== p.toLowerCase().trim()
}
function getBonusIcon(id: string) { return BONUS_ICONS[id] }
</script>

<template>
  <div>
    <div :style="{ ...sCard, marginBottom: '14px', background: '#0a0e1a', border: '1px solid #1e293b', display: 'flex', gap: '12px', alignItems: 'center' }">
      <div style="font-size: 28px; flex-shrink: 0">🎯</div>
      <div>
        <div class="anton" style="font-size: 14px; color: #fbbf24; letter-spacing: 1px; margin-bottom: 2px">PRONOSTICS BONUS</div>
        <div :style="{ fontSize: '11px', color: C.muted, lineHeight: 1.5 }">
          <span v-if="bonusLocked" style="color: #ef4444; font-weight: 700">🔒 Verrouillé depuis le 11 juin 2026.</span>
          <span v-else>À rendre avant le <b style="color: #f8fafc">11 juin 2026</b>. Saisissez vos prédictions avant le coup d'envoi.</span>
        </div>
      </div>
    </div>

    <div v-for="b in BONUS_TYPES" :key="b.id" class="card-rel" :style="{ ...sCard, padding: '0', overflow: 'hidden' }">
      <!-- Bonus header -->
      <div class="bonus-header" :style="{ background: getBonusIcon(b.id).bg }">
        <div class="bonus-icon-box" style="background: rgba(255,255,255,0.18)">{{ getBonusIcon(b.id).icon }}</div>
        <div style="flex: 1; min-width: 0">
          <div class="anton" style="font-size: 15px; color: #fff; letter-spacing: 0.8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{ b.label }}</div>
          <div style="font-size: 10px; color: rgba(255,255,255,0.85); margin-top: 2px; letter-spacing: 1px">
            {{ b.count > 1 ? b.count + ' prédictions' : '1 prédiction' }} · récompense par bonne réponse
          </div>
        </div>
        <div style="background: rgba(0,0,0,0.3); padding: 4px 10px; border-radius: 999px; font-family: Anton, sans-serif; font-size: 13px; color: #fff; letter-spacing: 1px; flex-shrink: 0">
          +{{ b.points }} PTS
        </div>
      </div>

      <div style="padding: 0 14px 14px">
        <template v-for="i in b.count" :key="i">
          <div :style="{ marginBottom: b.count > 1 && i < b.count ? '16px' : '0', padding: b.count > 1 ? '10px' : '0', background: b.count > 1 ? 'rgba(15,23,42,0.5)' : 'transparent', borderRadius: b.count > 1 ? '8px' : '0', border: b.count > 1 ? '1px solid ' + C.border : 'none', marginTop: b.count > 1 ? '10px' : '10px' }">
            <div v-if="b.count > 1" class="anton" :style="{ fontSize: '11px', color: C.muted, letterSpacing: '1.5px', marginBottom: '8px' }">★ #{{ i }}</div>
            <!-- Result input -->
            <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px">
              <div style="display: flex; align-items: center; gap: 6px; width: 90px; flex-shrink: 0">
                <span :style="{ width: '8px', height: '8px', borderRadius: '50%', background: bonusStore.bonusResults[b.id + '_' + (i - 1)] ? '#22c55e' : C.muted }"></span>
                <span :style="{ fontSize: '10px', color: bonusStore.bonusResults[b.id + '_' + (i - 1)] ? '#22c55e' : C.muted, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }">Résultat</span>
              </div>
              <template v-if="['winner','finalist','semi','surprise','upset'].includes(b.id)">
                <select v-if="canEditBonusResult"
                  :style="{ ...sInput, borderColor: bonusStore.bonusResults[b.id + '_' + (i - 1)] ? '#22c55e66' : C.border }"
                  :value="bonusStore.bonusResults[b.id + '_' + (i - 1)] || ''"
                  @change="bonusStore.setBonusResult(b.id, i - 1, ($event.target as HTMLSelectElement).value)">
                  <option value="">À renseigner...</option>
                  <option v-for="team in ALL_TEAMS" :key="team" :value="team">{{ team }}</option>
                </select>
                <div v-else :style="{ ...sInput, borderColor: bonusStore.bonusResults[b.id + '_' + (i - 1)] ? '#22c55e66' : C.border, color: bonusStore.bonusResults[b.id + '_' + (i - 1)] ? '#22c55e' : C.muted, display: 'flex', alignItems: 'center' }">
                  {{ bonusStore.bonusResults[b.id + '_' + (i - 1)] || '—' }}
                </div>
              </template>
              <template v-else>
                <PlayerSearch v-if="canEditBonusResult && b.id === 'topscorer'"
                  :value="bonusStore.bonusResults[b.id + '_' + (i - 1)] || ''"
                  placeholder="Rechercher un joueur…"
                  @update="bonusStore.setBonusResult(b.id, i - 1, $event)" />
                <input v-else-if="canEditBonusResult"
                  :style="{ ...sInput, borderColor: bonusStore.bonusResults[b.id + '_' + (i - 1)] ? '#22c55e66' : C.border }"
                  placeholder="À renseigner..."
                  :value="bonusStore.bonusResults[b.id + '_' + (i - 1)] || ''"
                  @input="bonusStore.setBonusResult(b.id, i - 1, ($event.target as HTMLInputElement).value)" />
                <div v-else :style="{ ...sInput, borderColor: bonusStore.bonusResults[b.id + '_' + (i - 1)] ? '#22c55e66' : C.border, color: bonusStore.bonusResults[b.id + '_' + (i - 1)] ? '#22c55e' : C.muted, display: 'flex', alignItems: 'center' }">
                  {{ bonusStore.bonusResults[b.id + '_' + (i - 1)] || '—' }}
                </div>
              </template>
            </div>
            <!-- Participant rows -->
            <div v-for="p in parts.participants" :key="p.id" style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px">
              <div style="display: flex; align-items: center; gap: 6px; width: 90px; flex-shrink: 0">
                <div :style="{ width: '22px', height: '22px', borderRadius: '50%', background: 'linear-gradient(135deg, ' + p.color + ', ' + p.color + 'cc)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, fontFamily: 'Anton, sans-serif', flexShrink: 0 }">{{ initials(p.name) }}</div>
                <span :style="{ fontSize: '11px', fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }">{{ p.name }}</span>
              </div>
              <template v-if="bonusLocked || !isMe(p.id)">
                <div :style="{ ...sInput, color: getBonusProno(p.id, b.id + '_' + (i - 1)) ? (isBonusCorrect(p.id, b.id, i - 1) ? '#22c55e' : isBonusWrong(p.id, b.id, i - 1) ? '#ef4444' : C.text) : C.muted, borderColor: isBonusCorrect(p.id, b.id, i - 1) ? '#22c55e' : isBonusWrong(p.id, b.id, i - 1) ? '#ef444466' : C.border, opacity: isMe(p.id) ? 1 : 0.6, display: 'flex', alignItems: 'center' }">
                  {{ getBonusProno(p.id, b.id + '_' + (i - 1)) || '—' }}
                </div>
              </template>
              <template v-else>
                <select v-if="['winner','finalist','semi','surprise','upset'].includes(b.id)"
                  :style="{ ...sInput, borderColor: C.border, background: '#1e293b' }"
                  :value="getBonusProno(p.id, b.id + '_' + (i - 1))"
                  @change="bonusStore.setBonus(p.id, b.id, i - 1, ($event.target as HTMLSelectElement).value)">
                  <option value="">Choisir une équipe...</option>
                  <option v-for="team in ALL_TEAMS" :key="team" :value="team">{{ team }}</option>
                </select>
                <PlayerSearch v-else-if="b.id === 'topscorer'"
                  :value="getBonusProno(p.id, b.id + '_' + (i - 1))"
                  placeholder="Rechercher un joueur…"
                  @update="bonusStore.setBonus(p.id, b.id, i - 1, $event)" />
                <input v-else
                  :style="{ ...sInput, borderColor: C.border, background: '#1e293b' }"
                  placeholder="Mon pronostic..."
                  :value="getBonusProno(p.id, b.id + '_' + (i - 1))"
                  @input="bonusStore.setBonus(p.id, b.id, i - 1, ($event.target as HTMLInputElement).value)" />
              </template>
              <span v-if="isBonusCorrect(p.id, b.id, i - 1)" style="color: #22c55e; font-weight: 800; font-size: 12px; flex-shrink: 0; font-family: Anton, sans-serif; letter-spacing: 0.5px">+{{ b.points }}</span>
              <span v-else-if="isBonusWrong(p.id, b.id, i - 1)" style="color: #ef4444; font-size: 14px; flex-shrink: 0">✕</span>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
