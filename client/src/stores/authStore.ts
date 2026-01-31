import { create } from 'zustand'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  error: string | null

  // Actions
  initialize: () => Promise<void>
  signUp: (email: string, password: string, username: string) => Promise<{ success: boolean; error?: string }>
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  signOut: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,
  error: null,

  initialize: async () => {
    try {
      // 현재 세션 가져오기
      const { data: { session } } = await supabase.auth.getSession()

      set({
        session,
        user: session?.user ?? null,
        loading: false,
      })

      // 인증 상태 변경 리스너
      supabase.auth.onAuthStateChange((_event, session) => {
        set({
          session,
          user: session?.user ?? null,
        })
      })
    } catch (error) {
      console.error('Auth initialization error:', error)
      set({ loading: false })
    }
  },

  signUp: async (email: string, password: string, username: string) => {
    set({ loading: true, error: null })

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
          },
        },
      })

      if (error) {
        set({ loading: false, error: error.message })
        return { success: false, error: error.message }
      }

      set({
        user: data.user,
        session: data.session,
        loading: false,
      })

      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : '회원가입 중 오류가 발생했습니다'
      set({ loading: false, error: message })
      return { success: false, error: message }
    }
  },

  signIn: async (email: string, password: string) => {
    set({ loading: true, error: null })

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        set({ loading: false, error: error.message })
        return { success: false, error: error.message }
      }

      set({
        user: data.user,
        session: data.session,
        loading: false,
      })

      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : '로그인 중 오류가 발생했습니다'
      set({ loading: false, error: message })
      return { success: false, error: message }
    }
  },

  signOut: async () => {
    set({ loading: true })

    try {
      await supabase.auth.signOut()
      set({ user: null, session: null, loading: false })
    } catch (error) {
      console.error('Sign out error:', error)
      set({ loading: false })
    }
  },

  clearError: () => set({ error: null }),
}))
