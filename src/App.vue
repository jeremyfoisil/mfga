<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { sb } from './supabase'
import { useAuthStore } from './stores/auth'
import { useAppStore } from './stores/app'
import { useAdminStore } from './stores/admin'
import { C } from './constants/ui'
import { FLAG_COLORS, MELTING_POT_FLAGS } from './constants/teams'
import AuthScreen from './components/AuthScreen.vue'
import AppHeader from './components/AppHeader.vue'
import AdminModal from './components/modals/AdminModal.vue'
import ImportModal from './components/modals/ImportModal.vue'
import TabParticipants from './components/tabs/TabParticipants.vue'
import TabMatchs from './components/tabs/TabMatchs.vue'
import TabBonus from './components/tabs/TabBonus.vue'
import TabTableau from './components/tabs/TabTableau.vue'
import TabClassement from './components/tabs/TabClassement.vue'

const auth  = useAuthStore()
const app   = useAppStore()
const admin = useAdminStore()

onMounted(async () => {
  const { data: { session: existing } } = await sb.auth.getSession()
  if (existing) {
    auth.session = existing
    await app.loadData(existing.user.id)
  }

  const { data: { subscription } } = sb.auth.onAuthStateChange(async (event, newSession) => {
    if (event === 'SIGNED_IN') {
      auth.session = newSession
      if (!app.loaded) await app.loadData(newSession!.user.id)
    } else if (event === 'TOKEN_REFRESHED') {
      auth.session = newSession
    } else if (event === 'SIGNED_OUT') {
      auth.session = null
      app.loaded = false
    }
  })
  onUnmounted(() => subscription.unsubscribe())
})

watch(() => auth.authMode, () => { auth.authError = '' })

async function doLogout() {
  app.stopRealtime()
  await sb.auth.signOut()
  auth.clearAuth()
  app.loaded = false
  app.tab = 0
}
</script>

<template>
  <div :style="{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'Syne, sans-serif' }">
    <!-- Flag melting-pot background — always visible -->
    <div class="flag-melting-pot">
      <div v-for="(f, i) in MELTING_POT_FLAGS" :key="i" class="flag-tile"
        :style="{ left: f.x, top: f.y, width: f.w + 'px', height: f.h + 'px', background: FLAG_COLORS[f.c] || '#475569', transform: 'rotate(' + f.r + 'deg)' }">
      </div>
    </div>
    <AuthScreen v-if="!auth.session" />
    <template v-else-if="app.loaded">
      <AppHeader @logout="doLogout" />
      <div style="max-width: 800px; margin: 0 auto; padding: 12px 14px 80px">
        <TabParticipants v-if="app.tab === 0" />
        <TabMatchs       v-else-if="app.tab === 1" />
        <TabBonus        v-else-if="app.tab === 2" />
        <TabTableau      v-else-if="app.tab === 3" />
        <TabClassement   v-else-if="app.tab === 4" />
      </div>
      <AdminModal  v-if="admin.showAdminModal" />
      <ImportModal v-if="admin.showImportModal" />
    </template>
    <div v-else :style="{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', color: C.muted, gap: '12px' }">
      <template v-if="auth.authError">
        <div style="color: #ef4444; font-size: 13px">{{ auth.authError }}</div>
      </template>
      <template v-else>Chargement…</template>
    </div>
  </div>
</template>

<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #0a0e1a; }
input[type=number]::-webkit-inner-spin-button,
input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
input[type=number] { -moz-appearance: textfield; }
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: #0a0e1a; }
::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }
input, select, textarea { box-sizing: border-box; }

.anton { font-family: 'Anton', 'Syne', sans-serif; letter-spacing: 0.5px; }

.card-rel { position: relative; overflow: hidden; }

