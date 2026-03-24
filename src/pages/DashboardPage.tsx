import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, QrCode, Sprout, Tag, Upload, ImageOff, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { usePlantQrMutation } from '@/hooks/usePlantQr'

async function fetchDashboardStats() {
  const { data: plants, error: pe } = await supabase.from('plants').select('id, status, updated_at, common_name, slug')
  if (pe) throw pe

  const { data: qrs, error: qe } = await supabase
    .from('plant_qr_codes')
    .select('plant_id, status, is_primary, is_active')
    .eq('is_primary', true)
    .eq('is_active', true)
  if (qe) throw qe

  const { data: covers, error: ce } = await supabase
    .from('plant_catalog_photos')
    .select('plant_id')
    .eq('is_cover', true)
  if (ce) throw ce

  const coverSet = new Set((covers ?? []).map((c) => c.plant_id))
  const qrByPlant = new Map<string, (typeof qrs)[number]>()
  for (const q of qrs ?? []) {
    qrByPlant.set(q.plant_id, q)
  }

  const total = plants?.length ?? 0
  const active = (plants ?? []).filter((p) => p.status === 'active').length
  const missingQr = (plants ?? []).filter((p) => {
    const q = qrByPlant.get(p.id)
    return !q || q.status !== 'ready'
  }).length
  const missingPhoto = (plants ?? []).filter((p) => !coverSet.has(p.id)).length

  const recent = [...(plants ?? [])]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 8)

  return { total, active, missingQr, missingPhoto, recent }
}

export function DashboardPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchDashboardStats,
  })

  const qrMutation = usePlantQrMutation()

  const handleGenerateMissing = async () => {
    const { data: plants } = await supabase.from('plants').select('id')
    const { data: qrs } = await supabase
      .from('plant_qr_codes')
      .select('plant_id, status')
      .eq('is_primary', true)
      .eq('is_active', true)

    const ready = new Set((qrs ?? []).filter((q) => q.status === 'ready').map((q) => q.plant_id))
    const need = (plants ?? []).filter((p) => !ready.has(p.id))
    for (const p of need) {
      try {
        await qrMutation.mutateAsync({ plantId: p.id, mode: 'ensure_primary' })
      } catch {
        /* continue others */
      }
    }
    await refetch()
  }

  if (isLoading) {
    return <p className="text-slate-600">Loading dashboard…</p>
  }
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        Could not load dashboard. Check Supabase env and that you are logged in as admin.
      </div>
    )
  }

  const stats = data!

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">Operational overview for your plant catalog.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <div className="text-sm font-medium text-slate-500">Total plants</div>
            <div className="mt-1 text-3xl font-semibold text-slate-900">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-sm font-medium text-slate-500">Active</div>
            <div className="mt-1 text-3xl font-semibold text-emerald-800">{stats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <AlertCircle className="h-4 w-4" />
              Missing QR
            </div>
            <div className="mt-1 text-3xl font-semibold text-amber-800">{stats.missingQr}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <ImageOff className="h-4 w-4" />
              Missing cover photo
            </div>
            <div className="mt-1 text-3xl font-semibold text-slate-800">{stats.missingPhoto}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/plants/new">
              <Plus className="h-4 w-4" />
              Add plant
            </Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link to="/import">
              <Upload className="h-4 w-4" />
              Import plants
            </Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link to="/tags">
              <Tag className="h-4 w-4" />
              Manage tags
            </Link>
          </Button>
          <Button
            variant="secondary"
            type="button"
            disabled={qrMutation.isPending}
            onClick={() => void handleGenerateMissing()}
          >
            <QrCode className="h-4 w-4" />
            {qrMutation.isPending ? 'Generating…' : 'Generate missing QRs'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recently updated</CardTitle>
          <Button variant="ghost" asChild className="h-8 text-sm">
            <Link to="/plants">View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {stats.recent.length === 0 ? (
            <p className="text-sm text-slate-500">No plants yet. Add your first plant to get started.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-veera-border)]">
              {stats.recent.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-3 first:pt-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-100 text-emerald-800">
                      <Sprout className="h-4 w-4" />
                    </div>
                    <div>
                      <Link to={`/plants/${p.id}`} className="font-medium text-slate-900 hover:text-emerald-800">
                        {p.common_name}
                      </Link>
                      <div className="text-xs text-slate-500">{p.slug}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={p.status === 'active' ? 'success' : 'neutral'}>{p.status}</Badge>
                    <span className="text-xs text-slate-400">
                      {new Date(p.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
