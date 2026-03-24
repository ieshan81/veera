import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '@/lib/supabaseClient'
import { friendlyDbError } from '@/lib/errors'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { AppRole } from '@/lib/types/database'

const addSchema = z.object({
  user_id: z.string().uuid('Must be a valid user UUID'),
  role: z.enum(['admin', 'super_admin']),
})

type AddForm = z.infer<typeof addSchema>

export function TeamPage() {
  const { isSuperAdmin } = useAuth()
  const qc = useQueryClient()
  const [msg, setMsg] = useState<string | null>(null)

  const teamQuery = useQuery({
    queryKey: ['team'],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data: roles, error: re } = await supabase.from('user_roles').select('*').order('created_at')
      if (re) throw re
      const { data: profiles, error: pe } = await supabase.from('profiles').select('*')
      if (pe) throw pe
      const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))
      return (roles ?? []).map((r: { id: string; user_id: string; role: AppRole; created_at: string }) => ({
        ...r,
        profile: profileById.get(r.user_id),
      }))
    },
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddForm>({
    resolver: zodResolver(addSchema),
    defaultValues: { role: 'admin' },
  })

  const addRole = useMutation({
    mutationFn: async (values: AddForm) => {
      const { error } = await supabase.from('user_roles').insert({
        user_id: values.user_id,
        role: values.role as AppRole,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setMsg('Role added.')
      reset()
      void qc.invalidateQueries({ queryKey: ['team'] })
    },
    onError: (e: Error) => setMsg(friendlyDbError(e as never)),
  })

  const removeRole = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_roles').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['team'] }),
  })

  if (!isSuperAdmin) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Team</h1>
        <p className="text-sm text-slate-600">
          Grant admin access by user UUID from Supabase → Authentication → Users. A profile row must exist (apply full
          `schema.sql` so the auth trigger creates profiles for new users, or run `scripts/manual-admin-user.sql`).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add role</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-3"
            onSubmit={handleSubmit((v) => addRole.mutate(v))}
          >
            <div className="md:col-span-2">
              <Label htmlFor="user_id">User UUID</Label>
              <Input id="user_id" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" {...register('user_id')} />
              {errors.user_id ? <p className="mt-1 text-sm text-red-600">{errors.user_id.message}</p> : null}
            </div>
            <div>
              <Label htmlFor="role">Role</Label>
              <select id="role" className="mt-1 w-full rounded-lg border border-[var(--color-veera-border)] px-3 py-2 text-sm" {...register('role')}>
                <option value="admin">admin</option>
                <option value="super_admin">super_admin</option>
              </select>
            </div>
            <div className="md:col-span-3">
              {msg ? <p className="text-sm text-slate-700">{msg}</p> : null}
              <Button type="submit" disabled={isSubmitting || addRole.isPending}>
                Add role
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current roles</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--color-veera-border)] bg-stone-50 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">User id</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3 text-right">Remove</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-veera-border)]">
              {(teamQuery.data ?? []).map((row) => (
                <tr key={row.id} className="bg-white">
                  <td className="px-4 py-3">{row.profile?.display_name ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.user_id}</td>
                  <td className="px-4 py-3">
                    <Badge variant={row.role === 'super_admin' ? 'success' : 'neutral'}>{row.role}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 text-red-700"
                      onClick={() => void removeRole.mutateAsync(row.id)}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
