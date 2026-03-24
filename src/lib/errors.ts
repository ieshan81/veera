import type { PostgrestError } from '@supabase/supabase-js'

export function friendlyDbError(err: PostgrestError | null): string {
  if (!err) return 'Something went wrong.'
  if (err.code === '23505') {
    if (err.message.includes('plants_slug')) return 'This URL slug is already in use.'
    if (err.message.includes('plant_tags_slug')) return 'A tag with this slug already exists.'
    if (err.message.includes('plant_qr_codes_token')) return 'QR token collision — try again.'
    if (err.message.includes('plant_content_sections')) return 'This section key already exists for this plant.'
    return 'That value already exists — pick a different one.'
  }
  return err.message || 'Something went wrong.'
}
