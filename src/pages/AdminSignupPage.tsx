import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { RefreshCw } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { useTheme } from '@/theme/useTheme'
import { requestAdminSignup } from '@/lib/adminSignupRequest'
import { supabase, hasSupabaseConfig } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type GateQuestion = { id: string; question_text: string }

const signupSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Use at least 8 characters'),
  answer1: z.string().min(1, 'Please answer the first question'),
  answer2: z.string().min(1, 'Please answer the second question'),
})

type SignupForm = z.infer<typeof signupSchema>

export function AdminSignupPage() {
  const { session, loading, isAdmin } = useAuth()
  const { resolvedTheme } = useTheme()
  const [questions, setQuestions] = useState<GateQuestion[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadingQuestions, setLoadingQuestions] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [successFlow, setSuccessFlow] = useState<'immediate' | 'confirm_email' | null>(null)
  const [emailResendWarning, setEmailResendWarning] = useState<string | null>(null)

  const configOk = hasSupabaseConfig()
  const logoSrc = resolvedTheme === 'dark' ? '/dark_background.png' : '/white_background.png'

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: '', password: '', answer1: '', answer2: '' },
  })

  const loadQuestions = useCallback(async () => {
    setLoadingQuestions(true)
    setLoadError(null)
    const { data, error } = await supabase.rpc('admin_gate_get_random_questions', { p_limit: 2 })
    if (error) {
      setLoadError('Could not load security questions. Check your connection or Supabase setup.')
      setQuestions([])
      setLoadingQuestions(false)
      return
    }
    const rows = (data ?? []) as GateQuestion[]
    if (rows.length < 2) {
      setLoadError(
        'Admin signup is not ready yet: add at least two active rows to admin_security_questions in Supabase (see schema.sql).',
      )
      setQuestions([])
    } else {
      setQuestions(rows)
      reset({
        ...getValues(),
        answer1: '',
        answer2: '',
      })
    }
    setLoadingQuestions(false)
  }, [getValues, reset])

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!configOk) {
        setLoadingQuestions(false)
        setLoadError(null)
        return
      }
      void loadQuestions()
    }, 0)
    return () => window.clearTimeout(t)
  }, [configOk, loadQuestions])

  if (!loading && session && isAdmin) {
    return <Navigate to="/" replace />
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    if (questions.length < 2) {
      setFormError('Questions are not loaded. Refresh the page.')
      return
    }
    try {
      const result = await requestAdminSignup({
        email: values.email.trim().toLowerCase(),
        password: values.password,
        question_ids: [questions[0].id, questions[1].id],
        answers: [values.answer1, values.answer2],
      })
      if (!result.ok) {
        setFormError(result.message)
        return
      }
      setEmailResendWarning(null)
      const needsConfirm = result.needsEmailConfirmation === true
      setSuccessFlow(needsConfirm ? 'confirm_email' : 'immediate')
      if (needsConfirm) {
        const email = values.email.trim().toLowerCase()
        const redirectBase =
          (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') || window.location.origin
        const { error: resendErr } = await supabase.auth.resend({
          type: 'signup',
          email,
          options: { emailRedirectTo: `${redirectBase}/login` },
        })
        setEmailResendWarning(
          resendErr
            ? `${resendErr.message} The account was still created—check Supabase Auth email/SMTP settings, or resend confirmation from the dashboard.`
            : null,
        )
      }
      setSuccess(true)
      reset()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Signup failed.')
    }
  })

  return (
    <div className="flex min-h-svh items-center justify-center bg-veera-bg px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3">
            <img src={logoSrc} alt="Veera" className="h-14 w-auto" />
            <div>
              <CardTitle>Admin account setup</CardTitle>
              <p className="mt-1 text-sm text-veera-muted">
                Answer the verification questions, then choose your email and password.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!configOk ? (
            <p className="text-sm text-amber-800">
              Missing Supabase configuration. Set <code className="rounded bg-amber-100 px-1">VITE_SUPABASE_URL</code>{' '}
              and <code className="rounded bg-amber-100 px-1">VITE_SUPABASE_ANON_KEY</code>, then redeploy.
            </p>
          ) : null}

          {success ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <p className="font-medium">Account created</p>
                {emailResendWarning ? (
                  <p className="mt-1 text-amber-900">
                    We could not send the confirmation email automatically. {emailResendWarning}
                  </p>
                ) : successFlow === 'confirm_email' ? (
                  <p className="mt-1">
                    Check your inbox for a confirmation link from Supabase. After you confirm, sign in with your email
                    and password.
                  </p>
                ) : (
                  <p className="mt-1">Your account is ready. Sign in with your email and password.</p>
                )}
                <Button asChild className="mt-4 w-full">
                  <Link to="/login">Go to sign in</Link>
                </Button>
              </div>
            </div>
          ) : null}

          {!success && loadingQuestions ? (
            <p className="text-sm text-slate-600">Loading questions…</p>
          ) : null}

          {!success && !loadingQuestions && loadError ? (
            <div className="space-y-3">
              <p className="text-sm text-red-700">{loadError}</p>
              <Button type="button" variant="secondary" className="w-full" onClick={() => void loadQuestions()}>
                <RefreshCw className="h-4 w-4" />
                Try again
              </Button>
            </div>
          ) : null}

          {!success && !loadingQuestions && !loadError && questions.length === 2 ? (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="rounded-lg border border-veera-border bg-stone-50/80 px-4 py-3 text-sm text-slate-700">
                <p className="font-medium text-slate-900">Verification</p>
                <p className="mt-2 text-slate-600">{questions[0].question_text}</p>
                <Input className="mt-2" autoComplete="off" {...register('answer1')} />
                {errors.answer1 ? <p className="mt-1 text-sm text-red-600">{errors.answer1.message}</p> : null}

                <p className="mt-4 text-slate-600">{questions[1].question_text}</p>
                <Input className="mt-2" autoComplete="off" {...register('answer2')} />
                {errors.answer2 ? <p className="mt-1 text-sm text-red-600">{errors.answer2.message}</p> : null}
              </div>

              <div>
                <Label htmlFor="su-email">Work email</Label>
                <Input id="su-email" type="email" autoComplete="email" {...register('email')} />
                {errors.email ? <p className="mt-1 text-sm text-red-600">{errors.email.message}</p> : null}
              </div>
              <div>
                <Label htmlFor="su-password">Password</Label>
                <Input id="su-password" type="password" autoComplete="new-password" {...register('password')} />
                {errors.password ? <p className="mt-1 text-sm text-red-600">{errors.password.message}</p> : null}
                <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
              </div>

              {formError ? <p className="text-sm text-red-600">{formError}</p> : null}

              <Button type="submit" className="w-full" disabled={isSubmitting || !configOk}>
                {isSubmitting ? 'Creating account…' : 'Create admin account'}
              </Button>
            </form>
          ) : null}

          <p className="text-center text-sm text-slate-500">
            Already have access?{' '}
            <Link to="/login" className="font-medium text-veera-accent hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
