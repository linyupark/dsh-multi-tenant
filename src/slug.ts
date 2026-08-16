/**
 * Deterministic, path-safe slugs for project and user names.
 *
 * ASCII letters/digits survive lowercased; any other ASCII run collapses to a
 * single `-`; non-ASCII codepoints are hex-encoded so CJK names map to a
 * stable slug without leaking raw characters into directory names.
 */

const HEX = (cp: number): string => cp.toString(16)

/** Convert an arbitrary display name to a slug usable as a path segment. */
export function slug(name: string): string {
  let out = ''
  let dash = false
  for (const ch of name) {
    const cp = ch.codePointAt(0)!
    if ((cp >= 0x61 && cp <= 0x7a) || (cp >= 0x30 && cp <= 0x39)) {
      out += dash ? '-' + ch : ch
      dash = false
    } else if (cp >= 0x41 && cp <= 0x5a) {
      const lower = ch.toLowerCase()
      out += dash ? '-' + lower : lower
      dash = false
    } else if (cp > 0x7f) {
      out += dash ? '-' + HEX(cp) : HEX(cp)
      dash = false
    } else {
      dash = out.length > 0
    }
  }
  return out.length > 0 ? out : 'x'
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/

/** True when the string is already a canonical slug. */
export function isSlug(s: string): boolean {
  return SLUG_RE.test(s)
}
