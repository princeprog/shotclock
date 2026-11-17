// Matches the API's rule for league web addresses: lowercase letters, numbers and single hyphens, 3–60 characters.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function slugError(value: string) {
  if (value.length < 3) return 'Use at least 3 characters.'
  if (value.length > 60) return 'Use 60 characters or fewer.'
  if (!SLUG.test(value)) return 'Use lowercase letters, numbers and single hyphens, without a hyphen at the start or end.'
  return ''
}

// A starting suggestion; the API makes the first published address unique if this one is taken.
export function suggestSlug(name: string) {
  const base = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '')
  return base.length >= 3 ? base : base ? `league-${base}` : 'league'
}

export const websiteUrl = () => (process.env.NEXT_PUBLIC_WEBSITE_URL || 'http://localhost:3002').replace(/\/$/, '')
