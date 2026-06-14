// ============================================================
// Slug helpers — node names round-trip to filesystem folders as
// "<slug>.<kind>". A slug is a terse, fs-safe token; case is kept
// so camelCase names (e.g. "proofA") survive. Slugs must be unique
// among their siblings (one folder per name in a directory).
// ============================================================

/** Sanitize a node name into a terse, filesystem-safe slug (case preserved). */
export function slugifyName(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-') // anything unsafe (incl. dots, spaces) → dash
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'node'
}

/** Return `base`, or `base-2`, `base-3`, … so it doesn't collide with `taken`. */
export function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  let i = 2
  while (taken.has(`${base}-${i}`)) i += 1
  return `${base}-${i}`
}
