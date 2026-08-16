/**
 * Repository port over four logical tables: projects / users / tokens / roles.
 *
 * Three adapters share the interface: MemoryRepo (tests), JsonFileRepo
 * (dependency-free fallback persisted under the harness home) and
 * StorageDomainRepo (preferred — wraps a `ctx.storageDomain` handle so the
 * records land in the official typed domain storage when the composition
 * provides it).
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** Table names of the projects domain. */
export type RepoTable = 'projects' | 'users' | 'tokens' | 'roles'

/** Storage port used by the service. */
export interface Repo {
  get(table: RepoTable, key: string): Promise<unknown | undefined>
  put(table: RepoTable, key: string, value: unknown): Promise<void>
  delete(table: RepoTable, key: string): Promise<boolean>
  list(table: RepoTable): Promise<Array<[string, unknown]>>
  close?(): Promise<void>
}

/** In-memory adapter for tests. */
export class MemoryRepo implements Repo {
  private tables = new Map<string, Map<string, unknown>>()

  private table(name: string): Map<string, unknown> {
    let m = this.tables.get(name)
    if (!m) {
      m = new Map()
      this.tables.set(name, m)
    }
    return m
  }

  async get(table: RepoTable, key: string) {
    return this.table(table).get(key)
  }

  async put(table: RepoTable, key: string, value: unknown) {
    this.table(table).set(key, value)
  }

  async delete(table: RepoTable, key: string) {
    return this.table(table).delete(key)
  }

  async list(table: RepoTable) {
    return [...this.table(table).entries()]
  }
}

type Persisted = Partial<Record<RepoTable, Record<string, unknown>>>

/** JSON-file adapter with atomic tmp+rename writes. */
export class JsonFileRepo implements Repo {
  private data: Persisted = {}
  private loaded = false
  private writing: Promise<void> = Promise.resolve()

  constructor(private readonly file: string) {}

  private async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    try {
      const raw = await readFile(this.file, 'utf8')
      const parsed = JSON.parse(raw) as Persisted
      if (parsed && typeof parsed === 'object') this.data = parsed
    } catch {
      this.data = {}
    }
  }

  private persist(): Promise<void> {
    // serialize writes through a promise chain to keep them ordered
    this.writing = this.writing.then(async () => {
      await mkdir(dirname(this.file), { recursive: true })
      const tmp = this.file + '.tmp'
      await writeFile(tmp, JSON.stringify(this.data), 'utf8')
      await rename(tmp, this.file)
    })
    return this.writing
  }

  async get(table: RepoTable, key: string) {
    await this.load()
    return this.data[table]?.[key]
  }

  async put(table: RepoTable, key: string, value: unknown) {
    await this.load()
    const t = (this.data[table] ??= {})
    t[key] = value
    await this.persist()
  }

  async delete(table: RepoTable, key: string) {
    await this.load()
    const t = this.data[table]
    if (!t || !(key in t)) return false
    delete t[key]
    await this.persist()
    return true
  }

  async list(table: RepoTable) {
    await this.load()
    return Object.entries(this.data[table] ?? {})
  }
}

/** Structural type of a storage-domain table handle we rely on. */
interface DomainTableLike {
  get(key: string): unknown
  entries(): IterableIterator<[string, unknown]>
  put(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<boolean>
}

/** Structural type of the domain handle returned by `storageDomain.open`. */
export interface DomainHandleLike {
  table(name: string): DomainTableLike
  close(): Promise<void>
}

/** Adapter over a `ctx.storageDomain` handle (the official typed storage). */
export class StorageDomainRepo implements Repo {
  constructor(private readonly domain: DomainHandleLike) {}

  private table(name: RepoTable): DomainTableLike {
    return this.domain.table(name)
  }

  async get(table: RepoTable, key: string) {
    return this.table(table).get(key)
  }

  async put(table: RepoTable, key: string, value: unknown) {
    await this.table(table).put(key, value)
  }

  async delete(table: RepoTable, key: string) {
    return this.table(table).delete(key)
  }

  async list(table: RepoTable) {
    return [...this.table(table).entries()]
  }

  close(): Promise<void> {
    return this.domain.close()
  }
}
