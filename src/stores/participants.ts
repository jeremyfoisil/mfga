import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Participant } from '../types'

export const useParticipantsStore = defineStore('participants', () => {
  const participants = ref<Participant[]>([])
  return { participants }
})
