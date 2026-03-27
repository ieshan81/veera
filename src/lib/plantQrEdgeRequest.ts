import QRCode from 'qrcode'
import { supabase } from '@/lib/supabaseClient'

export type QrMode = 'ensure_primary' | 'regenerate'

export type PlantQrSuccessPayload = {
  ok: true
  plant_id: string
  qr_id: string
  qr_token: string
  qr_value: string
  qr_image_path: string | null
  is_primary: boolean
  status: 'ready' | 'pending'
  reused?: boolean
}

export type PlantQrUpsertResult =
  | { ok: true; data: PlantQrSuccessPayload }
  | { ok: false; message: string }

function getQrBaseUrl(): string {
  const v = import.meta.env.VITE_QR_PUBLIC_BASE_URL?.trim().replace(/\/+$/, '')
  return v || 'https://veera.yourdomain.com/p'
}

function generateToken(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

async function generateQrPngBytes(value: string): Promise<Uint8Array> {
  const dataUrl = await QRCode.toDataURL(value, {
    width: 512,
    margin: 2,
    errorCorrectionLevel: 'M',
  })
  const base64 = dataUrl.split(',')[1] ?? ''
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Generate or ensure a primary QR code for a plant.
 * Runs entirely client-side using the Supabase JS client (same auth as the rest of the admin panel).
 * No Edge Function needed — RLS policies grant admin users full access to plant_qr_codes + plant-qr storage.
 */
export async function requestPlantQrUpsert(plantId: string, mode: QrMode): Promise<PlantQrUpsertResult> {
  try {
    // Verify user is signed in
    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) {
      return { ok: false, message: 'You are not signed in. Please sign in and try again.' }
    }

    // For ensure_primary: check if a ready primary QR already exists
    if (mode === 'ensure_primary') {
      const { data: existing } = await supabase
        .from('plant_qr_codes')
        .select('id, status, qr_image_path, qr_value, qr_token')
        .eq('plant_id', plantId)
        .eq('is_primary', true)
        .eq('is_active', true)
        .maybeSingle()

      if (existing && existing.status === 'ready' && existing.qr_image_path) {
        return {
          ok: true,
          data: {
            ok: true,
            reused: true,
            plant_id: plantId,
            qr_id: existing.id,
            qr_token: existing.qr_token,
            qr_value: existing.qr_value,
            qr_image_path: existing.qr_image_path,
            is_primary: true,
            status: 'ready',
          },
        }
      }

      // Deactivate any existing primary
      await supabase
        .from('plant_qr_codes')
        .update({ is_primary: false })
        .eq('plant_id', plantId)
        .eq('is_primary', true)
    }

    if (mode === 'regenerate') {
      await supabase
        .from('plant_qr_codes')
        .update({ is_primary: false, is_active: false })
        .eq('plant_id', plantId)
        .eq('is_primary', true)
    }

    // Generate new token + QR value
    const qrToken = generateToken()
    const qrBase = getQrBaseUrl()
    const qrValue = `${qrBase}/${qrToken}`

    // Insert pending row
    const { data: inserted, error: insErr } = await supabase
      .from('plant_qr_codes')
      .insert({
        plant_id: plantId,
        qr_token: qrToken,
        qr_value: qrValue,
        is_primary: true,
        is_active: true,
        status: 'pending' as const,
        last_error: null,
      })
      .select('id')
      .single()

    if (insErr || !inserted) {
      return { ok: false, message: `Could not create QR record: ${insErr?.message ?? 'unknown error'}` }
    }

    const qrRowId = inserted.id as string
    const objectPath = `plants/${plantId}/${qrToken}.png`

    // Generate QR image in the browser
    let pngBytes: Uint8Array
    try {
      pngBytes = await generateQrPngBytes(qrValue)
    } catch (e) {
      await supabase
        .from('plant_qr_codes')
        .update({ status: 'failed' as const, last_error: e instanceof Error ? e.message : 'QR render failed' })
        .eq('id', qrRowId)
      return { ok: false, message: 'Could not generate QR image. Try again.' }
    }

    // Upload to Supabase Storage
    const { error: upErr } = await supabase.storage
      .from('plant-qr')
      .upload(objectPath, pngBytes, { contentType: 'image/png', upsert: true })

    if (upErr) {
      await supabase
        .from('plant_qr_codes')
        .update({ status: 'failed' as const, last_error: `Storage: ${upErr.message}` })
        .eq('id', qrRowId)
      return { ok: false, message: `Could not upload QR image: ${upErr.message}` }
    }

    // Mark ready
    const { error: updateErr } = await supabase
      .from('plant_qr_codes')
      .update({ qr_image_path: objectPath, status: 'ready' as const, last_error: null })
      .eq('id', qrRowId)

    if (updateErr) {
      return { ok: false, message: `QR image uploaded but row update failed: ${updateErr.message}` }
    }

    return {
      ok: true,
      data: {
        ok: true,
        plant_id: plantId,
        qr_id: qrRowId,
        qr_token: qrToken,
        qr_value: qrValue,
        qr_image_path: objectPath,
        is_primary: true,
        status: 'ready',
      },
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return { ok: false, message: `QR generation failed: ${msg}` }
  }
}
