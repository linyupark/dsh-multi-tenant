// @vitest-environment jsdom
/**
 * The access-mode chip lock for normal users:
 *  - isAccessModeLabel / accessModeTriggerSelector cover the stock client's
 *    aria-label templates in both shipped locales (zh/en) and reject others;
 *  - applyBodyRole raises/lowers the body role flag with the identity;
 *  - mountPermissionLockStyle injects the lock stylesheet idempotently and
 *    its rules pin the trigger (no menu) and hide the chevron while the
 *    role flag marks a normal user.
 *
 * jsdom's cascade does not re-evaluate these attribute-prefix selectors on
 * live mutation, so the computed-style behavior proof runs in the headless
 * end-to-end pass (real browser); here the rules are asserted textually.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  ACCESS_MODE_LABEL_PREFIXES,
  ROLE_ATTRIBUTE,
  accessModeTriggerSelector,
  applyBodyRole,
  isAccessModeLabel,
  mountPermissionLockStyle,
  permissionLockCss,
} from '../src/client/perm-lock.ts'

afterEach(() => {
  document.body.removeAttribute(ROLE_ATTRIBUTE)
  document.querySelector('style#projects-permission-lock')?.remove()
})

describe('isAccessModeLabel', () => {
  it('matches the aria-label template in every shipped locale', () => {
    expect(isAccessModeLabel('访问模式，当前：Workspace Write')).toBe(true)
    expect(isAccessModeLabel('Access mode, current: Workspace Write')).toBe(true)
    expect(isAccessModeLabel('访问模式，当前：Full Access')).toBe(true)
  })

  it('rejects unrelated labels', () => {
    expect(isAccessModeLabel('发送消息')).toBe(false)
    expect(isAccessModeLabel('Send message')).toBe(false)
    expect(isAccessModeLabel('')).toBe(false)
    // A label merely containing the prefix elsewhere must not match.
    expect(isAccessModeLabel('切换 访问模式，当前：X')).toBe(false)
  })

  it('keeps the selector in sync with the prefix list', () => {
    const expected = ACCESS_MODE_LABEL_PREFIXES.map((p) => `button[aria-label^="${p}"]`).join(', ')
    expect(accessModeTriggerSelector()).toBe(expected)
  })
})

describe('accessModeTriggerSelector', () => {
  it('selects the access-mode trigger button in the live DOM', () => {
    const chip = document.createElement('button')
    chip.setAttribute('aria-label', '访问模式，当前：Workspace Write')
    const send = document.createElement('button')
    send.setAttribute('aria-label', '发送消息')
    document.body.append(chip, send)
    expect(document.querySelector(accessModeTriggerSelector())).toBe(chip)
  })
})

describe('applyBodyRole', () => {
  it('raises the flag for users and lowers it otherwise', () => {
    applyBodyRole(document.body, 'user')
    expect(document.body.getAttribute(ROLE_ATTRIBUTE)).toBe('user')
    applyBodyRole(document.body, 'other')
    expect(document.body.hasAttribute(ROLE_ATTRIBUTE)).toBe(false)
  })

  it('tolerates a missing body', () => {
    expect(() => applyBodyRole(null, 'user')).not.toThrow()
  })
})

describe('mountPermissionLockStyle', () => {
  it('injects the lock rules once and disposes them', () => {
    const stop = mountPermissionLockStyle(document)
    const tag = document.querySelector('style#projects-permission-lock')
    expect(tag).not.toBeNull()
    const css = tag!.textContent ?? ''
    expect(css).toContain('body[data-dsh-projects-role="user"]')
    expect(css).toContain('button[aria-label^="访问模式"]')
    expect(css).toContain('button[aria-label^="Access mode"]')
    expect(css).toContain('pointer-events: none !important')
    expect(css).toContain('[class$="_chevron"]')
    expect(css).toContain('display: none !important')

    // A second mount reuses the same tag (idempotent), one disposer is enough.
    const stop2 = mountPermissionLockStyle(document)
    expect(document.querySelectorAll('style#projects-permission-lock')).toHaveLength(1)
    stop()
    stop2()
    expect(document.querySelector('style#projects-permission-lock')).toBeNull()
  })
})

describe('permissionLockCss shape', () => {
  it('emits one complete scoped rule per line (no comma-split rule lists)', () => {
    const css = permissionLockCss()
    const lines = css.split('\n').filter((l) => l.trim() !== '')
    expect(lines.length).toBe(ACCESS_MODE_LABEL_PREFIXES.length * 2)
    for (const rule of lines) {
      // Every rule carries its own body scope — a comma-joined selector would
      // leak the second locale segment outside the user role flag.
      expect(rule.trim().startsWith(`body[${ROLE_ATTRIBUTE}="user"] button[aria-label^="`)).toBe(true)
      expect(rule.trim().endsWith('}')).toBe(true)
      expect(rule).not.toContain(', ')
    }
  })

  it('never hides the trigger itself — only its interaction and chevron', () => {
    const css = permissionLockCss()
    for (const rule of css.split('\n')) {
      // display:none may only appear on the chevron rule, never the trigger.
      if (rule.includes('display: none')) expect(rule).toContain('_chevron')
      else expect(rule).not.toContain('display: none')
    }
  })
})
