import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MemoryRepo, JsonFileRepo, StorageDomainRepo } from '../src/repo.ts'

describe('MemoryRepo', () => {
  it('round-trips records and lists them', async () => {
    const repo = new MemoryRepo()
    await repo.put('users', 'a', { name: 'alice' })
    await repo.put('users', 'b', { name: 'bob' })
    expect(await repo.get('users', 'a')).toEqual({ name: 'alice' })
    expect(await repo.list('users')).toEqual([
      ['a', { name: 'alice' }],
      ['b', { name: 'bob' }],
    ])
    expect(await repo.delete('users', 'a')).toBe(true)
    expect(await repo.delete('users', 'a')).toBe(false)
    expect(await repo.get('users', 'a')).toBeUndefined()
  })
})

describe('JsonFileRepo', () => {
  it('persists across instances with atomic replace', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-proj-repo-'))
    const file = join(dir, 'state.json')
    const a = new JsonFileRepo(file)
    await a.put('users', 'a', { name: 'alice' })
    await a.put('users', 'b', { name: 'bob' })
    const b = new JsonFileRepo(file)
    expect(await b.get('users', 'a')).toEqual({ name: 'alice' })
    expect((await b.list('users')).length).toBe(2)
  })

  it('survives a corrupt file by starting empty (fail soft, best effort)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-proj-repo-'))
    const file = join(dir, 'state.json')
    await writeFile(file, '{ not json', 'utf8')
    const repo = new JsonFileRepo(file)
    expect(await repo.list('users')).toEqual([])
    await repo.put('users', 'x', { ok: true })
    const raw = JSON.parse(await readFile(file, 'utf8'))
    expect(raw.users.x).toEqual({ ok: true })
  })
})

describe('StorageDomainRepo', () => {
  it('delegates to a domain handle', async () => {
    const tables = new Map<string, Map<string, unknown>>()
    const domain = {
      table: (name: string) => {
        if (!tables.has(name)) tables.set(name, new Map())
        const m = tables.get(name)!
        return {
          get: (k: string) => m.get(k),
          entries: () => m.entries(),
          put: async (k: string, v: unknown) => {
            m.set(k, v)
          },
          delete: async (k: string) => m.delete(k),
          update: async (k: string, fn: (c: unknown) => unknown) => {
            const cur = m.get(k)
            const next = fn(cur)
            m.set(k, next)
            return next
          },
        }
      },
      close: async () => {},
    }
    const repo = new StorageDomainRepo(domain as never)
    await repo.put('users', 'a', { name: 'alice' })
    expect(await repo.get('users', 'a')).toEqual({ name: 'alice' })
    expect(await repo.list('users')).toEqual([['a', { name: 'alice' }]])
  })
})
