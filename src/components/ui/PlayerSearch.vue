<script setup lang="ts">
import { ref, watch } from 'vue'
import { sb } from '../../supabase'
import { sInput, C } from '../../constants/ui'

const props = defineProps<{ value: string; disabled?: boolean; placeholder?: string }>()
const emit = defineEmits<{
  (e: 'update', val: string): void
  (e: 'select', player: PlayerRow): void
}>()

interface PlayerRow { name: string; team: string; api_id: number }

const query   = ref(props.value)
const results = ref<PlayerRow[]>([])
const open    = ref(false)
const loading = ref(false)
let timer: ReturnType<typeof setTimeout>

watch(() => props.value, v => { if (v !== query.value) query.value = v })

function onInput(e: Event) {
  const val = (e.target as HTMLInputElement).value
  query.value = val
  emit('update', val)
  clearTimeout(timer)
  if (val.length < 2) { results.value = []; open.value = false; return }
  loading.value = true
  timer = setTimeout(search, 250)
}

async function search() {
  const { data } = await sb.from('players')
    .select('name, team, api_id')
    .ilike('name', `%${query.value}%`)
    .order('name')
    .limit(8)
  results.value = (data ?? []) as PlayerRow[]
  open.value = results.value.length > 0
  loading.value = false
}

function select(p: PlayerRow) {
  query.value = p.name
  emit('update', p.name)
  emit('select', p)
  open.value = false
  results.value = []
}

function onBlur() {
  setTimeout(() => { open.value = false }, 200)
}
</script>

<template>
  <div style="position: relative">
    <div style="position: relative; display: flex; align-items: center">
      <input
        type="text"
        :value="query"
        :disabled="disabled"
        :placeholder="placeholder ?? 'Rechercher un joueur…'"
        autocomplete="off"
        :style="{ ...sInput, paddingRight: '28px', opacity: disabled ? 0.5 : 1 }"
        @input="onInput"
        @blur="onBlur"
        @focus="query.length >= 2 && (open = true)"
      />
      <span v-if="loading" style="position: absolute; right: 8px; font-size: 11px; color: #64748b">⏳</span>
      <span v-else-if="query" style="position: absolute; right: 8px; font-size: 11px; color: #475569; cursor: pointer"
        @mousedown.prevent="() => { query = ''; emit('update', ''); results = []; open = false }">✕</span>
    </div>

    <!-- Dropdown -->
    <div v-if="open && results.length"
      style="position: absolute; top: 100%; left: 0; right: 0; z-index: 200; background: #1e293b; border: 1px solid #334155; border-radius: 8px; margin-top: 4px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.5)">
      <div v-for="p in results" :key="p.name + p.team"
        style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; cursor: pointer; transition: background 0.1s"
        @mousedown.prevent="select(p)"
        @mouseover="($event.currentTarget as HTMLElement).style.background = '#334155'"
        @mouseleave="($event.currentTarget as HTMLElement).style.background = 'transparent'">
        <span style="font-size: 13px; color: #f8fafc; font-weight: 600">{{ p.name }}</span>
        <span style="font-size: 10px; color: #64748b; font-family: Anton, sans-serif; letter-spacing: 0.5px">{{ p.team }}</span>
      </div>
    </div>
  </div>
</template>
