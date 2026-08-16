/**
 * The host-side permission lock for project users: every session whose cwd
 * bucket is a user workspace gets pinned (and re-pinned) to the locked
 * preset, and a per-agent `permission` command shadow rejects switches.
 */
import { describe, expect, it } from 'vitest'
import { LOCKED_PRESET, isProjectUserWorkspace, permissionLockResult } from '../src/permission-lock.ts'

describe('isProjectUserWorkspace', () => {
  const paths = ['/root/demo-bob', '/root/demo-alice']

  it('matches a cwd inside one of the user workspaces', () => {
    expect(isProjectUserWorkspace('/root/demo-bob', paths)).toBe(true)
    expect(isProjectUserWorkspace('/root/demo-bob/nested/deeper', paths)).toBe(true)
  })

  it('rejects cwds outside every user workspace', () => {
    expect(isProjectUserWorkspace('/root/demo', paths)).toBe(false)
    expect(isProjectUserWorkspace('/root/demo-bob-evil', paths)).toBe(false)
    expect(isProjectUserWorkspace('/elsewhere', paths)).toBe(false)
  })

  it('treats a missing cwd as not a project user session', () => {
    expect(isProjectUserWorkspace(undefined, paths)).toBe(false)
  })

  it('defeats .. traversal against a user workspace path', () => {
    expect(isProjectUserWorkspace('/root/demo-bob/../../demo', paths)).toBe(false)
  })
})

describe('permissionLockResult', () => {
  it('answers a bare query with the locked preset', () => {
    const result = permissionLockResult('')
    expect(result.kind).toBe('success')
    expect(result.text).toContain(LOCKED_PRESET)
  })

  it('is idempotent when the locked preset is re-selected', () => {
    const result = permissionLockResult(LOCKED_PRESET)
    expect(result.kind).toBe('success')
  })

  it('rejects any other preset', () => {
    const result = permissionLockResult('read-only')
    expect(result.kind).toBe('error')
    expect(result.text).toContain(LOCKED_PRESET)
  })

  it('rejects other presets after trimming whitespace', () => {
    expect(permissionLockResult('  danger-full-access  ').kind).toBe('error')
  })
})
