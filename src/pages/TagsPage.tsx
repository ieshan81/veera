import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '@/lib/supabaseClient'
import { slugify } from '@/lib/slug'
import { friendlyDbError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const schema = z.object({
  name: z.string().min(1, 'Name required'),
  slug: z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase, hyphens only'),
  sort_order: z.number().int(),
})

type Form = z.infer<typeof schema>

export function TagsPage() {
  const qc = useQueryClient()
  const [banner, setBanner] = useState<string | null>(null)

  const tagsQuery = useQuery({
    queryKey: ['plant-tags'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plant_tags').select('*').order('sort_order')
      if (error) throw error
      return data ?? []
    },
  })

  const { register, handleSubmit, reset, setValue, getValues, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', slug: '', sort_order: 0 as number },
  })

  const createTag = useMutation({
    mutationFn: async (values: Form) => {
      const { error } = await supabase.from('plant_tags').insert({
        name: values.name.trim(),
        slug: values.slug.trim(),
        sort_order: values.sort_order,
        is_active: true,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['plant-tags'] })
      reset({ name: '', slug: '', sort_order: getValues('sort_order') })
      setBanner('Tag created.')
    },
    onError: (e: Error) => setBanner(friendlyDbError(e as never)),
  })

  const updateTag = useMutation({
    mutationFn: async (payload: { id: string; name?: string; slug?: string; sort_order?: number; is_active?: boolean }) => {
      const { id, ...rest } = payload
      const { error } = await supabase.from('plant_tags').update(rest).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['plant-tags'] }),
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Tags</h1>
        <p className="text-sm text-slate-600">
          Tags group and filter plants. Deactivating a tag hides it from pickers but keeps plant data safe.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New tag</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-3"
            onSubmit={handleSubmit((v: Form) => createTag.mutate(v))}
          >
            <div>
              <Label>Name</Label>
              <Input
                {...register('name')}
                onBlur={() => {
                  const slug = getValues('slug')
                  const n = getValues('name')
                  if (!slug && n) setValue('slug', slugify(n), { shouldValidate: true })
                }}
              />
              {formState.errors.name ? <p className="mt-1 text-sm text-red-600">{formState.errors.name.message}</p> : null}
            </div>
            <div>
              <Label>Slug</Label>
              <Input {...register('slug')} />
              {formState.errors.slug ? <p className="mt-1 text-sm text-red-600">{formState.errors.slug.message}</p> : null}
            </div>
            <div>
              <Label>Sort order</Label>
              <Input type="number" {...register('sort_order')} />
            </div>
            <div className="md:col-span-3">
              {banner ? <p className="text-sm text-emerald-800">{banner}</p> : null}
              <Button type="submit" disabled={createTag.isPending}>
                Create tag
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All tags</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--color-veera-border)] bg-stone-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Slug</th>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-veera-border)]">
                {(tagsQuery.data ?? []).map((t) => (
                  <tr key={t.id} className="bg-white">
                    <td className="px-4 py-3">
                      <Input
                        className="h-8"
                        defaultValue={t.name}
                        onBlur={(e) => {
                          const v = e.target.value.trim()
                          if (v && v !== t.name) void updateTag.mutateAsync({ id: t.id, name: v })
                        }}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        className="h-8"
                        defaultValue={t.slug}
                        onBlur={(e) => {
                          const v = slugify(e.target.value)
                          if (v && v !== t.slug) void updateTag.mutateAsync({ id: t.id, slug: v })
                        }}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        className="h-8 w-20"
                        type="number"
                        defaultValue={t.sort_order}
                        onBlur={(e) => {
                          const v = Number(e.target.value)
                          if (!Number.isNaN(v) && v !== t.sort_order) void updateTag.mutateAsync({ id: t.id, sort_order: v })
                        }}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={t.is_active ? 'success' : 'warning'}>{t.is_active ? 'Active' : 'Inactive'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-8 text-xs"
                        onClick={() => void updateTag.mutateAsync({ id: t.id, is_active: !t.is_active })}
                      >
                        {t.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
