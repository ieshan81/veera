/** Maps Edge / HTTP errors to admin-friendly copy. Raw details go to console in dev. */

export function friendlyQrErrorMessage(params: {
  httpStatus: number
  bodyText: string
  parsed: { error?: string; code?: string; hint?: string }
}): string {
  const { httpStatus, bodyText, parsed } = params
  const code = parsed.code ?? ''
  const combined = `${bodyText} ${parsed.error ?? ''}`.toLowerCase()

  if (httpStatus === 404) {
    if (code === 'PLANT_NOT_FOUND') {
      return 'That plant was not found. Refresh the page or return to the plant list.'
    }
    if (code === 'NOT_DEPLOYED') {
      return 'QR service is not deployed yet. Deploy plant-qr-upsert to the same Supabase project as this site (see README).'
    }
    return 'QR service is not deployed yet, or the request failed. Deploy plant-qr-upsert to the Supabase project that matches VITE_SUPABASE_URL.'
  }

  if (httpStatus === 401) {
    return 'You are not signed in or your session expired. Please sign in again and retry generating the QR code.'
  }

  if (httpStatus === 403 || code === 'FORBIDDEN') {
    return 'You do not have permission to generate QR codes. You need an admin or super_admin role.'
  }

  if (httpStatus === 400) {
    return parsed.error ?? 'Invalid request. Refresh the page and try again.'
  }

  if (code === 'STORAGE_UPLOAD' || combined.includes('storage') || combined.includes('bucket')) {
    return 'QR image could not be saved to storage. Check the plant-qr bucket and storage policies in Supabase.'
  }

  if (code === 'DB_UPSERT' || code === 'ROLE_CHECK' || combined.includes('duplicate') || combined.includes('constraint')) {
    return 'QR record could not be updated in the database. Check Supabase logs or try again.'
  }

  if (code === 'QR_RENDER') {
    return 'QR image could not be generated. Try again or contact support if this persists.'
  }

  if (httpStatus === 502 || httpStatus === 503) {
    return 'Could not reach the QR service. Try again in a moment.'
  }

  if (httpStatus >= 500) {
    return 'QR generation failed on the server. Check Supabase Edge Function logs for details.'
  }

  return parsed.error ?? 'QR generation failed. Try again or use Retry on the plant page.'
}

export function logQrErrorDev(raw: string, parsed: unknown): void {
  if (import.meta.env.DEV) {
    console.warn('[VEERA QR]', raw, parsed)
  }
}
