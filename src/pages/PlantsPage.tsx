import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Eye, Pencil, Search } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import type { PlantStatus } from '@/lib/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type PlantRow = {
  id: string
  slug: string
  common_name: string
  scientific_name: string | null
  status: PlantStatus
  updated_at: string
}

async function fetchPlantsData() {
  const { data: plants, error } = await supabase
    .from('plants')
    .select('id, slug, common_name, scientific_name, status, updated_at')
    .order('updated_at', { ascending: false })
  if (error) throw error

  const { data: qrs } = await supabase
    .from('plant_qr_codes')
    .select('plant_id, status')
    .eq('is_primary', true)
    .eq('is_active', true)

  const { data: covers } = await supabase.from('plant_catalog_photos').select('plant_id').eq('is_cover', true)

  const { data: assignments } = await supabase.from('plant_tag_assignments').select('plant_id, tag_id')

  const qrReady = new Set((qrs ?? []).filter((q) => q.status === 'ready').map((q) => q.plant_id))
  const hasQrRow = new Set((qrs ?? []).map((q) => q.plant_id))
  const coverSet = new Set((covers ?? []).map((c) => c.plant_id))
  const tagsByPlant = new Map<string, string[]>()
  for (const a of assignments ?? []) {
    const list = tagsByPlant.get(a.plant_id) ?? []
    list.push(a.tag_id)
    tagsByPlant.set(a.plant_id, list)
  }

  return { plants: (plants ?? []) as PlantRow[], qrReady, hasQrRow, coverSet, tagsByPlant }
}

export function PlantsPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | PlantStatus>('all')
  const [missingQr, setMissingQr] = useState(false)
  const [missingPhoto, setMissingPhoto] = useState(false)
  const [tagFilter, setTagFilter] = useState<string>('')

  const { data, isLoading } = useQuery({
    queryKey: ['plants'],
    queryFn: fetchPlantsData,
  })

  const { data: tags } = useQuery({
    queryKey: ['plant-tags'],
    queryFn: async () => {
      const { data: t, error } = await supabase.from('plant_tags').select('id, name').order('sort_order')
      if (error) throw error
      return t ?? []
    },
  })

  const filtered = useMemo(() => {
    if (!data) return []
    let rows = data.plants
    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter(
        (p) =>
          p.common_name.toLowerCase().includes(q) ||
          (p.scientific_name?.toLowerCase().includes(q) ?? false) ||
          p.slug.toLowerCase().includes(q),
      )
    }
    if (statusFilter !== 'all') {
      rows = rows.filter((p) => p.status === statusFilter)
    }
    if (missingQr) {
      rows = rows.filter((p) => !data.qrReady.has(p.id))
    }
    if (missingPhoto) {
      rows = rows.filter((p) => !data.coverSet.has(p.id))
    }
    if (tagFilter) {
      rows = rows.filter((p) => (data.tagsByPlant.get(p.id) ?? []).includes(tagFilter))
    }
    return rows
  }, [data, search, statusFilter, missingQr, missingPhoto, tagFilter])

  if (isLoading) return <p className="text-slate-600">Loading plants…</p>

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Plants</h1>
          <p className="text-sm text-slate-600">Search, filter, and open any plant.</p>
        </div>
        <Button asChild>
          <Link to="/plants/new">Add plant</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="md:col-span-2">
            <Label htmlFor="search">Search</Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="search"
                className="pl-9"
                placeholder="Name, scientific name, or slug"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              className="mt-1 w-full rounded-lg border border-[var(--color-veera-border)] bg-white px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div>
            <Label htmlFor="tag">Tag</Label>
            <select
              id="tag"
              className="mt-1 w-full rounded-lg border border-[var(--color-veera-border)] bg-white px-3 py-2 text-sm"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
            >
              <option value="">Any tag</option>
              {(tags ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2 md:col-span-2 lg:col-span-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={missingQr} onChange={(e) => setMissingQr(e.target.checked)} />
              Missing QR (not ready)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={missingPhoto} onChange={(e) => setMissingPhoto(e.target.checked)} />
              Missing cover photo
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-[var(--color-veera-border)] bg-stone-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Common name</th>
                  <th className="px-4 py-3">Scientific</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">QR</th>
                  <th className="px-4 py-3">Photo</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-veera-border)]">
                {filtered.map((p) => {
                  const qrOk = data!.qrReady.has(p.id)
                  const photoOk = data!.coverSet.has(p.id)
                  return (
                    <tr key={p.id} className="bg-white/80 hover:bg-stone-50/80">
                      <td className="px-4 py-3 font-medium text-slate-900">{p.common_name}</td>
                      <td className="px-4 py-3 text-slate-600">{p.scientific_name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <Badge variant={p.status === 'active' ? 'success' : 'neutral'}>{p.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {qrOk ? (
                          <Badge variant="success">Ready</Badge>
                        ) : data!.hasQrRow.has(p.id) ? (
                          <Badge variant="warning">Pending / failed</Badge>
                        ) : (
                          <Badge variant="danger">None</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">{photoOk ? <Badge variant="success">Yes</Badge> : <Badge>No</Badge>}</td>
                      <td className="px-4 py-3 text-slate-500">{new Date(p.updated_at).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" className="h-8 px-2" asChild>
                            <Link to={`/plants/${p.id}`}>
                              <Eye className="h-4 w-4" />
                              View
                            </Link>
                          </Button>
                          <Button variant="ghost" className="h-8 px-2" asChild>
                            <Link to={`/plants/${p.id}`}>
                              <Pencil className="h-4 w-4" />
                              Edit
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">No plants match these filters.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
