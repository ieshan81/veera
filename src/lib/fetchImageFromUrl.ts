/**
 * Download an image from an https URL in the browser for upload to Supabase Storage.
 * May fail if the remote server blocks cross-origin requests (CORS).
 */

function extFromMime(mime: string): string {
  const m = mime.toLowerCase()
  if (m.includes('jpeg') || m === 'image/jpg') return 'jpg'
  if (m.includes('png')) return 'png'
  if (m.includes('webp')) return 'webp'
  if (m.includes('gif')) return 'gif'
  if (m.includes('avif')) return 'avif'
  if (m.includes('svg')) return 'svg'
  return 'jpg'
}

function isImageMime(mime: string): boolean {
  return /^image\//i.test(mime.trim())
}

export type FetchedImageBlob = {
  blob: Blob
  /** File extension without dot, for storage path */
  ext: string
}

/**
 * Fetches an image URL and returns a Blob suitable for storage upload.
 * @throws Error with user-facing message on validation or network failure
 */
export async function fetchImageBlobFromUrl(rawUrl: string): Promise<FetchedImageBlob> {
  const trimmed = rawUrl.trim()
  if (!trimmed) {
    throw new Error('Enter an image URL.')
  }

  let u: URL
  try {
    u = new URL(trimmed)
  } catch {
    throw new Error('Invalid URL.')
  }

  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new Error('Only http(s) image links are allowed.')
  }

  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && u.protocol === 'http:') {
    throw new Error('Use an https:// image link, or upload a file instead.')
  }

  let res: Response
  try {
    res = await fetch(trimmed, { mode: 'cors', credentials: 'omit', cache: 'no-store' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || e instanceof TypeError) {
      throw new Error(
        'Could not load this URL in the browser (often a CORS block). Download the image and use file upload, or use a direct image URL from a host that allows cross-origin access.',
      )
    }
    throw new Error('Could not download the image. Try file upload instead.')
  }

  if (!res.ok) {
    throw new Error(`Could not download image (HTTP ${res.status}).`)
  }

  const headerCt = res.headers.get('content-type')?.split(';')[0]?.trim() ?? ''
  const blob = await res.blob()

  if (blob.size === 0) {
    throw new Error('Downloaded file is empty.')
  }

  const type = blob.type || headerCt
  if (!isImageMime(type)) {
    throw new Error('URL did not return an image (expected image/* content type). Check the link points to a .jpg, .png, etc.')
  }

  const ext = extFromMime(type)
  return { blob, ext }
}
