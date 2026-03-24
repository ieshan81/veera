import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import QRCode from 'npm:qrcode@1.5.4'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const qrBase = Deno.env.get('QR_PUBLIC_BASE_URL') ?? 'https://app.veera.com/p'

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json({ error: 'Server misconfigured' }, 500)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Missing authorization' }, 401)
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser()
    if (userErr || !user) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: roles, error: roleErr } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
    if (roleErr) {
      return json({ error: roleErr.message }, 500)
    }
    const allowed = (roles ?? []).some((r) => r.role === 'admin' || r.role === 'super_admin')
    if (!allowed) {
      return json({ error: 'Forbidden' }, 403)
    }

    const body = (await req.json()) as { plant_id?: string; mode?: string }
    const plantId = body.plant_id
    const mode = body.mode === 'regenerate' ? 'regenerate' : 'ensure_primary'
    if (!plantId) {
      return json({ error: 'plant_id required' }, 400)
    }

    const { data: plant, error: plantErr } = await admin.from('plants').select('id, slug').eq('id', plantId).single()
    if (plantErr || !plant) {
      return json({ error: 'Plant not found' }, 404)
    }

    if (mode === 'ensure_primary') {
      const { data: existing } = await admin
        .from('plant_qr_codes')
        .select('id, status, qr_image_path, qr_value, qr_token')
        .eq('plant_id', plantId)
        .eq('is_primary', true)
        .eq('is_active', true)
        .maybeSingle()

      if (existing && existing.status === 'ready' && existing.qr_image_path) {
        return json({ ok: true, reused: true, qr_id: existing.id })
      }

      await admin.from('plant_qr_codes').update({ is_primary: false }).eq('plant_id', plantId).eq('is_primary', true)
    }

    if (mode === 'regenerate') {
      await admin
        .from('plant_qr_codes')
        .update({ is_primary: false, is_active: false })
        .eq('plant_id', plantId)
        .eq('is_primary', true)
    }

    const qrToken = crypto.randomUUID().replace(/-/g, '')
    const base = qrBase.replace(/\/$/, '')
    const qrValue = `${base}/${plant.slug}?t=${qrToken}`

    const { data: inserted, error: insErr } = await admin
      .from('plant_qr_codes')
      .insert({
        plant_id: plantId,
        qr_token: qrToken,
        qr_value: qrValue,
        is_primary: true,
        is_active: true,
        status: 'pending',
        last_error: null,
      })
      .select('id')
      .single()

    if (insErr) {
      return json({ error: insErr.message, code: insErr.code }, 500)
    }

    const qrRowId = inserted!.id as string
    const objectPath = `plants/${plantId}/${qrToken}.png`

    try {
      const dataUrl = await QRCode.toDataURL(qrValue, { width: 512, margin: 2, errorCorrectionLevel: 'M' })
      const base64 = dataUrl.split(',')[1] ?? ''
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))

      const { error: upErr } = await admin.storage.from('plant-qr').upload(objectPath, bytes, {
        contentType: 'image/png',
        upsert: true,
      })
      if (upErr) {
        await admin
          .from('plant_qr_codes')
          .update({ status: 'failed', last_error: `Storage: ${upErr.message}` })
          .eq('id', qrRowId)
        return json({ error: upErr.message }, 500)
      }

      const { error: upRow } = await admin
        .from('plant_qr_codes')
        .update({ qr_image_path: objectPath, status: 'ready', last_error: null })
        .eq('id', qrRowId)

      if (upRow) {
        return json({ error: upRow.message }, 500)
      }

      return json({ ok: true, qr_id: qrRowId, path: objectPath })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'QR render failed'
      await admin.from('plant_qr_codes').update({ status: 'failed', last_error: msg }).eq('id', qrRowId)
      return json({ error: msg }, 500)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return json({ error: msg }, 500)
  }
})
