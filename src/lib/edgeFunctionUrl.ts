/**
 * Resolves the URL for a Supabase Edge Function.
 * When VITE_NETLIFY_EDGE_PROXY=true (set in netlify.toml for Netlify builds), requests go
 * through /.netlify/functions/supabase-edge so the browser stays same-origin (avoids many
 * "Failed to fetch" issues). Local `npm run dev` uses direct *.supabase.co URLs.
 */
export function getEdgeFunctionUrl(functionName: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, '')
  if (!base) return ''

  const useProxy = import.meta.env.VITE_NETLIFY_EDGE_PROXY === 'true'
  if (useProxy && typeof window !== 'undefined') {
    return `${window.location.origin}/.netlify/functions/supabase-edge?fn=${encodeURIComponent(functionName)}`
  }
  return `${base}/functions/v1/${functionName}`
}
