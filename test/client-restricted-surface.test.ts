/**
 * The restricted-surface stylesheet: a normal user must not see the sidebar's
 * Plugins panel button, which installs bundles and can disable this plugin.
 */
import { describe, expect, it } from 'vitest'
import {
  PLUGINS_PANEL_ID,
  PLUGINS_PANEL_LABELS,
  RESTRICTED_SURFACE_STYLE_ID,
  mountRestrictedSurfaceStyle,
  restrictedSurfaceCss,
} from '../src/client/restricted-surface.ts'
import { ROLE_ATTRIBUTE } from '../src/client/perm-lock.ts'

describe('restrictedSurfaceCss', () => {
  it('scopes every rule to the signed-in normal user', () => {
    const rules = restrictedSurfaceCss().split('\n')
    expect(rules).toHaveLength(PLUGINS_PANEL_LABELS.length)
    for (const rule of rules) expect(rule).toContain(`body[${ROLE_ATTRIBUTE}="user"]`)
  })

  it('hides the Plugins button in each shipped locale', () => {
    const css = restrictedSurfaceCss()
    for (const label of PLUGINS_PANEL_LABELS) {
      expect(css).toContain(`button[aria-label="${label}"] { display: none !important; }`)
    }
  })

  it('wins regardless of stock style injection order', () => {
    for (const rule of restrictedSurfaceCss().split('\n')) expect(rule).toContain('!important')
  })

  it('addresses the panel id the plugin manager occupies', () => {
    expect(PLUGINS_PANEL_ID).toBe('plugins')
  })
})

describe('mountRestrictedSurfaceStyle', () => {
  const fakeDoc = () => {
    const tags: Array<{ id: string; textContent: string; remove(): void }> = []
    return {
      tags,
      head: { append: (tag: (typeof tags)[number]) => { tags.push(tag) } },
      querySelector: (selector: string) => {
        const id = selector.replace(/^style#/, '')
        return tags.find((tag) => tag.id === id) ?? null
      },
      createElement: () => ({ id: '', textContent: '', remove() { tags.splice(tags.indexOf(this as never), 1) } }),
    }
  }

  it('injects one style tag and is idempotent', () => {
    const doc = fakeDoc()
    const first = mountRestrictedSurfaceStyle(doc as never)
    expect(doc.tags).toHaveLength(1)
    expect(doc.tags[0]!.id).toBe(RESTRICTED_SURFACE_STYLE_ID)
    mountRestrictedSurfaceStyle(doc as never)
    expect(doc.tags).toHaveLength(1)
    first()
    expect(doc.tags).toHaveLength(0)
  })
})