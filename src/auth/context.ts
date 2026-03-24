import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { AppRole } from '@/lib/types/database'

export type AuthContextValue = {
  session: Session | null
  user: User | null
  roles: AppRole[]
  loading: boolean
  refreshRoles: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  isAdmin: boolean
  isSuperAdmin: boolean
}

export const AuthContext = createContext<AuthContextValue | null>(null)
