import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Papa from 'papaparse'
import { supabase } from '@/lib/supabaseClient'
import { slugify } from '@/lib/slug'
import { friendlyDbError } from '@/lib/errors'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/auth/useAuth'
import { usePlantQrMutation } from '@/hooks/usePlantQr'

type Row = Record<string, string>

export function ImportPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [log, setLog] = useState<string[]>([])
  const qrMutation = usePlantQrMutation()

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const lines: string[] = []
      const text = await file.text()
      const parsed = Papa.parse<Row>(text, { header: true, skipEmptyLines: true })
      if (parsed.errors.length) {
        throw new Error(parsed.errors[0]?.message ?? 'CSV parse error')
      }
      const rows = parsed.data.filter((r) => Object.keys(r).some((k) => (r[k] ?? '').trim() !== ''))

      const { data: profile } = await supabase.from('profiles').select('id').eq('id', user!.id).maybeSingle()

      const { data: batch, error: be } = await supabase
        .from('import_batches')
        .insert({
          source_name: file.name,
          status: 'processing',
          total_rows: rows.length,
          processed_rows: 0,
          created_by: profile?.id ?? user!.id,
        })
        .select('id')
        .single()
      if (be) throw be

      const { data: tags } = await supabase.from('plant_tags').select('id, slug')

      let processed = 0
      const errors: string[] = []

      for (const row of rows) {
        const common = (row.common_name ?? row.name ?? '').trim()
        let slug = (row.slug ?? '').trim().toLowerCase()
        if (!common) {
          errors.push('Skipped row: missing common_name')
          continue
        }
        if (!slug) slug = slugify(common)

        const statusRaw = (row.status ?? 'active').trim().toLowerCase()
        const status =
          statusRaw === 'inactive' || statusRaw === 'archived' ? (statusRaw as 'inactive' | 'archived') : 'active'

        const { data: plant, error: pe } = await supabase
          .from('plants')
          .insert({
            common_name: common,
            scientific_name: row.scientific_name?.trim() || null,
            slug,
            summary: row.summary?.trim() || null,
            status,
          })
          .select('id')
          .single()

        if (pe) {
          errors.push(`${slug}: ${friendlyDbError(pe)}`)
          continue
        }

        const tagSlugs = (row.tags ?? row.tag_slugs ?? '')
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)

        for (const ts of tagSlugs) {
          const tag = tags?.find((t) => t.slug === ts)
          if (tag) {
            await supabase.from('plant_tag_assignments').insert({ plant_id: plant.id, tag_id: tag.id })
          } else {
            errors.push(`${slug}: unknown tag slug "${ts}"`)
          }
        }

        try {
          await qrMutation.mutateAsync({ plantId: plant.id, mode: 'ensure_primary' })
        } catch {
          errors.push(`${slug}: QR generation failed (retry from plant page)`)
        }

        processed += 1
        await supabase
          .from('import_batches')
          .update({
            processed_rows: processed,
            error_summary: errors.length ? { messages: errors.slice(-50) } : null,
          })
          .eq('id', batch.id)
      }

      await supabase
        .from('import_batches')
        .update({
          status: errors.length && processed === 0 ? 'failed' : 'completed',
          processed_rows: processed,
          completed_at: new Date().toISOString(),
          error_summary: errors.length ? { messages: errors } : null,
        })
        .eq('id', batch.id)

      lines.push(`Imported ${processed} of ${rows.length} rows.`)
      if (errors.length) lines.push('Issues:', ...errors.slice(0, 20))
      return lines
    },
    onSuccess: (lines) => {
      setLog(lines)
      void qc.invalidateQueries({ queryKey: ['plants'] })
      void qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
    onError: (e: Error) => setLog([e.message]),
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Import plants</h1>
        <p className="text-sm text-slate-600">
          CSV with header row. Columns: <code className="rounded bg-stone-100 px-1">common_name</code> (or{' '}
          <code className="rounded bg-stone-100 px-1">name</code>), <code className="rounded bg-stone-100 px-1">slug</code>{' '}
          (optional), <code className="rounded bg-stone-100 px-1">scientific_name</code>,{' '}
          <code className="rounded bg-stone-100 px-1">summary</code>, <code className="rounded bg-stone-100 px-1">status</code>{' '}
          (active/inactive/archived), <code className="rounded bg-stone-100 px-1">tags</code> (comma-separated tag slugs,
          must exist).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="csv">File</Label>
            <input
              id="csv"
              type="file"
              accept=".csv,text/csv"
              className="mt-2 block text-sm"
              disabled={importMutation.isPending}
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) {
                  setLog([])
                  importMutation.mutate(f)
                }
              }}
            />
          </div>
          {importMutation.isPending ? <p className="text-sm text-slate-600">Importing… this may take a minute.</p> : null}
          {log.length > 0 ? (
            <pre className="max-h-64 overflow-auto rounded-lg border border-[var(--color-veera-border)] bg-stone-50 p-3 text-xs">
              {log.join('\n')}
            </pre>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
