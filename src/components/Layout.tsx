import { NavLink, Outlet } from 'react-router-dom'
import { Leaf, LayoutDashboard, Plug, Sprout, Tag, Upload, Users } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
    isActive
      ? 'bg-emerald-50 text-emerald-900'
      : 'text-slate-600 hover:bg-stone-100 hover:text-slate-900',
  )

export function Layout() {
  const { signOut, isSuperAdmin } = useAuth()

  return (
    <div className="flex min-h-svh">
      <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--color-veera-border)] bg-[var(--color-veera-surface)]">
        <div className="flex items-center gap-2 border-b border-[var(--color-veera-border)] px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-700 text-white">
            <Leaf className="h-5 w-5" aria-hidden />
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-slate-900">VEERA</div>
            <div className="text-xs text-slate-500">Admin</div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-3">
          <NavLink to="/" end className={navClass}>
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            Dashboard
          </NavLink>
          <NavLink to="/plants" className={navClass}>
            <Sprout className="h-4 w-4 shrink-0" />
            Plants
          </NavLink>
          <NavLink to="/tags" className={navClass}>
            <Tag className="h-4 w-4 shrink-0" />
            Tags
          </NavLink>
          <NavLink to="/import" className={navClass}>
            <Upload className="h-4 w-4 shrink-0" />
            Import
          </NavLink>
          <NavLink to="/integrations" className={navClass}>
            <Plug className="h-4 w-4 shrink-0" />
            Integrations
          </NavLink>
          {isSuperAdmin ? (
            <NavLink to="/team" className={navClass}>
              <Users className="h-4 w-4 shrink-0" />
              Team
            </NavLink>
          ) : null}
        </nav>
        <div className="border-t border-[var(--color-veera-border)] p-3">
          <Button type="button" variant="ghost" className="w-full justify-start" onClick={() => signOut()}>
            Sign out
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
