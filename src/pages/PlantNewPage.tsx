import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '@/lib/supabaseClient'
import { slugify } from '@/lib/slug'
import { friendlyDbError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePlantQrMutation } from '@/hooks/usePlantQr'

const schema = z.object({
  common_name: z.string().min(1, 'Required'),
  scientific_name: z.string().optional(),
  slug: z
    .string()
    .min(1, 'Required')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens only'),
  summary: z.string().optional(),
  light_level: z.string().optional(),
  water_level: z.string().optional(),
  internal_notes: z.string().optional(),
  status: z.enum(['active', 'inactive', 'archived']),
})

type Form = z.infer<typeof schema>

export function PlantNewPage() {
  const navigate = useNavigate()
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const qrMutation = usePlantQrMutation()

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      status: 'active',
      slug: '',
      common_name: '',
    },
  })

  const autoSlugIfEmpty = () => {
    const name = getValues('common_name')
    const slug = getValues('slug')
    if (name && !slug) setValue('slug', slugify(name), { shouldValidate: true })
  }

  const onSubmit = handleSubmit(async (values) => {
    setBanner(null)
    const { data, error } = await supabase
      .from('plants')
      .insert({
        common_name: values.common_name,
        scientific_name: values.scientific_name || null,
        slug: values.slug,
        summary: values.summary || null,
        light_level: values.light_level || null,
        water_level: values.water_level || null,
        internal_notes: values.internal_notes || null,
        status: values.status,
      })
      .select('id')
      .single()

    if (error) {
      setBanner({ type: 'err', text: friendlyDbError(error) })
      return
    }

    try {
      await qrMutation.mutateAsync({ plantId: data.id, mode: 'ensure_primary' })
    } catch (e) {
      setBanner({
        type: 'err',
        text:
          e instanceof Error
            ? `Plant saved, but QR failed: ${e.message}. You can retry from the plant page.`
            : 'Plant saved; QR generation failed — retry from the plant page.',
      })
      navigate(`/plants/${data.id}`)
      return
    }

    setBanner({ type: 'ok', text: 'Plant created and QR generated.' })
    navigate(`/plants/${data.id}`)
  })

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Button variant="ghost" asChild className="mb-2 -ml-2 h-8">
          <Link to="/plants">← Back to plants</Link>
        </Button>
        <h1 className="text-2xl font-semibold text-slate-900">New plant</h1>
        <p className="text-sm text-slate-600">Core fields first; tags and sections on the next screen.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="common_name">Common name</Label>
              <Input id="common_name" {...register('common_name')} onBlur={() => autoSlugIfEmpty()} />
              {errors.common_name ? <p className="mt-1 text-sm text-red-600">{errors.common_name.message}</p> : null}
            </div>
            <div>
              <Label htmlFor="scientific_name">Scientific name</Label>
              <Input id="scientific_name" {...register('scientific_name')} />
            </div>
            <div>
              <Label htmlFor="slug">URL slug</Label>
              <Input id="slug" {...register('slug')} />
              {errors.slug ? <p className="mt-1 text-sm text-red-600">{errors.slug.message}</p> : null}
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <select id="status" className="mt-1 w-full rounded-lg border border-[var(--color-veera-border)] px-3 py-2 text-sm" {...register('status')}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <Label htmlFor="summary">Short summary</Label>
              <Textarea id="summary" {...register('summary')} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="light_level">Light (hint)</Label>
                <Input id="light_level" {...register('light_level')} />
              </div>
              <div>
                <Label htmlFor="water_level">Water (hint)</Label>
                <Input id="water_level" {...register('water_level')} />
              </div>
            </div>
            <div>
              <Label htmlFor="internal_notes">Internal notes</Label>
              <Textarea id="internal_notes" {...register('internal_notes')} />
            </div>

            {banner?.type === 'err' ? <p className="text-sm text-red-600">{banner.text}</p> : null}
            {banner?.type === 'ok' ? <p className="text-sm text-emerald-800">{banner.text}</p> : null}

            <div className="flex gap-3">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving…' : 'Create plant'}
              </Button>
              <Button type="button" variant="secondary" asChild>
                <Link to="/plants">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
