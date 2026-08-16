/**
 * Deterministic, path-safe slugs for project and user names.
 *
 * ASCII letters/digits survive lowercased; any other ASCII run collapses to a
 * single `-`; non-ASCII codepoints are hex-encoded so CJK names map to a
 * stable slug without leaking raw characters into directory names.
 */
/** Convert an arbitrary display name to a slug usable as a path segment. */
export declare function slug(name: string): string;
/** True when the string is already a canonical slug. */
export declare function isSlug(s: string): boolean;
