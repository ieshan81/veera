import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Leaf } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
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
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) })

  if (!loading && session && isAdmin) {
    return <Navigate to="/" replace />
  }

  const configOk = hasSupabaseConfig()

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      const result = await signIn(values.email, values.password)
      if (result.error) {
        setFormError(result.error.message)
        return
      }
      if (result.isAdmin === false) {
        setFormError(
          'You signed in successfully, but this account does not have admin access. A super admin must add your user ID under Team, or add a row in Supabase for `user_roles` (see README bootstrap step).',
        )
        return
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Sign-in failed. Check your connection and try again.')
    }
  })

  return (
    <div className="flex min-h-svh items-center justify-center bg-[var(--color-veera-bg)] px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-700 text-white">
              <Leaf className="h-6 w-6" />
            </div>
            <div>
              <CardTitle>Sign in to VEERA Admin</CardTitle>
              <p className="mt-1 text-sm text-slate-500">Use your admin account.</p>
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
              <Link to="/signup" className="font-medium text-emerald-800 hover:underline">
                Set up with security questions
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
