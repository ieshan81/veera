import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ThemeContext, type ThemeMode, type ThemeContextValue } from '@/theme/context'

const STORAGE_KEY = 'veera-theme'

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function sanitizeTheme(value: string | null): ThemeMode {
  if (value === 'light' || value === 'dark' || value === 'system') return value
  return 'system'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('system')
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(getSystemTheme)

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next)
    if (typeof window === 'undefined') return
    if (next === 'system') {
      window.localStorage.removeItem(STORAGE_KEY)
    } else {
      window.localStorage.setItem(STORAGE_KEY, next)
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [setTheme, theme])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = sanitizeTheme(window.localStorage.getItem(STORAGE_KEY))
    setThemeState(saved)
  }, [])

  useEffect(() => {
    const nextResolved = theme === 'system' ? getSystemTheme() : theme
    setResolvedTheme(nextResolved)

    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = nextResolved
      document.documentElement.style.colorScheme = nextResolved
      const iconHref = nextResolved === 'dark' ? '/dark_background.png' : '/white_background.png'
      const iconLink = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
      if (iconLink) {
        iconLink.href = iconHref
      } else {
        const link = document.createElement('link')
        link.rel = 'icon'
        link.type = 'image/png'
        link.href = iconHref
        document.head.appendChild(link)
      }
    }
  }, [theme])

  useEffect(() => {
    if (theme !== 'system' || typeof window === 'undefined') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setResolvedTheme(getSystemTheme())
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [theme])

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      toggleTheme,
    }),
    [resolvedTheme, setTheme, theme, toggleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
