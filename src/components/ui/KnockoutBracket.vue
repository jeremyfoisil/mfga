<script setup lang="ts">
import { computed } from 'vue'
import { useMatchesStore } from '../../stores/matches'
import { buildBracket, type GroupRank } from '../../utils/bracket'
import { LEFT_COLUMNS, RIGHT_COLUMNS, FINAL_MATCH, THIRD_MATCH, roundLabel } from '../../constants/bracket'
import { getFlag } from '../../utils/ui'
import { teamCode } from '../../constants/teams'

const props = defineProps<{ ranks: GroupRank[] }>()
const matchesStore = useMatchesStore()

const model = computed(() => buildBracket(matchesStore.matches, props.ranks))

// Y a-t-il au moins un match KO en base ?
const hasKO = computed(() => matchesStore.matches.some(m => m.stage !== 'group'))

// Label de tour pour l'en-tête d'une colonne (à partir de son premier match).
function colLabel(col: number[]): string { return roundLabel(col[0]) }
</script>

<template>
  <div v-if="!hasKO" :style="{ background: '#111827', border: '1px solid #1e293b', borderRadius: '12px', padding: '40px 20px', textAlign: 'center', marginTop: '10px' }">
    <div style="font-size: 13px; font-family: Anton, sans-serif; letter-spacing: 1px; color: #f59e0b">TABLEAU PAS ENCORE DISPONIBLE</div>
    <div style="font-size: 11px; color: #475569; margin-top: 6px">Il se remplira dès le début de la phase finale.</div>
  </div>

  <div v-else class="bracket-scroll">
    <div class="bracket">
      <!-- Moitié gauche : colonnes extérieur -> centre -->
      <div v-for="(col, ci) in LEFT_COLUMNS" :key="'L' + ci" class="bcol">
        <div class="bcol-label">{{ colLabel(col) }}</div>
        <div class="bcol-cells">
          <div v-for="mn in col" :key="mn" class="bcell">
            <template v-if="model.cells[mn]">
              <div class="brow" :class="{ won: model.cells[mn].top.won }">
                <span class="bflag">{{ model.cells[mn].top.name ? getFlag(model.cells[mn].top.name!) : '⬜' }}</span>
                <span class="bcode">{{ model.cells[mn].top.name ? teamCode(model.cells[mn].top.name!) : '—' }}</span>
                <span class="bscore">{{ model.cells[mn].scoreTop }}</span>
              </div>
              <div class="brow" :class="{ won: model.cells[mn].bottom.won }">
                <span class="bflag">{{ model.cells[mn].bottom.name ? getFlag(model.cells[mn].bottom.name!) : '⬜' }}</span>
                <span class="bcode">{{ model.cells[mn].bottom.name ? teamCode(model.cells[mn].bottom.name!) : '—' }}</span>
                <span class="bscore">{{ model.cells[mn].scoreBottom }}</span>
              </div>
              <span v-if="model.cells[mn].live" class="blive"></span>
            </template>
            <div v-else class="bcell-empty">à définir</div>
          </div>
        </div>
      </div>

      <!-- Centre : finale + 3e place -->
      <div class="bcol bcol-final">
        <div class="bcol-label">Finale</div>
        <div class="bcol-cells">
          <div class="bcell bcell-trophy">
            <div class="btrophy">🏆</div>
            <div v-if="model.cells[FINAL_MATCH]" class="bcell">
              <div class="brow" :class="{ won: model.cells[FINAL_MATCH].top.won }">
                <span class="bflag">{{ model.cells[FINAL_MATCH].top.name ? getFlag(model.cells[FINAL_MATCH].top.name!) : '⬜' }}</span>
                <span class="bcode">{{ model.cells[FINAL_MATCH].top.name ? teamCode(model.cells[FINAL_MATCH].top.name!) : '—' }}</span>
                <span class="bscore">{{ model.cells[FINAL_MATCH].scoreTop }}</span>
              </div>
              <div class="brow" :class="{ won: model.cells[FINAL_MATCH].bottom.won }">
                <span class="bflag">{{ model.cells[FINAL_MATCH].bottom.name ? getFlag(model.cells[FINAL_MATCH].bottom.name!) : '⬜' }}</span>
                <span class="bcode">{{ model.cells[FINAL_MATCH].bottom.name ? teamCode(model.cells[FINAL_MATCH].bottom.name!) : '—' }}</span>
                <span class="bscore">{{ model.cells[FINAL_MATCH].scoreBottom }}</span>
              </div>
            </div>
            <div v-else class="bcell-empty">Finale</div>
            <div v-if="model.champion" class="bchamp">🏆 {{ teamCode(model.champion) }}</div>
            <div class="bthird">
              <div class="bcol-label">3e place</div>
              <div v-if="model.cells[THIRD_MATCH]" class="bcell">
                <div class="brow"><span class="bflag">{{ model.cells[THIRD_MATCH].top.name ? getFlag(model.cells[THIRD_MATCH].top.name!) : '⬜' }}</span><span class="bcode">{{ model.cells[THIRD_MATCH].top.name ? teamCode(model.cells[THIRD_MATCH].top.name!) : '—' }}</span><span class="bscore">{{ model.cells[THIRD_MATCH].scoreTop }}</span></div>
                <div class="brow"><span class="bflag">{{ model.cells[THIRD_MATCH].bottom.name ? getFlag(model.cells[THIRD_MATCH].bottom.name!) : '⬜' }}</span><span class="bcode">{{ model.cells[THIRD_MATCH].bottom.name ? teamCode(model.cells[THIRD_MATCH].bottom.name!) : '—' }}</span><span class="bscore">{{ model.cells[THIRD_MATCH].scoreBottom }}</span></div>
              </div>
              <div v-else class="bcell-empty">à définir</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Moitié droite : colonnes centre -> extérieur -->
      <div v-for="(col, ci) in RIGHT_COLUMNS" :key="'R' + ci" class="bcol">
        <div class="bcol-label">{{ colLabel(col) }}</div>
        <div class="bcol-cells">
          <div v-for="mn in col" :key="mn" class="bcell">
            <template v-if="model.cells[mn]">
              <div class="brow" :class="{ won: model.cells[mn].top.won }">
                <span class="bflag">{{ model.cells[mn].top.name ? getFlag(model.cells[mn].top.name!) : '⬜' }}</span>
                <span class="bcode">{{ model.cells[mn].top.name ? teamCode(model.cells[mn].top.name!) : '—' }}</span>
                <span class="bscore">{{ model.cells[mn].scoreTop }}</span>
              </div>
              <div class="brow" :class="{ won: model.cells[mn].bottom.won }">
                <span class="bflag">{{ model.cells[mn].bottom.name ? getFlag(model.cells[mn].bottom.name!) : '⬜' }}</span>
                <span class="bcode">{{ model.cells[mn].bottom.name ? teamCode(model.cells[mn].bottom.name!) : '—' }}</span>
                <span class="bscore">{{ model.cells[mn].scoreBottom }}</span>
              </div>
              <span v-if="model.cells[mn].live" class="blive"></span>
            </template>
            <div v-else class="bcell-empty">à définir</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bracket-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; padding: 12px 0; margin-top: 8px; }
