import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowDown, ArrowUp, Download, ImagePlus, QrCode, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { friendlyDbError } from '@/lib/errors'
import { sectionKeyFromLabel, slugify } from '@/lib/slug'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { usePlantQrMutation } from '@/hooks/usePlantQr'

const coreSchema = z.object({
  common_name: z.string().min(1),
  scientific_name: z.string().optional(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  summary: z.string().optional(),
  light_level: z.string().optional(),
  water_level: z.string().optional(),
  internal_notes: z.string().optional(),
  status: z.enum(['active', 'inactive', 'archived']),
})

type CoreForm = z.infer<typeof coreSchema>

export function PlantDetailPage() {
  const { id } = useParams<{ id: string }>()
  const plantId = id ?? ''
  const qc = useQueryClient()
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const plantQuery = useQuery({
    queryKey: ['plant', plantId],
    enabled: !!plantId,
    queryFn: async () => {
      const { data, error } = await supabase.from('plants').select('*').eq('id', plantId).single()
      if (error) throw error
      return data
    },
  })

  const tagsQuery = useQuery({
    queryKey: ['plant-tags'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plant_tags').select('*').order('sort_order')
      if (error) throw error
      return data ?? []
    },
  })

  const assignQuery = useQuery({
    queryKey: ['plant-assignments', plantId],
    enabled: !!plantId,
    queryFn: async () => {
      const { data, error } = await supabase.from('plant_tag_assignments').select('tag_id').eq('plant_id', plantId)
      if (error) throw error
      return new Set((data ?? []).map((r) => r.tag_id))
    },
  })

  const sectionsQuery = useQuery({
    queryKey: ['plant-sections', plantId],
    enabled: !!plantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plant_content_sections')
        .select('*')
        .eq('plant_id', plantId)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const photosQuery = useQuery({
    queryKey: ['plant-photos', plantId],
    enabled: !!plantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plant_catalog_photos')
        .select('*')
        .eq('plant_id', plantId)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const qrQuery = useQuery({
    queryKey: ['plant-qrs', plantId],
    enabled: !!plantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plant_qr_codes')
        .select('*')
        .eq('plant_id', plantId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const primaryQr = qrQuery.data?.find((q) => q.is_primary && q.is_active)

  const signedQrUrl = useQuery({
    queryKey: ['plant-qr-url', primaryQr?.qr_image_path],
    enabled: !!primaryQr?.qr_image_path && primaryQr.status === 'ready',
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from('plant-qr')
        .createSignedUrl(primaryQr!.qr_image_path!, 3600)
      if (error) throw error
      return data.signedUrl
    },
  })

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CoreForm>({
    resolver: zodResolver(coreSchema),
    values: plantQuery.data
      ? {
          common_name: plantQuery.data.common_name,
          scientific_name: plantQuery.data.scientific_name ?? '',
          slug: plantQuery.data.slug,
          summary: plantQuery.data.summary ?? '',
          light_level: plantQuery.data.light_level ?? '',
          water_level: plantQuery.data.water_level ?? '',
          internal_notes: plantQuery.data.internal_notes ?? '',
          status: plantQuery.data.status,
        }
      : undefined,
  })

  const saveCore = handleSubmit(async (values) => {
    setMsg(null)
    const { error } = await supabase
      .from('plants')
      .update({
        common_name: values.common_name,
        scientific_name: values.scientific_name || null,
        slug: values.slug,
        summary: values.summary || null,
        light_level: values.light_level || null,
        water_level: values.water_level || null,
        internal_notes: values.internal_notes || null,
        status: values.status,
      })
      .eq('id', plantId)
    if (error) {
      setMsg({ type: 'err', text: friendlyDbError(error) })
      return
    }
    setMsg({ type: 'ok', text: 'Plant saved.' })
    void qc.invalidateQueries({ queryKey: ['plant', plantId] })
    void qc.invalidateQueries({ queryKey: ['plants'] })
    void qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
  })

  const toggleTag = useMutation({
    mutationFn: async ({ tagId, on }: { tagId: string; on: boolean }) => {
      if (on) {
        const { error } = await supabase.from('plant_tag_assignments').insert({ plant_id: plantId, tag_id: tagId })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('plant_tag_assignments')
          .delete()
          .eq('plant_id', plantId)
          .eq('tag_id', tagId)
        if (error) throw error
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['plant-assignments', plantId] }),
  })

  const qrMutation = usePlantQrMutation()

  const addSection = useMutation({
    mutationFn: async (payload: { label: string; key: string; content: string }) => {
      const max =
        sectionsQuery.data?.reduce((m, s) => Math.max(m, s.sort_order), -1) ?? -1
      const { error } = await supabase.from('plant_content_sections').insert({
        plant_id: plantId,
        section_key: payload.key,
        section_label: payload.label,
        content: payload.content,
        sort_order: max + 1,
      })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['plant-sections', plantId] }),
  })

  const updateSection = useMutation({
    mutationFn: async (payload: {
      id: string
      section_label?: string
      section_key?: string
      content?: string
      is_active?: boolean
      sort_order?: number
    }) => {
      const { id: sid, ...rest } = payload
      const { error } = await supabase.from('plant_content_sections').update(rest).eq('id', sid)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['plant-sections', plantId] }),
  })

  const deleteSection = useMutation({
    mutationFn: async (sectionId: string) => {
      const { error } = await supabase.from('plant_content_sections').delete().eq('id', sectionId)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['plant-sections', plantId] }),
  })

  const uploadPhoto = useMutation({
    mutationFn: async (file: File) => {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${plantId}/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage.from('plant-photos').upload(path, file, {
        upsert: false,
        contentType: file.type || 'image/jpeg',
      })
      if (upErr) throw upErr
      const max = photosQuery.data?.reduce((m, p) => Math.max(m, p.sort_order), -1) ?? -1
      const { error } = await supabase.from('plant_catalog_photos').insert({
        plant_id: plantId,
        storage_path: path,
        sort_order: max + 1,
        is_cover: (photosQuery.data?.length ?? 0) === 0,
      })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['plant-photos', plantId] }),
  })

  const setCover = useMutation({
    mutationFn: async (photoId: string) => {
      const photos = photosQuery.data ?? []
      for (const p of photos) {
        await supabase.from('plant_catalog_photos').update({ is_cover: p.id === photoId }).eq('id', p.id)
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['plant-photos', plantId] })
      void qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
  })

  const deletePhoto = useMutation({
    mutationFn: async (row: { id: string; storage_path: string }) => {
      await supabase.storage.from('plant-photos').remove([row.storage_path])
      const { error } = await supabase.from('plant_catalog_photos').delete().eq('id', row.id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['plant-photos', plantId] }),
  })

  const [newSectionLabel, setNewSectionLabel] = useState('')
  const [newSectionContent, setNewSectionContent] = useState('')

  if (!plantId) return <p className="text-red-600">Missing plant id.</p>
  if (plantQuery.isLoading) return <p className="text-slate-600">Loading…</p>
  if (plantQuery.isError || !plantQuery.data) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
        Plant not found or you do not have access.
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button variant="ghost" asChild className="-ml-2 mb-1 h-8">
            <Link to="/plants">← Plants</Link>
          </Button>
          <h1 className="text-2xl font-semibold text-slate-900">{plantQuery.data.common_name}</h1>
          <p className="text-sm text-slate-500">{plantQuery.data.slug}</p>
        </div>
        <Badge variant={plantQuery.data.status === 'active' ? 'success' : 'neutral'}>{plantQuery.data.status}</Badge>
      </div>

      {msg ? (
        <div
          className={
            msg.type === 'ok'
              ? 'rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900'
              : 'rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800'
          }
        >
          {msg.text}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Core data</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveCore} className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label htmlFor="common_name">Common name</Label>
              <Input id="common_name" {...register('common_name')} />
              {errors.common_name ? <p className="mt-1 text-sm text-red-600">{errors.common_name.message}</p> : null}
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="scientific_name">Scientific name</Label>
              <Input id="scientific_name" {...register('scientific_name')} />
            </div>
            <div>
              <Label htmlFor="slug">Slug</Label>
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
            <div className="md:col-span-2">
              <Label htmlFor="summary">Summary</Label>
              <Textarea id="summary" {...register('summary')} />
            </div>
            <div>
              <Label htmlFor="light_level">Light</Label>
              <Input id="light_level" {...register('light_level')} />
            </div>
            <div>
              <Label htmlFor="water_level">Water</Label>
              <Input id="water_level" {...register('water_level')} />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="internal_notes">Internal notes</Label>
              <Textarea id="internal_notes" {...register('internal_notes')} />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving…' : 'Save core data'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tags</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {(tagsQuery.data ?? []).map((t) => {
              const on = assignQuery.data?.has(t.id) ?? false
              const inactive = !t.is_active
              return (
                <label
                  key={t.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    inactive ? 'border-dashed border-amber-300 bg-amber-50' : 'border-[var(--color-veera-border)]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={toggleTag.isPending}
                    onChange={(e) => toggleTag.mutate({ tagId: t.id, on: e.target.checked })}
                  />
                  {t.name}
                  {inactive ? <span className="text-xs text-amber-800">(inactive)</span> : null}
                </label>
              )
            })}
          </div>
          {(tagsQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">No tags yet. Create tags under Tags.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Content sections</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border border-dashed border-[var(--color-veera-border)] p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>New section label</Label>
                <Input value={newSectionLabel} onChange={(e) => setNewSectionLabel(e.target.value)} placeholder="e.g. Pet safety" />
              </div>
              <div>
                <Label>Content</Label>
                <Textarea value={newSectionContent} onChange={(e) => setNewSectionContent(e.target.value)} />
              </div>
            </div>
            <Button
              type="button"
              className="mt-3"
              disabled={!newSectionLabel.trim() || addSection.isPending}
              onClick={() => {
                const key = sectionKeyFromLabel(newSectionLabel)
                void addSection.mutateAsync({
                  label: newSectionLabel.trim(),
                  key,
                  content: newSectionContent,
                })
                setNewSectionLabel('')
                setNewSectionContent('')
              }}
            >
              Add section
            </Button>
          </div>

          {(sectionsQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">No sections yet. Add topics like care tips or seasonal notes.</p>
          ) : null}

          <ul className="space-y-4">
            {(sectionsQuery.data ?? []).map((s, idx, arr) => (
              <li key={s.id} className="rounded-lg border border-[var(--color-veera-border)] p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant={s.is_active ? 'neutral' : 'warning'}>{s.is_active ? 'Active' : 'Hidden'}</Badge>
                  <span className="text-xs text-slate-400">key: {s.section_key}</span>
                  <div className="ml-auto flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      disabled={idx === 0}
                      onClick={async () => {
                        const prev = arr[idx - 1]
                        if (!prev) return
                        const a = s.sort_order
                        const b = prev.sort_order
                        await updateSection.mutateAsync({ id: s.id, sort_order: b })
                        await updateSection.mutateAsync({ id: prev.id, sort_order: a })
                      }}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      disabled={idx === arr.length - 1}
                      onClick={async () => {
                        const next = arr[idx + 1]
                        if (!next) return
                        const a = s.sort_order
                        const b = next.sort_order
                        await updateSection.mutateAsync({ id: s.id, sort_order: b })
                        await updateSection.mutateAsync({ id: next.id, sort_order: a })
                      }}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div>
                    <Label>Label</Label>
                    <Input
                      defaultValue={s.section_label}
                      onBlur={(e) => {
                        const v = e.target.value.trim()
                        if (v && v !== s.section_label) void updateSection.mutateAsync({ id: s.id, section_label: v })
                      }}
                    />
                  </div>
                  <div>
                    <Label>Key (stable for app)</Label>
                    <Input
                      defaultValue={s.section_key}
                      onBlur={(e) => {
                        const v = slugify(e.target.value).replace(/-/g, '_')
                        if (v && v !== s.section_key) void updateSection.mutateAsync({ id: s.id, section_key: v })
                      }}
                    />
                  </div>
                </div>
                <div className="mt-2">
                  <Label>Content</Label>
                  <Textarea
                    defaultValue={s.content}
                    onBlur={(e) => {
                      const v = e.target.value
                      if (v !== s.content) void updateSection.mutateAsync({ id: s.id, content: v })
                    }}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void updateSection.mutateAsync({ id: s.id, is_active: !s.is_active })}
                  >
                    {s.is_active ? 'Disable section' : 'Enable section'}
                  </Button>
                  <Button type="button" variant="danger" onClick={() => void deleteSection.mutateAsync(s.id)}>
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Photos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-veera-border)] px-4 py-2 text-sm hover:bg-stone-50">
            <ImagePlus className="h-4 w-4" />
            Upload photo
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploadPhoto.isPending}
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void uploadPhoto.mutateAsync(f)
              }}
            />
          </label>
          {uploadPhoto.isError ? (
            <p className="text-sm text-red-600">Upload failed. Check file size and try again.</p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(photosQuery.data ?? []).map((p) => (
              <PhotoThumb
                key={p.id}
                path={p.storage_path}
                isCover={p.is_cover}
                onSetCover={() => void setCover.mutateAsync(p.id)}
                onDelete={() => void deletePhoto.mutateAsync(p)}
              />
            ))}
          </div>
          {(photosQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">No photos. Upload a cover for best results in the app.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>QR code</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!primaryQr ? (
            <p className="text-sm text-amber-800">No primary QR yet. Generate one below.</p>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="rounded-lg border border-[var(--color-veera-border)] bg-white p-4">
                {signedQrUrl.data ? (
                  <img src={signedQrUrl.data} alt="Plant QR" className="h-40 w-40 object-contain" />
                ) : primaryQr.status === 'failed' ? (
                  <div className="flex h-40 w-40 items-center justify-center text-center text-sm text-red-600">
                    Generation failed
                  </div>
                ) : (
                  <div className="flex h-40 w-40 items-center justify-center text-sm text-slate-500">Loading preview…</div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2 text-sm">
                <div>
                  <span className="font-medium text-slate-700">Status: </span>
                  <Badge variant={primaryQr.status === 'ready' ? 'success' : primaryQr.status === 'failed' ? 'danger' : 'warning'}>
                    {primaryQr.status}
                  </Badge>
                </div>
                <div className="break-all text-slate-600">
                  <span className="font-medium text-slate-700">Value: </span>
                  {primaryQr.qr_value}
                </div>
                {primaryQr.last_error ? (
                  <div className="rounded-md bg-red-50 p-2 text-red-800">{primaryQr.last_error}</div>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-2">
                  {signedQrUrl.data ? (
                    <Button variant="secondary" type="button" asChild>
                      <a href={signedQrUrl.data} download={`${plantQuery.data.slug}-qr.png`}>
                        <Download className="h-4 w-4" />
                        Download PNG
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={qrMutation.isPending}
                    onClick={() => void qrMutation.mutateAsync({ plantId, mode: 'ensure_primary' })}
                  >
                    <QrCode className="h-4 w-4" />
                    Retry / ensure QR
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={qrMutation.isPending}
                    onClick={() => void qrMutation.mutateAsync({ plantId, mode: 'regenerate' })}
                  >
                    Regenerate QR
                  </Button>
                </div>
              </div>
            </div>
          )}
          {!primaryQr ? (
            <Button type="button" disabled={qrMutation.isPending} onClick={() => void qrMutation.mutateAsync({ plantId, mode: 'ensure_primary' })}>
              Generate QR
            </Button>
          ) : null}
          {qrMutation.isError ? (
            <p className="text-sm text-red-600">{qrMutation.error instanceof Error ? qrMutation.error.message : 'QR error'}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

function PhotoThumb({
  path,
  isCover,
  onSetCover,
  onDelete,
}: {
  path: string
  isCover: boolean
  onSetCover: () => void
  onDelete: () => void
}) {
  const urlQuery = useQuery({
    queryKey: ['photo-url', path],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('plant-photos').createSignedUrl(path, 3600)
      if (error) throw error
      return data.signedUrl
    },
  })

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-veera-border)]">
      <div className="aspect-video bg-stone-100">
        {urlQuery.data ? (
          <img src={urlQuery.data} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">Loading…</div>
        )}
      </div>
      <div className="flex flex-wrap gap-2 p-2">
        {isCover ? <Badge variant="success">Cover</Badge> : null}
        {!isCover ? (
          <Button type="button" variant="secondary" className="h-8 text-xs" onClick={onSetCover}>
            Set cover
          </Button>
        ) : null}
        <Button type="button" variant="ghost" className="h-8 text-xs text-red-700" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  )
}
