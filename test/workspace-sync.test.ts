/**
 * syncUserWorkspaces: the host-side glue that registers every user workspace
 * into the official workspaceRegistry, so the stock Web Client can open
 * sessions in them (and the restricted sidebar finds matching rows).
 */
import { describe, expect, it } from 'vitest'
import { syncUserWorkspaces } from '../src/workspace-sync.ts'

/** Registry double recording create() calls. */
class FakeRegistry {
  calls: Array<{ path: string; title?: string }> = []
  failPaths = new Set<string>()
  async create(path: string, title?: string): Promise<{ path: string }> {
    if (this.failPaths.has(path)) throw new Error('boom: ' + path)
    this.calls.push({ path, title })
    return { path }
  }
}

describe('syncUserWorkspaces', () => {
  it('registers every user workspace path once, titled by slug', async () => {
    const registry = new FakeRegistry()
    const users = [
      { slug: 'bob', workspacePath: '/ws/demo-bob' },
      { slug: 'alice', workspacePath: '/ws/demo-alice' },
    ]
    const count = await syncUserWorkspaces(async () => users, registry)
    expect(count).toBe(2)
    expect(registry.calls).toEqual([
      { path: '/ws/demo-bob', title: 'bob' },
      { path: '/ws/demo-alice', title: 'alice' },
    ])
  })

  it('skips admin rows without a workspace and nulls', async () => {
    const registry = new FakeRegistry()
    const users = [
      { slug: 'admin', workspacePath: null },
      { slug: 'bob', workspacePath: '/ws/demo-bob' },
    ]
    await syncUserWorkspaces(async () => users, registry)
    expect(registry.calls.map((c) => c.path)).toEqual(['/ws/demo-bob'])
  })

  it('keeps going when one registration fails, reporting the failures', async () => {
    const registry = new FakeRegistry()
    registry.failPaths.add('/ws/demo-bob')
    const errors: string[] = []
    const users = [
      { slug: 'bob', workspacePath: '/ws/demo-bob' },
      { slug: 'alice', workspacePath: '/ws/demo-alice' },
    ]
    const count = await syncUserWorkspaces(async () => users, registry, (e) => errors.push(String(e)))
    expect(count).toBe(1)
    expect(registry.calls.map((c) => c.path)).toEqual(['/ws/demo-alice'])
    expect(errors).toHaveLength(1)
  })

  it('is idempotent from the caller side (registry dedupes by canonical path)', async () => {
    const registry = new FakeRegistry()
    const list = async () => [{ slug: 'bob', workspacePath: '/ws/demo-bob' }]
    await syncUserWorkspaces(list, registry)
    await syncUserWorkspaces(list, registry)
    expect(registry.calls).toHaveLength(2) // create() twice; registry reuses records
  })
})
