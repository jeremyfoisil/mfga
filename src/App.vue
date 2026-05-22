<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { sb } from './supabase'
import { useAuthStore } from './stores/auth'
import { useAppStore } from './stores/app'
import { useAdminStore } from './stores/admin'
import { C } from './constants/ui'
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
    <AuthScreen v-if="!auth.session" />
    <template v-else-if="app.loaded">
      <AppHeader @logout="doLogout" />
      <div style="max-width: 480px; margin: 0 auto; padding: 0 12px 80px">
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
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #0a0e1a; }
input, select, textarea { box-sizing: border-box; }

@keyframes confetti-fall {
  0%   { transform: translateY(-10px) rotate(0deg);   opacity: 1; }
  100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
}
.confetti-bit { position: fixed; width: 8px; height: 8px; border-radius: 2px; animation: confetti-fall linear infinite; pointer-events: none; z-index: 9999; }
@keyframes ball-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
.ball-spin { animation: ball-spin 3s linear infinite; }
@keyframes live-pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
.live-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; display: inline-block; animation: live-pulse 1.4s ease-in-out infinite; }
.flag-melting-pot { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.flag-tile { position: absolute; opacity: 0.13; border-radius: 4px; }
.card-rel { position: relative; overflow: hidden; }
.anton { font-family: 'Anton', sans-serif; }
.ribbon { font-family: 'Anton', sans-serif; font-size: 11px; color: #fff; padding: 3px 10px; border-radius: 4px; letter-spacing: 1.5px; }
.wc-mark { font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.title-mfga { font-family: 'Anton', sans-serif; font-size: 36px; line-height: 0.95; letter-spacing: 1px; color: #f8fafc; text-shadow: 0 1px 0 #1e3a8a, 0 2px 0 #1e3a8a, 0 3px 0 #991b1b, 0 4px 6px rgba(0,0,0,0.6); }
.title-red  { color: #fca5a5; }
.title-blue { color: #93c5fd; }
.team-block { position: relative; flex: 1; display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 8px; overflow: hidden; min-width: 0; }
.team-block .flag-bg { position: absolute; inset: 0; opacity: 0.22; }
.team-block .name { position: relative; z-index: 1; font-weight: 700; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
.vs-chunk { font-family: 'Anton', sans-serif; font-size: 11px; color: #475569; letter-spacing: 1px; padding: 0 4px; }
.podium-step { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; border-radius: 8px 8px 0 0; padding: 10px 8px 6px; }
.podium-step.gold   { background: linear-gradient(180deg, rgba(245,158,11,0.25), rgba(245,158,11,0.08)); border: 1px solid rgba(245,158,11,0.4); }
.podium-step.silver { background: linear-gradient(180deg, rgba(148,163,184,0.2), rgba(148,163,184,0.06)); border: 1px solid rgba(148,163,184,0.3); }
.podium-step.bronze { background: linear-gradient(180deg, rgba(205,124,47,0.2), rgba(205,124,47,0.06)); border: 1px solid rgba(205,124,47,0.3); }
.avatar-disc { border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: 'Anton', sans-serif; color: #fff; }
.p-name { font-size: 10px; font-weight: 700; color: #94a3b8; text-align: center; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70px; }
.p-pts  { font-family: 'Anton', sans-serif; font-size: 16px; }
.bonus-header { display: flex; align-items: center; gap: 12px; padding: 12px 14px; margin: 0 0 14px; border-radius: 10px 10px 0 0; }
.bonus-icon-box { width: 38px; height: 38px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; box-shadow: 0 2px 4px rgba(0,0,0,0.4); }
.podium { display: flex; align-items: flex-end; justify-content: center; gap: 8px; padding: 20px 10px 0; }
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
