import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
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

function shouldRetry401WithRefresh(status: number, parsed: ParsedQrError): boolean {
  if (status !== 401) return false
  if (parsed.code === 'AUTH_HEADER_MISSING' || parsed.code === 'PROXY_MISSING_AUTHORIZATION') return false
  if (parsed.code === 'JWT_INVALID') return true
  if (parsed.code === 'UNAUTHORIZED') {
    const err = (parsed.error ?? '').toLowerCase()
    if (err.includes('missing authorization')) return false
    return true
  }
  return true
}

async function postPlantQrUpsertFetch(
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
 * Ensure Auth has a valid user JWT in storage (getUser hits server; refresh if needed).
 */
async function ensureAuthReadyForEdge(): Promise<{ ok: true } | { ok: false; message: string }> {
  let { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData.user) {
    const { data: ref, error: refErr } = await supabase.auth.refreshSession()
    if (import.meta.env.DEV) {
      console.debug('[VEERA QR] getUser failed, refreshSession', {
        userErr: userErr?.message,
        refreshed: !!ref.session,
        refErr: refErr?.message,
      })
    }
    if (!ref.session?.access_token) {
      return {
        ok: false,
        message:
          'Your session could not be refreshed. Sign out, sign in again, then generate the QR code.',
      }
    }
    ;({ data: userData, error: userErr } = await supabase.auth.getUser())
  }
  if (userErr || !userData.user) {
    return {
      ok: false,
      message:
        'Sign-in is not valid for the QR service. Sign out, sign in again, then retry.',
    }
  }
  return { ok: true }
}

async function maybeProactiveRefresh(): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token || !session?.refresh_token) return
  if (!accessTokenNeedsRefresh(token, 120_000)) return
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: session.refresh_token })
  if (import.meta.env.DEV) {
    console.debug('[VEERA QR] proactive refreshSession', { ok: !!data.session?.access_token, error: error?.message })
  }
}

type InvokeOutcome =
  | { kind: 'ok'; data: PlantQrSuccessPayload }
  | { kind: 'http'; status: number; text: string }
  | { kind: 'network'; message: string }

async function invokePlantQrUpsert(plantId: string, mode: QrMode): Promise<InvokeOutcome> {
  const { data, error, response } = await supabase.functions.invoke<PlantQrSuccessPayload>('plant-qr-upsert', {
    body: { plant_id: plantId, mode },
  })

  if (!error && data && typeof data === 'object' && data.ok === true && data.qr_id) {
    return { kind: 'ok', data: data as PlantQrSuccessPayload }
  }

  if (error instanceof FunctionsHttpError) {
    const res = (error as FunctionsHttpError & { context?: Response }).context ?? response
    const status = res?.status ?? 0
    let text = ''
    try {
      text = res ? await res.clone().text() : ''
    } catch {
      text = ''
    }
    return { kind: 'http', status, text }
  }

  if (error instanceof FunctionsFetchError) {
    return {
      kind: 'network',
      message: error.message || 'Failed to reach Supabase Edge Function',
    }
  }

  return {
    kind: 'network',
    message: error instanceof Error ? error.message : 'Unexpected error calling QR service',
  }
}

function resultFromHttpFailure(status: number, text: string): PlantQrUpsertResult {
  let json: PlantQrSuccessPayload & ParsedQrError = {} as PlantQrSuccessPayload & ParsedQrError
  if (text) {
    try {
      json = JSON.parse(text) as PlantQrSuccessPayload & ParsedQrError
    } catch {
      json = { error: text.slice(0, 280) } as PlantQrSuccessPayload & ParsedQrError
    }
  }
  logQrErrorDev(text, json, { httpStatus: status })
  const message = friendlyQrErrorMessage({
    httpStatus: status,
    bodyText: text,
    parsed: { error: json.error, code: json.code, hint: json.hint },
  })
  return { ok: false, message }
}

function normalizeSuccess(data: PlantQrSuccessPayload, plantId: string): PlantQrUpsertResult {
  if (data.plant_id) {
    return { ok: true, data }
  }
  return {
    ok: true,
    data: {
      ...data,
      plant_id: plantId,
    },
  }
}

/**
 * Calls plant-qr-upsert. Prefers supabase.functions.invoke (direct to Supabase + SDK auth headers)
 * so Netlify cannot strip Authorization. Falls back to fetch via Netlify proxy only on network errors.
 */
export async function requestPlantQrUpsert(plantId: string, mode: QrMode): Promise<PlantQrUpsertResult> {
  const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, '')
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!base || !anon) {
    return { ok: false, message: 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.' }
  }

  const authReady = await ensureAuthReadyForEdge()
  if (!authReady.ok) {
    return { ok: false, message: authReady.message }
  }

  await maybeProactiveRefresh()

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (import.meta.env.DEV) {
    console.debug('[VEERA QR] before invoke', {
      hasSession: !!session,
      hasAccessToken: !!session?.access_token,
      accessTokenLength: session?.access_token?.length ?? 0,
    })
  }
  if (!session?.access_token) {
    return {
      ok: false,
      message:
        'No access token available after sign-in check. Refresh the page and try again.',
    }
  }

  let outcome = await invokePlantQrUpsert(plantId, mode)

  if (outcome.kind === 'http' && outcome.status === 401) {
    const parsed = parseQrJson(outcome.text)
    if (shouldRetry401WithRefresh(outcome.status, parsed)) {
      const { data: ref } = await supabase.auth.refreshSession()
      if (import.meta.env.DEV) {
        console.debug('[VEERA QR] retry invoke after 401', { ok: !!ref.session?.access_token })
      }
      if (ref.session?.access_token) {
        outcome = await invokePlantQrUpsert(plantId, mode)
      }
    }
  }

  if (outcome.kind === 'ok') {
    return normalizeSuccess(outcome.data, plantId)
  }

  if (outcome.kind === 'http') {
    return resultFromHttpFailure(outcome.status, outcome.text)
  }

  // Network failure on direct invoke — try Netlify proxy path (same token)
  if (import.meta.env.DEV) {
    console.warn('[VEERA QR] invoke network error, trying proxy URL if configured:', outcome.message)
  }
  const proxyUrl = getEdgeFunctionUrl('plant-qr-upsert')
  const directUrl = `${base}/functions/v1/plant-qr-upsert`
  if (proxyUrl && proxyUrl !== directUrl) {
    const {
      data: { session: s2 },
    } = await supabase.auth.getSession()
    const token = s2?.access_token
    if (token) {
      let { res, text } = await postPlantQrUpsertFetch(proxyUrl, plantId, mode, token, anon)
      if (res.status === 401) {
        const parsed = parseQrJson(text)
        if (shouldRetry401WithRefresh(res.status, parsed)) {
          const { data: ref } = await supabase.auth.refreshSession()
          if (ref.session?.access_token) {
            const second = await postPlantQrUpsertFetch(proxyUrl, plantId, mode, ref.session.access_token, anon)
            res = second.res
            text = second.text
          }
        }
      }
      if (res.ok) {
        let json: PlantQrSuccessPayload & ParsedQrError = {} as PlantQrSuccessPayload & ParsedQrError
        if (text) {
          try {
            json = JSON.parse(text) as PlantQrSuccessPayload & ParsedQrError
          } catch {
            return resultFromHttpFailure(res.status, text)
          }
        }
        if (json.ok === true && json.qr_id) {
          return normalizeSuccess(json as PlantQrSuccessPayload, plantId)
        }
      }
      return resultFromHttpFailure(res.status, text)
    }
  }

  return {
    ok: false,
    message: `${outcome.message} If you are on a strict network, try another connection or contact support.`,
  }
}
