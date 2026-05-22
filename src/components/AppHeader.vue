<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useAppStore } from '../stores/app'
import { useAdminStore } from '../stores/admin'
import { C, TABS } from '../constants/ui'

const emit = defineEmits<{ logout: [] }>()
const auth  = useAuthStore()
const app   = useAppStore()
const admin = useAdminStore()

const rtColor = computed(() => app.rtStatus === 'connected' ? C.green : C.yellow)
const username = computed(() => auth.session?.user?.email?.split('@')[0] ?? '')

function tabStyle(active: boolean) {
  return { padding: "10px 16px", background: active ? "#dc2626" : "transparent", color: active ? "#fff" : C.muted, border: "none", borderRadius: "8px 8px 0 0", cursor: "pointer", fontFamily: "'Anton', sans-serif", fontSize: "14px", letterSpacing: "1.2px", textTransform: "uppercase" as const, borderBottom: active ? "3px solid #1e3a8a" : "3px solid transparent" }
}
</script>

<template>
  <div :style="{ background: 'linear-gradient(180deg, #0f172a 0%, #0a0e1a 100%)', borderBottom: '1px solid ' + C.border, padding: '10px 12px 0', position: 'sticky', top: 0, zIndex: 100, maxWidth: '480px', margin: '0 auto' }">
    <!-- Top bar -->
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px">
      <div style="display: flex; align-items: center; gap: 8px">
        <span class="dot" style="background: #dc2626"></span>
        <span class="dot" style="background: #1e3a8a"></span>
        <span class="wc-mark" style="color: #f8fafc; letter-spacing: 2px">WORLD CUP&nbsp;2026</span>
      </div>
      <div class="topbar-right" style="display: flex; align-items: center; gap: 12px">
        <div style="display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase"
          :style="{ color: app.saveMsg ? '#22c55e' : (app.rtStatus === 'connected' ? '#22c55e' : '#eab308') }">
          <span :class="app.rtStatus === 'connected' ? 'live-dot' : ''"
            :style="{ width: '7px', height: '7px', borderRadius: '50%', background: rtColor, display: 'inline-block' }"></span>
          {{ app.saveMsg || (app.rtStatus === 'connected' ? 'EN DIRECT' : 'CONNEXION…') }}
        </div>
        <span style="color: #475569; font-size: 11px">👤 {{ username }}</span>
        <template v-if="admin.isAdmin">
          <span style="background: rgba(220,38,38,0.2); color: #fca5a5; border: 1px solid rgba(220,38,38,0.35); border-radius: 6px; padding: 2px 8px; font-size: 10px; font-weight: 700; letter-spacing: 1px">ADMIN</span>
          <button @click="admin.exitAdmin" style="background: #7f1d1d; color: #fca5a5; border: 1px solid rgba(220,38,38,0.35); border-radius: 6px; padding: 4px 10px; cursor: pointer; font-family: Syne, sans-serif; font-size: 11px">Exit</button>
        </template>
        <button v-else @click="admin.openAdminModal" style="background: #1e293b; color: #64748b; border: 1px solid #334155; border-radius: 6px; padding: 4px 10px; cursor: pointer; font-family: Syne, sans-serif; font-size: 11px">Admin</button>
        <button @click="emit('logout')" title="Se déconnecter" style="background: #1e293b; color: #94a3b8; border: 1px solid #334155; border-radius: 6px; padding: 4px 7px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Mascot + title -->
    <div class="header-hero-row" style="display: flex; align-items: flex-end; gap: 14px; margin-bottom: 12px">
      <div style="flex: 1; min-width: 0; align-self: center">
        <div class="title-mfga">MAKE <span class="title-red">FOOTBALL</span></div>
        <div class="title-mfga" style="margin-top: 2px">GOAT <span class="title-blue">AGAIN</span> <span style="font-size: 32px">🐐</span></div>
        <div class="header-tagline" style="color: #fca5a5; font-size: 11px; font-weight: 600; margin-top: 4px; letter-spacing: 0.5px">★ Pronostics non-officiels · 100 % bipartisan ★</div>
      </div>
      <div class="header-mascot" style="flex-shrink: 0; position: relative; align-self: flex-end">
        <img src="/assets/mascot.png" alt="MFGA Goat" width="180" height="153"
          style="display: block; filter: drop-shadow(0 8px 16px rgba(0,0,0,0.7))" />
      </div>
      <div class="header-quote" style="flex-shrink: 0; max-width: 155px; align-self: center; border-left: 2px solid rgba(220,38,38,0.5); padding-left: 10px">
        <div style="font-size: 9.5px; color: #94a3b8; font-style: italic; line-height: 1.5; letter-spacing: 0.2px">
          « La compét' d'Infantino, bénie par Trump, gagné par les chèvres »
        </div>
      </div>
    </div>

    <!-- Host countries -->
    <div class="header-hosts" style="display: flex; align-items: center; gap: 10px; margin-top: -22px; margin-bottom: 12px; font-size: 11px; color: #cbd5e1; font-weight: 600">
      <span style="color: #64748b; letter-spacing: 1px; text-transform: uppercase; font-size: 10px">Pays hôtes</span>
      <span style="display: inline-flex; align-items: center; gap: 4px; background: rgba(220,38,38,0.18); border: 1px solid rgba(220,38,38,0.4); padding: 2px 8px; border-radius: 4px">🇺🇸 USA</span>
      <span style="display: inline-flex; align-items: center; gap: 4px; background: rgba(220,38,38,0.18); border: 1px solid rgba(220,38,38,0.4); padding: 2px 8px; border-radius: 4px">🇨🇦 Canada</span>
      <span style="display: inline-flex; align-items: center; gap: 4px; background: rgba(220,38,38,0.18); border: 1px solid rgba(220,38,38,0.4); padding: 2px 8px; border-radius: 4px">🇲🇽 Mexico</span>
    </div>

    <!-- Tabs -->
    <div class="tab-bar">
      <button v-for="(t, i) in TABS" :key="i" :style="tabStyle(app.tab === i)" @click="app.tab = i">{{ t }}</button>
    </div>
  </div>
</template>
