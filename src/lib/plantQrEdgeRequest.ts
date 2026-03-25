import { supabase } from '@/lib/supabaseClient'
import { getEdgeFunctionUrl } from '@/lib/edgeFunctionUrl'
import { friendlyQrErrorMessage, logQrErrorDev } from '@/lib/qrErrors'

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

/**
 * Calls plant-qr-upsert via fetch so failures surface as 404 / network / body text
 * instead of the generic "Failed to send a request to the Edge Function".
 */
export async function requestPlantQrUpsert(plantId: string, mode: QrMode): Promise<PlantQrUpsertResult> {
  const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, '')
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!base || !anon) {
    return { ok: false, message: 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.' }
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return { ok: false, message: 'You are not signed in. Refresh the page and try again.' }
  }

  const url = getEdgeFunctionUrl('plant-qr-upsert')
  if (!url) {
    return { ok: false, message: 'Missing VITE_SUPABASE_URL.' }
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: anon,
      },
      body: JSON.stringify({ plant_id: plantId, mode }),
    })
  } catch (err) {
    const hint =
      'Could not reach the QR service. Check your network, VPN, or ad-blocker, and try again.'
    if (err instanceof TypeError) {
      return { ok: false, message: `${hint} (${err.message})` }
    }
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Network error while contacting the QR service.',
    }
  }

  const text = await res.text()
  let json: PlantQrSuccessPayload & { error?: string; code?: string; hint?: string } = {} as PlantQrSuccessPayload & {
    error?: string
    code?: string
    hint?: string
  }
  if (text) {
    try {
      json = JSON.parse(text) as typeof json
    } catch {
      json = { error: text.slice(0, 280) } as typeof json
    }
  }

  logQrErrorDev(text, json)

  if (!res.ok) {
    const message = friendlyQrErrorMessage({
      httpStatus: res.status,
      bodyText: text,
      parsed: { error: json.error, code: json.code, hint: json.hint },
    })
    return { ok: false, message }
  }

  if (json.ok === true && json.qr_id) {
    if (json.plant_id) {
      return { ok: true, data: json as PlantQrSuccessPayload }
    }
    const legacy = json as { ok: true; qr_id: string; path?: string; reused?: boolean }
    return {
      ok: true,
      data: {
        ok: true,
        plant_id: plantId,
        qr_id: legacy.qr_id,
        qr_token: '',
        qr_value: '',
        qr_image_path: legacy.path ?? null,
        is_primary: true,
        status: 'ready',
        reused: legacy.reused,
      },
    }
  }

  return { ok: false, message: 'Unexpected response from QR service. Check Supabase Edge Function logs.' }
}
