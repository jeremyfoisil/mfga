import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { sb } from '../supabase'

export const useAuthStore = defineStore('auth', () => {
  const session      = ref<Session | null>(null)
  const profile      = ref<{ id: string; participant_id: number | null } | null>(null)
  const authMode     = ref<'login' | 'register'>('login')
  const authUsername = ref('')
  const authPassword = ref('')
  const authError    = ref('')
  const authLoading  = ref(false)

  async function doRegister() {
    authLoading.value = true; authError.value = ''
    try {
      const username = authUsername.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
      if (username.length < 2) throw new Error("Le nom doit faire au moins 2 caractères (lettres, chiffres, _)")
      if (authPassword.value.length < 6) throw new Error("Le mot de passe doit faire au moins 6 caractères")
      const { data, error } = await sb.auth.signUp({ email: username + "@mfga.app", password: authPassword.value })
      if (error) {
        if (error.message.includes("already registered") || error.message.includes("already exists")) {
          authMode.value = 'login'
          throw new Error("Ce nom existe déjà — connecte-toi avec ton mot de passe.")
        }
        if (error.message.includes("rate limit")) throw new Error("Trop de tentatives, réessayez dans quelques minutes")
        throw error
      }
      if (data.user && !data.session) {
        authMode.value = 'login'
        throw new Error("Compte créé — connecte-toi avec ton mot de passe.")
      }
    } catch (e) {
      authError.value = (e as Error).message
    } finally {
      authLoading.value = false
    }
  }

  async function doLogin() {
    authLoading.value = true; authError.value = ''
    try {
      const username = authUsername.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
      const { error } = await sb.auth.signInWithPassword({ email: username + "@mfga.app", password: authPassword.value })
      if (error) throw new Error("Nom d'utilisateur ou mot de passe incorrect")
    } catch (e) {
      authError.value = (e as Error).message
    } finally {
      authLoading.value = false
    }
  }

  function clearAuth() {
    session.value = null; profile.value = null
    authUsername.value = ''; authPassword.value = ''
  }

  return { session, profile, authMode, authUsername, authPassword, authError, authLoading, doRegister, doLogin, clearAuth }
})
