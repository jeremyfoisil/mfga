<script setup lang="ts">
import { useAdminStore } from '../../stores/admin'
import { C, sInput, sLabel } from '../../constants/ui'

const admin = useAdminStore()
</script>

<template>
  <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.78); z-index: 200; display: flex; align-items: center; justify-content: center"
    @click.self="admin.showImportModal = false">
    <div style="background: #111827; border: 1px solid #1e293b; border-radius: 14px; padding: 24px 20px; width: 420px; max-width: 95vw">
      <div class="anton" style="font-size: 16px; color: #fbbf24; letter-spacing: 1.5px; margin-bottom: 12px">📥 IMPORT JSON</div>
      <div :style="sLabel">Coller le JSON football-data.org</div>
      <textarea :style="{ ...sInput, height: '160px', resize: 'vertical', fontFamily: 'monospace', fontSize: '11px', marginBottom: '12px' }"
        :value="admin.importJsonText"
        @input="admin.importJsonText = ($event.target as HTMLTextAreaElement).value"
        placeholder='{ "matches": [...] }'>
      </textarea>
      <div v-if="admin.importStatus" :style="{ color: admin.importStatus.startsWith('✓') ? '#22c55e' : '#ef4444', fontSize: '12px', marginBottom: '10px' }">
        {{ admin.importStatus }}
      </div>
      <div style="display: flex; gap: 8px">
        <button @click="admin.showImportModal = false" style="flex: 1; background: #1e293b; color: #94a3b8; border: 1px solid #334155; border-radius: 8px; padding: 9px; cursor: pointer; font-family: Syne, sans-serif; font-size: 13px">Annuler</button>
        <button @click="admin.importJson" :disabled="admin.importLoading" style="flex: 1; background: #1e3a8a; color: #fff; border: none; border-radius: 8px; padding: 9px; cursor: pointer; font-family: Anton, sans-serif; font-size: 13px; letter-spacing: 1px">
          {{ admin.importLoading ? '...' : 'IMPORTER' }}
        </button>
      </div>
    </div>
  </div>
</template>
