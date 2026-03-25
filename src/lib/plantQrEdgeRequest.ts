import { supabase } from '@/lib/supabaseClient'
import { getEdgeFunctionUrl } from '@/lib/edgeFunctionUrl'

export type QrMode = 'ensure_primary' | 'regenerate'

export type PlantQrUpsertResult =
  | { ok: true; data?: unknown }
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
      'Browser could not reach Supabase. Check VPN/ad-block, Wi‑Fi, and that VITE_SUPABASE_URL matches your project (Settings → API).'
    if (err instanceof TypeError) {
      return { ok: false, message: `${hint} (${err.message})` }
    }
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Network error while contacting Supabase.',
    }
  }

  const text = await res.text()
  let json: { ok?: boolean; error?: string; code?: string } = {}
  if (text) {
    try {
      json = JSON.parse(text) as { ok?: boolean; error?: string; code?: string }
    } catch {
      json = { error: text.slice(0, 280) }
    }
  }

  if (res.status === 404) {
    return {
      ok: false,
      message:
        'plant-qr-upsert is not deployed (404). Run: supabase functions deploy plant-qr-upsert (same project as VITE_SUPABASE_URL).',
    }
  }

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      message:
        'Supabase rejected the request. Sign out and sign in again, and confirm VITE_SUPABASE_ANON_KEY is the anon key from Settings → API.',
    }
  }

  if (!res.ok) {
    return {
      ok: false,
      message: json.error || `Request failed with status ${res.status}.`,
    }
  }

  if (json.error) {
    return { ok: false, message: json.error }
  }

  return { ok: true, data: json }
}
