/**
 * Password hashing (scrypt, random salt) and token minting.
 *
 * Envelope format: `scrypt$<saltHex>$<hashHex>`. Verification never throws —
 * malformed envelopes simply fail closed. Tokens are random 32-byte hex
 * strings; only their sha256 fingerprint is persisted.
 */
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'

const KEYLEN = 32

/** Hash a password into a self-describing scrypt envelope. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, KEYLEN)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

/** Verify a password against an envelope; false for anything malformed. */
export function verifyPassword(password: string, envelope: string): boolean {
  const parts = envelope.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = Buffer.from(parts[1]!, 'hex')
  const expected = Buffer.from(parts[2]!, 'hex')
  if (salt.length === 0 || expected.length !== KEYLEN) return false
  const actual = scryptSync(password, salt, KEYLEN)
  return timingSafeEqual(actual, expected)
}

/** Mint a fresh 64-hex-char bearer token. */
export function newToken(): string {
  return randomBytes(32).toString('hex')
}

/** sha256 fingerprint of a token — the only form persisted at rest. */
export function tokenFingerprint(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
