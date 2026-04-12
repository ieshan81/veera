import { NavLink, Outlet } from 'react-router-dom'
import { Laptop, LayoutDashboard, Moon, Plug, Sprout, Sun, Tag, Upload, Users } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/theme/useTheme'
import { cn } from '@/lib/utils'

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
    isActive
      ? 'bg-[var(--color-veera-accent-soft)] text-[var(--color-veera-fg)]'
      : 'text-[var(--color-veera-muted)] hover:bg-[var(--color-veera-accent-soft)] hover:text-[var(--color-veera-fg)]',
  )

export function Layout() {
  const { signOut, isSuperAdmin } = useAuth()
  const { theme, resolvedTheme, toggleTheme, setTheme } = useTheme()

  const logoSrc = resolvedTheme === 'dark' ? '/3.png' : '/4.png'

  return (
    <div className="flex min-h-svh">
      <aside className="flex w-56 shrink-0 flex-col border-r border-veera-border bg-veera-surface">
        <div className="border-b border-veera-border px-4 py-4">
          <img src={logoSrc} alt="Veera" className="h-12 w-auto" />
          <div className="mt-1 text-xs font-medium uppercase tracking-wide text-veera-muted">Admin</div>
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
        <div className="border-t border-veera-border p-3">
          <div className="mb-2 flex items-center gap-1">
            <Button type="button" variant="secondary" className="h-8 flex-1 justify-center px-2" onClick={() => setTheme('light')}>
              <Sun className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="secondary" className="h-8 flex-1 justify-center px-2" onClick={() => setTheme('dark')}>
              <Moon className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="secondary" className="h-8 flex-1 justify-center px-2" onClick={() => setTheme('system')}>
              <Laptop className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button type="button" variant="ghost" className="mb-2 w-full justify-start" onClick={toggleTheme}>
            Toggle theme ({theme})
          </Button>
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