.ribbon {
  display: inline-block; padding: 3px 10px 3px 8px;
  background: linear-gradient(180deg, #dc2626, #991b1b);
  color: #fff; font-family: 'Anton', sans-serif; font-size: 11px; letter-spacing: 1.8px;
  clip-path: polygon(0 0, 100% 0, 95% 50%, 100% 100%, 0 100%);
}

.wc-mark {
  display: inline-flex; align-items: center; gap: 6px;
  background: #f8fafc; color: #0a0e1a;
  padding: 5px 10px 4px; border-radius: 4px;
  font-family: 'Anton', sans-serif; font-size: 12px; letter-spacing: 1.8px;
  box-shadow: 2px 2px 0 #dc2626, 4px 4px 0 #1e3a8a;
}
.wc-mark .dot { width: 5px; height: 5px; border-radius: 50%; display: inline-block; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }

@keyframes confetti-fall {
  0%   { transform: translateY(-12px) rotate(0deg);   opacity: 0; }
  10%  { opacity: 1; }
  100% { transform: translateY(200px) rotate(720deg); opacity: 0; }
}
.confetti-bit {
  position: absolute; width: 6px; height: 10px; border-radius: 1px;
  animation: confetti-fall linear infinite; pointer-events: none;
}
.confetti-bit.fixed {
  position: fixed; z-index: 5;
}

@keyframes ball-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
.ball-spin { animation: ball-spin 8s linear infinite; transform-origin: center; transform-box: fill-box; }

.title-mfga {
  font-family: 'Anton', sans-serif;
  font-size: 36px; line-height: 0.95; letter-spacing: 1px; color: #f8fafc;
  text-shadow: 0 1px 0 #1e3a8a, 0 2px 0 #1e3a8a, 0 3px 0 #991b1b, 0 4px 6px rgba(0,0,0,0.6);
}
.title-red  { color: #fca5a5; }
.title-blue { color: #93c5fd; }

/* ── Flag melting-pot background ───────────────────────────────── */
.flag-melting-pot {
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background-color: #0a0e1a; overflow: hidden;
}
.flag-tile {
  position: absolute; border-radius: 3px;
  box-shadow: 0 4px 14px rgba(0,0,0,0.5);
  opacity: 0.55; filter: saturate(1.1) blur(8px);
}
.flag-tile::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.18) 100%);
  border-radius: inherit;
}
.flag-melting-pot::before {
  content: ""; position: absolute; inset: 0;
  background-image: repeating-linear-gradient(115deg,
    rgba(255,255,255,0.05)  0 28px, rgba(255,255,255,0) 28px 56px,
    rgba(255,255,255,0.035) 56px 84px, rgba(255,255,255,0) 84px 140px);
  pointer-events: none; z-index: 1;
}
.flag-melting-pot::after {
  content: ""; position: absolute; inset: 0;
  background: rgba(10,14,26,0.25);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  pointer-events: none; z-index: 2;
}

/* ── Match team-block ──────────────────────────────────────────── */
.team-block {
  position: relative; overflow: hidden;
  display: flex; align-items: center; gap: 8px;
  border: 1px solid #1e293b; border-radius: 8px;
  padding: 10px 12px; min-width: 0; min-height: 46px;
}
.team-block .flag-bg {
  position: absolute; inset: 0; opacity: 0.9; z-index: 0;
}
.team-block .flag-bg::after {
  content: ""; position: absolute; inset: 0;
  background-image:
    repeating-linear-gradient(90deg,  rgba(0,0,0,0.05) 0 2px, transparent 2px 4px),
    repeating-linear-gradient(180deg, rgba(255,255,255,0.04) 0 2px, transparent 2px 4px);
  box-shadow: inset 0 0 12px rgba(0,0,0,0.35);
}
.team-block.home .flag-bg::before {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent 40%, rgba(15,23,42,0.7) 100%);
}
.team-block.away .flag-bg::before {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(270deg, transparent 40%, rgba(15,23,42,0.7) 100%);
}
.team-block .name {
  position: relative; z-index: 1;
  font-family: 'Anton', sans-serif; font-size: 14px; letter-spacing: 0.5px;
  color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  text-shadow: 0 1px 2px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.6);
}
.team-block.home { justify-content: flex-end; }
.team-block.away { justify-content: flex-start; }

