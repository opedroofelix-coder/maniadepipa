import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/database'

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  /** true quando há sessão válida mas o perfil não pôde ser carregado */
  profileError: boolean
  retryProfile: () => void
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileError, setProfileError] = useState(false)
  const [loading, setLoading] = useState(true)
  const userIdRef = useRef<string | null>(null)

  const loadProfile = useCallback(async (userId: string) => {
    userIdRef.current = userId
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    // distinguir "falhou ao ler" de "não existe": só o primeiro caso vira erro
    // recuperável; sem essa diferença o app devolvia ao login em loop.
    setProfileError(Boolean(error))
    setProfile(error ? null : (data as Profile | null))
    setLoading(false)
  }, [])

  const retryProfile = useCallback(() => {
    if (!userIdRef.current) return
    setLoading(true)
    setProfileError(false)
    loadProfile(userIdRef.current)
  }, [loadProfile])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) loadProfile(data.session.user.id)
      else setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession) {
        loadProfile(newSession.user.id)
      } else {
        userIdRef.current = null
        setProfile(null)
        setProfileError(false)
        setLoading(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [loadProfile])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? error.message : null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, profile, profileError, retryProfile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}
