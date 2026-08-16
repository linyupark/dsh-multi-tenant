import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword, newToken, tokenFingerprint } from '../src/crypto.ts'

describe('password hashing (scrypt)', () => {
  it('produces a parseable scrypt envelope and verifies the right password', () => {
    const h = hashPassword('correct horse')
    expect(h).toMatch(/^scrypt\$[0-9a-f]+\$[0-9a-f]+$/)
    expect(verifyPassword('correct horse', h)).toBe(true)
  })

  it('rejects wrong passwords', () => {
    const h = hashPassword('correct horse')
    expect(verifyPassword('wrong', h)).toBe(false)
  })

  it('salts randomly: same password hashes differently but both verify', () => {
    const a = hashPassword('pw')
    const b = hashPassword('pw')
    expect(a).not.toBe(b)
    expect(verifyPassword('pw', a)).toBe(true)
    expect(verifyPassword('pw', b)).toBe(true)
  })

  it('rejects malformed envelopes instead of throwing', () => {
    expect(verifyPassword('pw', 'garbage')).toBe(false)
    expect(verifyPassword('pw', 'scrypt$zz$zz')).toBe(false)
  })
})

describe('tokens', () => {
  it('mints 64-char hex tokens', () => {
    const t = newToken()
    expect(t).toMatch(/^[0-9a-f]{64}$/)
  })

  it('fingerprints deterministically via sha256 and never equals the token', () => {
    const t = newToken()
    const f = tokenFingerprint(t)
    expect(f).toMatch(/^[0-9a-f]{64}$/)
    expect(f).not.toBe(t)
    expect(tokenFingerprint(t)).toBe(f)
  })
})