.bracket { display: flex; align-items: stretch; gap: 6px; min-width: max-content; }
.bcol { display: flex; flex-direction: column; min-width: 78px; }
.bcol-label { font-family: Anton, sans-serif; font-size: 9px; letter-spacing: 1px; color: #f59e0b; text-align: center; margin-bottom: 6px; text-transform: uppercase; }
.bcol-cells { display: flex; flex-direction: column; justify-content: space-around; flex: 1; gap: 6px; }
.bcell { position: relative; background: #0f172a; border: 1px solid #1e293b; border-radius: 6px; padding: 3px 4px; }
.bcell-empty { display: flex; align-items: center; justify-content: center; min-height: 38px; background: #0b1220; border: 1px dashed #1e293b; border-radius: 6px; color: #475569; font-size: 9px; font-style: italic; }
.brow { display: flex; align-items: center; gap: 4px; padding: 1px 0; }
.brow.won .bcode { color: #fbbf24; font-weight: 800; }
.brow.won .bscore { color: #fbbf24; }
.brow:not(.won) { opacity: 0.72; }
.bflag { font-size: 13px; line-height: 1; }
.bcode { flex: 1; font-size: 10px; font-weight: 700; color: #e2e8f0; letter-spacing: 0.5px; }
.bscore { font-size: 11px; font-family: Anton, sans-serif; color: #94a3b8; min-width: 9px; text-align: right; }
.blive { position: absolute; top: 3px; right: 3px; width: 6px; height: 6px; border-radius: 50%; background: #ef4444; animation: pulse 1s infinite; }
@keyframes pulse { 50% { opacity: 0.3 } }
.bcol-final { min-width: 92px; justify-content: center; }
.bcell-trophy { display: flex; flex-direction: column; align-items: stretch; gap: 6px; background: transparent; border: none; padding: 0; }
.btrophy { font-size: 26px; text-align: center; }
.bchamp { text-align: center; font-family: Anton, sans-serif; font-size: 12px; color: #fbbf24; letter-spacing: 1px; }
.bthird { margin-top: 10px; }
</style>
