<script setup lang="ts">
import { useAdminStore } from '../../stores/admin'
import { C, sInput, sLabel } from '../../constants/ui'

const admin = useAdminStore()
</script>

<template>
  <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.78); z-index: 200; display: flex; align-items: center; justify-content: center"
    @click.self="admin.closeAdminModal">
    <div style="background: #111827; border: 1px solid #1e293b; border-radius: 14px; padding: 28px 24px; width: 300px; max-width: 90vw">
      <div class="anton" style="font-size: 18px; color: #fbbf24; letter-spacing: 1.5px; margin-bottom: 4px; text-align: center">⚙ MODE ADMIN</div>
      <div style="font-size: 11px; color: #64748b; text-align: center; margin-bottom: 18px">Accès en écriture sur toutes les données</div>
      <div :style="sLabel">Mot de passe</div>
      <input :style="{ ...sInput, marginBottom: '12px' }" type="password" placeholder="••••••••"
        :value="admin.adminPassInput"
        @input="admin.adminPassInput = ($event.target as HTMLInputElement).value"
        @keydown.enter="admin.submitAdminPass" />
      <div v-if="admin.adminPassError" style="color: #ef4444; font-size: 12px; margin-bottom: 10px">{{ admin.adminPassError }}</div>
      <div style="display: flex; gap: 8px; margin-top: 4px">
        <button @click="admin.closeAdminModal" style="flex: 1; background: #1e293b; color: #94a3b8; border: 1px solid #334155; border-radius: 8px; padding: 9px; cursor: pointer; font-family: Syne, sans-serif; font-size: 13px; font-weight: 600">Annuler</button>
        <button @click="admin.submitAdminPass" style="flex: 1; background: #dc2626; color: #fff; border: none; border-radius: 8px; padding: 9px; cursor: pointer; font-family: Anton, sans-serif; font-size: 13px; letter-spacing: 1px">ENTRER</button>
      </div>
    </div>
  </div>
</template>
