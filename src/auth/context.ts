import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { AppRole } from '@/lib/types/database'

export type AuthContextValue = {
  session: Session | null
  user: User | null
  roles: AppRole[]
  loading: boolean
  refreshRoles: () => Promise<void>
  /** On success, `isAdmin` tells you if user_roles allows access (avoids race with async auth listener). */
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error: Error | null; isAdmin?: boolean }>
  signOut: () => Promise<void>
  isAdmin: boolean
  isSuperAdmin: boolean
}

export const AuthContext = createContext<AuthContextValue | null>(null)
