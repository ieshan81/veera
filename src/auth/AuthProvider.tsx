import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { AuthContext, type AuthContextValue } from '@/auth/context'
import { supabase } from '@/lib/supabaseClient'
import type { AppRole } from '@/lib/types/database'

async function fetchRoles(userId: string): Promise<AppRole[]> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
  if (error || !data) return []
  return (data as { role: AppRole }[]).map((r) => r.role)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [roles, setRoles] = useState<AppRole[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const applySession = async (s: Session | null) => {
      if (cancelled) return
      setSession(s)
      setUser(s?.user ?? null)
      if (s?.user?.id) {
        setRoles(await fetchRoles(s.user.id))
      } else {
        setRoles([])
      }
    }

    void supabase.auth
      .getSession()
      .then(({ data: { session: s } }) => {
        if (cancelled) return
        void applySession(s).finally(() => {
          if (!cancelled) setLoading(false)
        })
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      void applySession(s)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const refreshRoles = useCallback(async () => {
    if (!user?.id) {
      setRoles([])
      return
    }
    setRoles(await fetchRoles(user.id))
  }, [user])

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      return { error: error as Error }
    }
    if (data.session && data.user) {
      setSession(data.session)
      setUser(data.user)
      const r = await fetchRoles(data.user.id)
      setRoles(r)
      const admin = r.some((role) => role === 'admin' || role === 'super_admin')
      return { error: null, isAdmin: admin }
    }
    return { error: null, isAdmin: false }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setRoles([])
  }, [])

  const isAdmin = roles.some((r) => r === 'admin' || r === 'super_admin')
  const isSuperAdmin = roles.includes('super_admin')

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      roles,
      loading,
      refreshRoles,
      signIn,
      signOut,
      isAdmin,
      isSuperAdmin,
    }),
    [session, user, roles, loading, refreshRoles, signIn, signOut, isAdmin, isSuperAdmin],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
