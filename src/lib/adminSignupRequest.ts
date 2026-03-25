import { getEdgeFunctionUrl } from '@/lib/edgeFunctionUrl'

export type AdminSignupBody = {
  email: string
  password: string
  question_ids: string[]
  answers: string[]
}

export type AdminSignupResult =
  | { ok: true; needsEmailConfirmation?: boolean }
  | { ok: false; message: string }

/**
 * Calls the admin-signup Edge Function via fetch (more reliable error messages than
 * supabase.functions.invoke, which often only reports "Failed to send a request…").
 */
export async function requestAdminSignup(body: AdminSignupBody): Promise<AdminSignupResult> {
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!anon) {
    return { ok: false, message: 'Missing VITE_SUPABASE_ANON_KEY.' }
  }

  const url = getEdgeFunctionUrl('admin-signup')
  if (!url) {
    return { ok: false, message: 'Missing VITE_SUPABASE_URL.' }
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anon}`,
        apikey: anon,
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    const hint =
      'Browser could not reach Supabase. Try: turn off VPN/ad-block for this tab, check Wi‑Fi, and confirm VITE_SUPABASE_URL matches your project (Settings → API).'
    if (err instanceof TypeError) {
      return { ok: false, message: `${hint} (${err.message})` }
    }
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Network error while contacting Supabase.',
    }
  }

  const text = await res.text()
  let json: { ok?: boolean; error?: string; needsEmailConfirmation?: boolean } = {}
  if (text) {
    try {
      json = JSON.parse(text) as { ok?: boolean; error?: string }
    } catch {
      json = { error: text.slice(0, 280) }
    }
  }

  if (res.status === 404) {
    return {
      ok: false,
      message:
        'admin-signup is not deployed (404). Open a terminal in this project and run: supabase link --project-ref YOUR_REF then supabase functions deploy admin-signup. Or deploy the function from the Supabase Dashboard → Edge Functions.',
    }
  }

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      message:
        'Supabase rejected the request (auth). Check that VITE_SUPABASE_ANON_KEY is the anon public key from Supabase → Settings → API, then redeploy Netlify after changing env vars.',
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
  if (json.ok === true) {
    return { ok: true, needsEmailConfirmation: json.needsEmailConfirmation === true }
  }

  return { ok: false, message: 'Unexpected response from admin-signup. Check Supabase Edge Function logs.' }
}
