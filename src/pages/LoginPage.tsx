import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Link, Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '@/auth/useAuth'
import { useTheme } from '@/theme/useTheme'
import { hasSupabaseConfig } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})

type Form = z.infer<typeof schema>

export function LoginPage() {
  const { session, loading, signIn, isAdmin } = useAuth()
  const { resolvedTheme } = useTheme()
  const [formError, setFormError] = useState<string | null>(null)
  const [needsEmailConfirmHelp, setNeedsEmailConfirmHelp] = useState(false)
  const [resendFeedback, setResendFeedback] = useState<string | null>(null)
  const [resendBusy, setResendBusy] = useState(false)
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) })

  if (!loading && session && isAdmin) {
    return <Navigate to="/" replace />
  }

  const configOk = hasSupabaseConfig()
  const logoSrc = resolvedTheme === 'dark' ? '/3.png' : '/4.png'

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    setNeedsEmailConfirmHelp(false)
    setResendFeedback(null)
    try {
      const result = await signIn(values.email, values.password)
      if (result.error) {
        const code = result.errorCode ?? ''
        const msg = result.error.message ?? ''
        if (code === 'email_not_confirmed' || /email not confirmed|confirm your email/i.test(msg)) {
          setFormError(
            'This email is not confirmed yet. Open the link Supabase sent you, or use “Resend confirmation” below.',
          )
          setNeedsEmailConfirmHelp(true)
          return
        }
        setFormError(msg || 'Sign-in failed.')
        return
      }
      if (result.isAdmin === false) {
        setFormError(
          'You signed in, but this account has no admin role. A super admin can add your UUID under Team (profile must exist—see scripts/manual-admin-user.sql if you were created only in Auth).',
        )
        return
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Sign-in failed. Check your connection and try again.')
    }
  })

  const redirectBase =
    (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') ||
    (typeof window !== 'undefined' ? window.location.origin : '')

  async function resendConfirmation() {
    const email = getValues('email')?.trim()
    if (!email) {
      setResendFeedback('Enter your email above, then try again.')
      return
    }
    setResendBusy(true)
    setResendFeedback(null)
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${redirectBase}/login` },
    })
    setResendBusy(false)
    if (error) {
      setResendFeedback(error.message)
      return
    }
    setResendFeedback('Confirmation email sent. Check your inbox and spam folder.')
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-veera-bg px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3">
            <img src={logoSrc} alt="Veera" className="h-14 w-auto" />
            <div>
              <CardTitle>Sign in to VEERA Admin</CardTitle>
              <p className="mt-1 text-sm text-veera-muted">Use your admin account.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" {...register('email')} />
              {errors.email ? <p className="mt-1 text-sm text-red-600">{errors.email.message}</p> : null}
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
              {errors.password ? (
                <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
              ) : null}
            </div>
            {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
            {needsEmailConfirmHelp ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <Button
                  type="button"
                  variant="secondary"
                  className="mb-2 w-full"
                  disabled={resendBusy}
                  onClick={() => void resendConfirmation()}
                >
                  {resendBusy ? 'Sending…' : 'Resend confirmation email'}
                </Button>
                {resendFeedback ? (
                  <p className={resendFeedback.startsWith('Confirmation email sent') ? 'text-emerald-800' : 'text-amber-800'}>
                    {resendFeedback}
                  </p>
                ) : null}
              </div>
            ) : null}
            {!configOk ? (
              <p className="text-sm text-amber-800">
                This site is missing <code className="rounded bg-amber-100 px-1">VITE_SUPABASE_URL</code> or{' '}
                <code className="rounded bg-amber-100 px-1">VITE_SUPABASE_ANON_KEY</code>. In Netlify go to Site
                configuration → Environment variables, add both, then trigger a new deploy (values must be present at
                build time).
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={isSubmitting || !configOk}>
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
            <p className="text-center text-sm text-slate-500">
              Need an admin account?{' '}
              <Link to="/signup" className="font-medium text-veera-accent hover:underline">
                Set up with security questions
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
