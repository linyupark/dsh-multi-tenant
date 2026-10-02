/**
 * syncUserWorkspaces: the host-side glue that registers every user workspace
 * into the official workspaceRegistry, so the stock Web Client can open
 * sessions in them (and the restricted sidebar finds matching rows).
 */
import { describe, expect, it } from 'vitest'
import { forgetWorkspace, syncUserWorkspaces } from '../src/workspace-sync.ts'

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

/** Registry double with a durable list and a deletable id. */
class ListedRegistry {
  entries: Array<{ id: number; path: string }>
  deleted: number[] = []
  failIds = new Set<number>()
  unknownIds = new Set<number>()

  constructor(entries: Array<{ id: number; path: string }>) {
    this.entries = entries
  }

  async create(): Promise<unknown> {
    return {}
  }

  list(): ReadonlyArray<{ id: number; path: string }> {
    return this.entries
  }

  async delete(id: number): Promise<boolean> {
    if (this.failIds.has(id)) throw new Error('boom: ' + String(id))
    if (this.unknownIds.has(id)) return false
    this.deleted.push(id)
    return true
  }
}

describe('forgetWorkspace', () => {
  const realpath = async (p: string) => p

  it('removes the registration for the removed workspace', async () => {
    const registry = new ListedRegistry([
      { id: 1, path: '/ws/demo-bob' },
      { id: 2, path: '/ws/demo-alice' },
    ])
    expect(await forgetWorkspace({ path: '/ws/demo-bob', realpath, registry })).toBe(true)
    expect(registry.deleted).toEqual([1])
  })

  it('never touches a registration for a different path', async () => {
    const registry = new ListedRegistry([{ id: 1, path: '/ws/demo-alice' }])
    expect(await forgetWorkspace({ path: '/ws/demo-bob', realpath, registry })).toBe(false)
    expect(registry.deleted).toEqual([])
  })

  it('does not match a same-basename registration under another parent', async () => {
    // The canonical candidate is parent+basename, so a different parent must
    // never be mistaken for the directory that was removed.
    const registry = new ListedRegistry([{ id: 1, path: '/elsewhere/demo-bob' }])
    expect(await forgetWorkspace({ path: '/ws/demo-bob', realpath, registry })).toBe(false)
    expect(registry.deleted).toEqual([])
  })

  it('finds the registration when the parent is reached through a symlink', async () => {
    // The directory itself is already gone, so the canonical form is rebuilt
    // from the surviving parent.
    const registry = new ListedRegistry([{ id: 7, path: '/canonical/demo-bob' }])
    const viaSymlink = async (p: string) => (p === '/link' ? '/canonical' : p)
    expect(await forgetWorkspace({ path: '/link/demo-bob', realpath: viaSymlink, registry })).toBe(true)
    expect(registry.deleted).toEqual([7])
  })

  it('reports false when the registry did not actually delete anything', async () => {
    // An unknown id is an idempotent no-op there; claiming success would hide
    // a leaked registration.
    const registry = new ListedRegistry([{ id: 9, path: '/ws/demo-bob' }])
    registry.unknownIds.add(9)
    expect(await forgetWorkspace({ path: '/ws/demo-bob', realpath, registry })).toBe(false)
    expect(registry.deleted).toEqual([])
  })

  it('survives a failing delete, reporting it instead of throwing', async () => {
    const registry = new ListedRegistry([{ id: 3, path: '/ws/demo-bob' }])
    registry.failIds.add(3)
    const errors: string[] = []
    expect(await forgetWorkspace({
      path: '/ws/demo-bob',
      realpath,
      registry,
      onError: (e) => errors.push(String(e)),
    })).toBe(false)
    expect(errors).toHaveLength(1)
  })

  it('does nothing when the registry cannot list or delete', async () => {
    expect(await forgetWorkspace({ path: '/ws/x', realpath, registry: { create: async () => ({}) } })).toBe(false)
  })
})
