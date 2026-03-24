/** URL-safe slug: lowercase, hyphenated */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Section key: stable id for mobile (alphanumeric + underscore) */
export function sectionKeyFromLabel(label: string): string {
  const base = slugify(label).replace(/-/g, '_')
  return base || 'section'
}
