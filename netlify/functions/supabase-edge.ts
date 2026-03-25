import type { Handler } from '@netlify/functions'

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

  const auth = event.headers.authorization ?? event.headers.Authorization ?? ''
  if (!auth) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Missing Authorization header' }) }
  }

  const url = `${base}/functions/v1/${fn}`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
        apikey: anon,
      },
      body: event.body ?? '{}',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Upstream fetch failed'
    return { statusCode: 502, body: JSON.stringify({ error: msg }) }
  }

  const text = await res.text()
  return {
    statusCode: res.status,
    headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
    body: text,
  }
}
