import { describe, expect, it } from 'vitest'
import { slug, isSlug } from '../src/slug.ts'

describe('slug', () => {
  it('lowercases ascii and keeps alphanumerics', () => {
    expect(slug('Alice')).toBe('alice')
  })

  it('maps runs of unsafe ascii to single dashes', () => {
    expect(slug('A B_c')).toBe('a-b-c')
    expect(slug('  x  ')).toBe('x')
    expect(slug('a--b')).toBe('a-b')
  })

  it('encodes non-ascii codepoints as hex so CJK names stay deterministic', () => {
    // 张 = U+5F20, 三 = U+4E09
    expect(slug('张三')).toBe('5f204e09')
  })

  it('falls back to x when nothing usable remains', () => {
    expect(slug('---')).toBe('x')
    expect(slug('')).toBe('x')
  })

  it('isSlug accepts only the canonical slug charset', () => {
    expect(isSlug('abc-123')).toBe(true)
    expect(isSlug('Alice')).toBe(false)
    expect(isSlug('a b')).toBe(false)
    expect(isSlug('-abc')).toBe(false)
    expect(isSlug('')).toBe(false)
  })
})