.vs-chunk {
  font-family: 'Anton', sans-serif; font-size: 22px; letter-spacing: 1px;
  background: linear-gradient(180deg, #dc2626 50%, #1e3a8a 50%);
  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
  padding: 0 6px;
}

.scoreboard-strip {
  background: repeating-linear-gradient(90deg, #dc2626 0 18px, #1e3a8a 18px 36px, #f8fafc 36px 54px);
  height: 4px; border-radius: 4px 4px 0 0; opacity: 0.85;
}

/* ── Score inputs ──────────────────────────────────────────────── */
.score-led {
  background: #0a0e1a !important; border: 2px solid #1e3a8a !important;
  color: #fbbf24 !important; font-family: 'Anton', monospace !important;
  font-size: 28px !important; width: 58px !important; height: 58px !important;
  text-align: center !important; border-radius: 6px !important;
  box-shadow: inset 0 2px 8px rgba(0,0,0,0.6), 0 0 0 1px rgba(251,191,36,0.15);
  outline: none !important; padding: 0 !important;
}
.score-led:focus { border-color: #fbbf24 !important; box-shadow: inset 0 2px 8px rgba(0,0,0,0.6), 0 0 0 2px rgba(251,191,36,0.4); }
.score-led::placeholder { color: #475569; }
.score-led-ro {
  background: #0a0e1a; border: 2px solid #1e293b;
  font-family: 'Anton', monospace; font-size: 28px;
  width: 58px; height: 58px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  box-shadow: inset 0 2px 8px rgba(0,0,0,0.6);
}

/* ── Group pills ───────────────────────────────────────────────── */
.group-pill {
  font-family: 'Anton', sans-serif; letter-spacing: 1.5px;
  padding: 8px 12px; border-radius: 999px; cursor: pointer;
  font-size: 13px; border: 2px solid transparent; transition: transform 0.1s;
}
.group-pill:hover { transform: translateY(-1px); }

/* ── Avatar disc ───────────────────────────────────────────────── */
.avatar-disc {
  width: 38px; height: 38px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Anton', sans-serif; font-size: 16px; color: #fff;
  border: 2px solid rgba(255,255,255,0.2);
  box-shadow: 0 2px 6px rgba(0,0,0,0.4), inset 0 -3px 0 rgba(0,0,0,0.2);
  flex-shrink: 0; position: relative;
}
.avatar-disc.star::after {
  content: "★"; position: absolute; bottom: -4px; right: -4px;
  width: 14px; height: 14px; background: #fbbf24; color: #0a0e1a;
  border-radius: 50%; font-size: 9px; line-height: 14px; text-align: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.4);
}

/* ── Rule chips ────────────────────────────────────────────────── */
.rule-chip {
  background: rgba(15,23,42,0.7); border: 1px solid #1e293b;
  border-radius: 10px; padding: 10px 12px;
  display: flex; align-items: center; gap: 10px;
  position: relative; overflow: hidden;
}
.rule-chip .num { font-family: 'Anton', sans-serif; font-size: 24px; line-height: 1; flex-shrink: 0; width: 36px; text-align: center; }
.rule-chip .lbl { font-size: 12px; color: #cbd5e1; font-weight: 600; }
.rule-chip .sub { font-size: 10px; color: #64748b; margin-top: 2px; }

/* ── Live status dot ───────────────────────────────────────────── */
@keyframes pulse-dot {
  0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.7); }
  70%      { box-shadow: 0 0 0 6px rgba(34,197,94,0); }
}
.live-dot {
  width: 8px; height: 8px; border-radius: 50%; background: #22c55e;
  display: inline-block; animation: pulse-dot 1.8s infinite;
}

/* ── Podium ────────────────────────────────────────────────────── */
.podium { display: grid; grid-template-columns: 1fr 1.1fr 1fr; gap: 8px; align-items: end; margin-bottom: 20px; }
.podium-step {
  background: linear-gradient(180deg, #1e293b, #0f172a); border: 1px solid #334155;
  border-radius: 10px 10px 0 0; padding: 14px 8px 12px; text-align: center; position: relative;
}
.podium-step.gold   { background: linear-gradient(180deg, #78350f, #451a03); border-color: #f59e0b; box-shadow: 0 -4px 20px rgba(245,158,11,0.25); }
.podium-step.silver { background: linear-gradient(180deg, #475569, #1e293b); border-color: #94a3b8; }
.podium-step.bronze { background: linear-gradient(180deg, #7c2d12, #431407); border-color: #cd7c2f; }
.podium-step .medal { font-size: 30px; margin-bottom: 4px; line-height: 1; }
.podium-step .p-name { font-family: 'Anton', sans-serif; font-size: 14px; letter-spacing: 0.5px; color: #fff; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.podium-step .pts  { font-family: 'Anton', sans-serif; font-size: 24px; line-height: 1; }
.podium-step .lbl  { font-size: 9px; letter-spacing: 1.5px; color: rgba(255,255,255,0.55); text-transform: uppercase; }
.podium-base {
  font-family: 'Anton', sans-serif; font-size: 18px; color: #fff;
  background: linear-gradient(180deg, #0f172a, #020617);
  padding: 6px 0; border-radius: 0 0 6px 6px;
  border: 1px solid #1e293b; border-top: none; text-align: center;
}
.p-name { font-size: 10px; font-weight: 700; color: #94a3b8; text-align: center; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70px; }
.p-pts  { font-family: 'Anton', sans-serif; font-size: 16px; }

/* ── Bonus ─────────────────────────────────────────────────────── */
.bonus-header { display: flex; align-items: center; gap: 12px; padding: 12px 14px; margin: 0 0 14px; border-radius: 10px 10px 0 0; }
.bonus-icon-box { width: 38px; height: 38px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; box-shadow: 0 2px 4px rgba(0,0,0,0.4); }

/* ── Tabs ──────────────────────────────────────────────────────── */
.tab-bar { display: flex; gap: 4px; margin-top: 4px; }

@media (max-width: 480px) {
  .title-mfga { font-size: 26px !important; }
  .header-quote { display: none !important; }
  .header-mascot img { width: 110px !important; height: auto !important; }
  .header-hero-row { gap: 8px !important; }
  .header-hosts { flex-wrap: wrap !important; gap: 6px !important; margin-top: -4px !important; }
  .topbar-right { gap: 6px !important; flex-wrap: wrap; justify-content: flex-end; }
  .wc-mark { font-size: 10px !important; letter-spacing: 1px !important; white-space: nowrap; }
  .tab-bar { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .tab-bar button { font-size: 11px !important; padding: 8px 10px !important; white-space: nowrap; }
  .header-tagline { display: none !important; }
}
</style>
