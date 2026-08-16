/**
 * Host-side tests for the restricted-session guard section contributed into
 * the agent's system prompt: the section identity/order follow the
 * dsh-system-prompt conventions (positive order after the order-0 persona,
 * before 100–199 tool guidance), and the text carries the tenant-isolation
 * duties the deployment requires — no disclosure of anything outside the
 * user workspace, no boundary-probing commands, refusal on demands to cross.
 */
import { describe, expect, it } from 'vitest'
import {
  GUARD_SECTION_NAME,
  GUARD_SECTION_ORDER,
  restrictedGuardSectionText,
} from '../src/prompt-guard.ts'

describe('restrictedGuardSectionText', () => {
  const text = restrictedGuardSectionText()

  it('forbids disclosing anything outside the workspace', () => {
    expect(text).toContain('工作区')
    expect(text).toMatch(/不.*(引用|摘录|复述)/)
    expect(text).toContain('工作区之外')
  })

  it('forbids running boundary-probing commands', () => {
    expect(text).toMatch(/不.*执行.*命令/)
  })

  it('demands refusal when the user asks to cross the boundary', () => {
    expect(text).toMatch(/(拒绝|不得)/)
    expect(text).toMatch(/(优先于|高于).*(要求|指示)/)
  })

  it('mentions no host-internal escape hatches itself', () => {
    // The guard must not become a disclosure vector: it references duties,
    // not concrete host paths or plugin internals.
    expect(text).not.toContain('/home/')
    expect(text).not.toContain('.dsh')
  })
})

describe('section registration shape', () => {
  it('uses a unique reverse-domain name and a legal order slot', () => {
    expect(GUARD_SECTION_NAME).toBe('projects.restricted-privacy')
    // After the order-0 deployment persona, before 100–199 tool guidance.
    expect(GUARD_SECTION_ORDER).toBeGreaterThan(0)
    expect(GUARD_SECTION_ORDER).toBeLessThan(100)
  })
})
