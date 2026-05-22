<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import { C, CONFETTI_BITS } from '../constants/ui'
import { FLAG_COLORS, MELTING_POT_FLAGS } from '../constants/teams'

const auth = useAuthStore()
const sInput = { background: "#1e293b", border: "1px solid #1e293b", borderRadius: "8px", color: C.text, padding: "10px 14px", fontFamily: "'Syne', sans-serif", fontSize: "14px", outline: "none", width: "100%" }
const sLabel = { color: C.muted, fontSize: "11px", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "6px", display: "block" }

const isLogin = computed(() => auth.authMode === 'login')
</script>

<template>
  <div :style="{ minHeight: '100vh', color: C.text, fontFamily: 'Syne, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', position: 'relative' }">
    <div class="flag-melting-pot">
      <div v-for="(f, i) in MELTING_POT_FLAGS" :key="i" class="flag-tile"
        :style="{ left: f.x, top: f.y, width: f.w + 'px', height: f.h + 'px', background: FLAG_COLORS[f.c] || '#475569', transform: 'rotate(' + f.r + 'deg)' }">
      </div>
    </div>
    <div v-for="(b, i) in CONFETTI_BITS" :key="i" class="confetti-bit"
      :style="{ left: b.left, animationDelay: b.delay, animationDuration: b.dur, background: b.color }">
    </div>
    <div style="position: relative; z-index: 1; width: 100%; max-width: 360px">
      <div style="text-align: center; margin-bottom: 32px">
        <div class="title-mfga">MAKE <span class="title-red">FOOTBALL</span></div>
        <div class="title-mfga">GOAT <span class="title-blue">AGAIN</span> <span style="font-size:32px">🐐</span></div>
        <div style="color: #fca5a5; font-size: 11px; font-weight: 600; margin-top: 6px; letter-spacing: 0.5px">★ Pronostics non-officiels · 100 % bipartisan ★</div>
      </div>
      <div :style="{ background: C.card, border: '1px solid ' + C.border, borderRadius: '14px', padding: '24px 20px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }">
        <div style="display: flex; gap: 0; margin-bottom: 20px; border-radius: 8px; overflow: hidden; border: 1px solid #1e293b">
          <button @click="auth.authMode = 'login'"
            :style="{ flex: 1, padding: '10px', border: 'none', cursor: 'pointer', fontFamily: 'Anton, sans-serif', fontSize: '13px', letterSpacing: '1px', background: isLogin ? '#dc2626' : '#1e293b', color: isLogin ? '#fff' : C.muted }">
            SE CONNECTER
          </button>
          <button @click="auth.authMode = 'register'"
            :style="{ flex: 1, padding: '10px', border: 'none', cursor: 'pointer', fontFamily: 'Anton, sans-serif', fontSize: '13px', letterSpacing: '1px', background: !isLogin ? '#1e3a8a' : '#1e293b', color: !isLogin ? '#fff' : C.muted }">
            S'INSCRIRE
          </button>
        </div>
        <div style="margin-bottom: 14px">
          <label :style="sLabel">Nom d'utilisateur</label>
          <input :style="sInput" type="text" placeholder="ex: jeremy" :value="auth.authUsername"
            @input="auth.authUsername = ($event.target as HTMLInputElement).value"
            @keydown.enter="isLogin ? auth.doLogin() : auth.doRegister()" />
        </div>
        <div style="margin-bottom: 18px">
          <label :style="sLabel">Mot de passe</label>
          <input :style="sInput" type="password" placeholder="••••••••" :value="auth.authPassword"
            @input="auth.authPassword = ($event.target as HTMLInputElement).value"
            @keydown.enter="isLogin ? auth.doLogin() : auth.doRegister()" />
        </div>
        <div v-if="auth.authError" style="color: #ef4444; font-size: 12px; margin-bottom: 12px; padding: 8px 12px; background: rgba(239,68,68,0.1); border-radius: 6px; border: 1px solid rgba(239,68,68,0.3)">
          {{ auth.authError }}
        </div>
        <button @click="isLogin ? auth.doLogin() : auth.doRegister()"
          :disabled="auth.authLoading"
          :style="{ width: '100%', padding: '12px', border: 'none', borderRadius: '8px', cursor: auth.authLoading ? 'not-allowed' : 'pointer', fontFamily: 'Anton, sans-serif', fontSize: '15px', letterSpacing: '1.5px', color: '#fff', background: isLogin ? 'linear-gradient(135deg, #dc2626, #991b1b)' : 'linear-gradient(135deg, #1e3a8a, #1d4ed8)', opacity: auth.authLoading ? 0.7 : 1 }">
          {{ auth.authLoading ? '...' : (isLogin ? 'ENTRER' : 'CRÉER MON COMPTE') }}
        </button>
      </div>
    </div>
  </div>
</template>
