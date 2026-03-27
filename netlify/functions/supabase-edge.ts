import type { Handler, HandlerEvent } from '@netlify/functions'

/** Netlify / Lambda may normalize header names; some clients send Authorization. */
function getIncomingAuthorization(event: HandlerEvent): string {
  const h = event.headers ?? {}
  for (const key of Object.keys(h)) {
    if (key.toLowerCase() === 'authorization') {
      const v = h[key]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
  }
  const mv = (event as { multiValueHeaders?: Record<string, string[] | undefined> }).multiValueHeaders
  if (mv) {
    for (const key of Object.keys(mv)) {
      if (key.toLowerCase() === 'authorization') {
        const arr = mv[key]
        const first = Array.isArray(arr) ? arr[0] : undefined
        if (typeof first === 'string' && first.trim()) return first.trim()
      }
    }
  }
  return ''
}

function decodeBody(event: HandlerEvent): string {
  const raw = event.body ?? '{}'
  if (event.isBase64Encoded) {
    try {
      return Buffer.from(raw, 'base64').toString('utf8')
    } catch {
      return raw
    }
  }
  return raw
}

/**
 * Forwards POST to https://<project>.supabase.co/functions/v1/<fn> with the same
 * Authorization + body. Requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Netlify env.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const fn = event.queryStringParameters?.fn ?? ''
  if (!fn || !/^[\w-]+$/.test(fn)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid fn query (e.g. plant-qr-upsert).' }) }
  }

  const base = process.env.VITE_SUPABASE_URL?.replace(/\/+$/, '')
  const anon = process.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!base || !anon) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error:
          'Netlify: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (same as the Vite build) on this site.',
      }),
    }
  }

  const auth = getIncomingAuthorization(event)
  if (!auth) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Missing Authorization header (proxy did not receive it from the browser)',
        code: 'PROXY_MISSING_AUTHORIZATION',
      }),
    }
  }

  const url = `${base}/functions/v1/${fn}`
  const body = decodeBody(event)

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
        apikey: anon,
      },
      body,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Upstream fetch failed'
    return { statusCode: 502, body: JSON.stringify({ error: msg }) }
  }

  const text = await res.text()

  if (res.status === 404) {
    const ct = res.headers.get('Content-Type') ?? ''
    if (ct.includes('application/json') && text) {
      try {
        JSON.parse(text)
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json' },
          body: text,
        }
      } catch {
        /* fall through: HTML or plain 404 from gateway */
      }
    }
    const bodyOut = JSON.stringify({
      error: 'Edge Function not found',
      code: 'NOT_DEPLOYED',
      hint:
        'Deploy this function to the Supabase project that matches VITE_SUPABASE_URL: supabase functions deploy ' +
        fn,
    })
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: bodyOut,
    }
  }

  return {
    statusCode: res.status,
    headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
    body: text,
  }
}
