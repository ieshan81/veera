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

/** JWT `exp` in ms, or null if not parseable (does not verify signature). */
function decodeJwtExpMs(accessToken: string): number | null {
  try {
    const parts = accessToken.split('.')
    if (parts.length < 2) return null
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4
    if (pad) b64 += '='.repeat(4 - pad)
    const payload = JSON.parse(atob(b64)) as { exp?: number }
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

function accessTokenNeedsRefresh(accessToken: string, skewMs: number): boolean {
  const expMs = decodeJwtExpMs(accessToken)
  if (expMs === null) return false
  return expMs < Date.now() + skewMs
}

type ParsedQrError = { error?: string; code?: string; hint?: string }

function parseQrJson(text: string): ParsedQrError {
  if (!text) return {}
  try {
    return JSON.parse(text) as ParsedQrError
  } catch {
    return {}
  }
}

/** When true, try refreshSession() once and retry the QR request (not used for missing-header 401s). */
function shouldRetry401WithRefresh(status: number, parsed: ParsedQrError): boolean {
  if (status !== 401) return false
  if (parsed.code === 'AUTH_HEADER_MISSING' || parsed.code === 'PROXY_MISSING_AUTHORIZATION') return false
  if (parsed.code === 'JWT_INVALID') return true
  // Legacy Edge Function (before distinct codes): treat as JWT unless clearly "missing header"
  if (parsed.code === 'UNAUTHORIZED') {
    const err = (parsed.error ?? '').toLowerCase()
    if (err.includes('missing authorization')) return false
    return true
  }
  // Unknown body (HTML/plain): still attempt one refresh in case JWT expired
  return true
}

async function postPlantQrUpsert(
  url: string,
  plantId: string,
  mode: QrMode,
  accessToken: string,
  anon: string,
): Promise<{ res: Response; text: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: anon,
    },
    body: JSON.stringify({ plant_id: plantId, mode }),
  })
  const text = await res.text()
  return { res, text }
}

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
    data: { session: initialSession },
  } = await supabase.auth.getSession()

  if (import.meta.env.DEV) {
    console.debug('[VEERA QR] session before QR request', {
      hasSession: !!initialSession,
      hasAccessToken: !!initialSession?.access_token,
      accessTokenLength: initialSession?.access_token?.length ?? 0,
      hasRefreshToken: !!initialSession?.refresh_token,
    })
  }

  if (!initialSession?.access_token) {
    return {
      ok: false,
      message:
        'No access token in this browser session. Open a new tab, sign in again, then return here and generate the QR code.',
    }
  }

  let accessToken = initialSession.access_token

  // Proactive refresh: getSession() can return an expired JWT; Edge getUser() will reject it.
  if (accessTokenNeedsRefresh(accessToken, 120_000) && initialSession.refresh_token) {
    const { data: refreshed, error: refErr } = await supabase.auth.refreshSession({
      refresh_token: initialSession.refresh_token,
    })
    if (import.meta.env.DEV) {
      console.debug('[VEERA QR] proactive refreshSession', {
        ok: !!refreshed.session?.access_token,
        error: refErr?.message,
      })
    }
    if (refreshed.session?.access_token) {
      accessToken = refreshed.session.access_token
    }
  }

  const url = getEdgeFunctionUrl('plant-qr-upsert')
  if (!url) {
    return { ok: false, message: 'Missing VITE_SUPABASE_URL.' }
  }

  let { res, text } = await postPlantQrUpsert(url, plantId, mode, accessToken, anon)
  let parsed = parseQrJson(text)

  if (res.status === 401 && shouldRetry401WithRefresh(res.status, parsed)) {
    const { data: refreshed, error: refErr } = await supabase.auth.refreshSession()
    if (import.meta.env.DEV) {
      console.debug('[VEERA QR] retry after 401: refreshSession', {
        ok: !!refreshed.session?.access_token,
        error: refErr?.message,
      })
    }
    if (refreshed.session?.access_token) {
      const second = await postPlantQrUpsert(url, plantId, mode, refreshed.session.access_token, anon)
      res = second.res
      text = second.text
      parsed = parseQrJson(text)
    }
  }

  let json: PlantQrSuccessPayload & ParsedQrError = {} as PlantQrSuccessPayload & ParsedQrError
  if (text) {
    try {
      json = JSON.parse(text) as PlantQrSuccessPayload & ParsedQrError
    } catch {
      json = { error: text.slice(0, 280) } as PlantQrSuccessPayload & ParsedQrError
    }
  }

  logQrErrorDev(text, json, { httpStatus: res.status })

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
