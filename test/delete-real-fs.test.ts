/**
 * The deletion safety property, exercised against the REAL filesystem.
 *
 * `test/service.test.ts` drives an in-memory fake, whose `remove` trivially
 * cannot follow a symlink because its nodes have no content tree. The danger
 * being guarded here only exists on a real filesystem, where `rm -r` on a
 * symlink is a question of which syscall the runtime picks. So this file uses
 * `NodeFsPort` and a real temp directory: a user workspace is a directory of
 * symlinks into the project, and deleting it must leave the project intact.
 */
import { lstat, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectsService } from '../src/service.ts'
import { MemoryRepo } from '../src/repo.ts'
import { NodeFsPort } from '../src/fs-port.ts'

let root: string
let outside: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-mt-delete-'))
  outside = await mkdtemp(join(tmpdir(), 'dsh-mt-bound-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

async function service(): Promise<ProjectsService> {
  const svc = new ProjectsService({
    repo: new MemoryRepo(),
    fs: NodeFsPort,
    now: () => 1,
    root,
    tokenTtlMs: 3_600_000,
  })
  await svc.init()
  return svc
}

/** Does the path exist, following nothing? */
async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

describe('deleting a user against the real filesystem', () => {
  it('removes the workspace but never the project it links into', async () => {
    const svc = await service()
    await svc.createProject('app')
    const projectWs = join(root, 'app')
    const projectFile = join(projectWs, 'src', 'main.ts')
    await mkdir(join(projectWs, 'src'), { recursive: true })
    await writeFile(projectFile, 'PRECIOUS')
    // A nested directory with real content, linked as a whole.
    await mkdir(join(projectWs, 'deep', 'nested'), { recursive: true })
    await writeFile(join(projectWs, 'deep', 'nested', 'leaf.txt'), 'LEAF')

    const user = await svc.createUser('app', 'bob', 'pw')
    const userWs = user.workspacePath!

    // The workspace really is a directory of symlinks into the project.
    expect((await lstat(join(userWs, 'src'))).isSymbolicLink()).toBe(true)
    expect((await lstat(join(userWs, 'deep'))).isSymbolicLink()).toBe(true)

    await svc.disableUser('bob')
    const report = await svc.deleteUser('bob')

    expect(report.workspacesRemoved).toEqual([userWs])
    expect(await exists(userWs)).toBe(false)
    // The whole point: the project and its files are untouched.
    expect(await exists(projectWs)).toBe(true)
    expect(await readFile(projectFile, 'utf8')).toBe('PRECIOUS')
    expect(await readFile(join(projectWs, 'deep', 'nested', 'leaf.txt'), 'utf8')).toBe('LEAF')
  })

  it('leaves the project intact when the workspace symlink points at the project root itself', async () => {
    // A hand-made workspace whose single entry links the entire project dir:
    // deleting it must not walk into the project and empty it.
    const svc = await service()
    await svc.createProject('app')
    const projectWs = join(root, 'app')
    await writeFile(join(projectWs, 'keep.txt'), 'KEEP')

    const user = await svc.createUser('app', 'bob', 'pw')
    const userWs = user.workspacePath!
    await symlink(projectWs, join(userWs, 'whole-project'))

    await svc.disableUser('bob')
    await svc.deleteUser('bob')

    expect(await readFile(join(projectWs, 'keep.txt'), 'utf8')).toBe('KEEP')
    expect(await exists(projectWs)).toBe(true)
  })

  it('refuses to delete a workspace whose path is the plugin root', async () => {
    const repo = new MemoryRepo()
    const svc = new ProjectsService({
      repo,
      fs: NodeFsPort,
      now: () => 1,
      root,
      tokenTtlMs: 3_600_000,
    })
    await svc.init()
    await svc.createProject('app')
    await writeFile(join(root, 'app', 'keep.txt'), 'KEEP')
    const user = await svc.createUser('app', 'bob', 'pw')

    // Corrupt the record so the workspace path claims the root.
    const record = (await repo.get('users', user.slug)) as { workspacePath: string | null }
    record.workspacePath = root
    await repo.put('users', user.slug, record)

    await svc.disableUser('bob')
    const report = await svc.deleteUser('bob')

    expect(report.workspacesRemoved).toEqual([])
    expect(await exists(root)).toBe(true)
    expect(await readFile(join(root, 'app', 'keep.txt'), 'utf8')).toBe('KEEP')
  })

  it('refuses a record pointing at a SIBLING project', async () => {
    // Without an allow-list, a corrupt record one directory over would take the
    // neighbouring team's whole source tree with it.
    const repo = new MemoryRepo()
    const svc = new ProjectsService({ repo, fs: NodeFsPort, now: () => 1, root, tokenTtlMs: 3_600_000 })
    await svc.init()
    await svc.createProject('app')
    await svc.createProject('other')
    await writeFile(join(root, 'other', 'SOURCE.ts'), 'PRECIOUS')
    const user = await svc.createUser('app', 'bob', 'pw')

    const record = (await repo.get('users', user.slug)) as { workspacePath: string | null }
    record.workspacePath = join(root, 'other')
    await repo.put('users', user.slug, record)

    await svc.disableUser('bob')
    const report = await svc.deleteUser('bob')

    expect(report.workspacesRemoved).toEqual([])
    expect(await readFile(join(root, 'other', 'SOURCE.ts'), 'utf8')).toBe('PRECIOUS')
  })

  it('refuses a record pointing at ANOTHER user workspace', async () => {
    const repo = new MemoryRepo()
    const svc = new ProjectsService({ repo, fs: NodeFsPort, now: () => 1, root, tokenTtlMs: 3_600_000 })
    await svc.init()
    await svc.createProject('app')
    const bob = await svc.createUser('app', 'bob', 'pw')
    const carol = await svc.createUser('app', 'carol', 'pw')
    await writeFile(join(carol.workspacePath!, 'carol-note.txt'), 'CAROL')

    const record = (await repo.get('users', bob.slug)) as { workspacePath: string | null }
    record.workspacePath = carol.workspacePath
    await repo.put('users', bob.slug, record)

    await svc.disableUser('bob')
    const report = await svc.deleteUser('bob')

    expect(report.workspacesRemoved).toEqual([])
    expect(await readFile(join(carol.workspacePath!, 'carol-note.txt'), 'utf8')).toBe('CAROL')
  })

  it('refuses a record pointing OUTSIDE the plugin root', async () => {
    const repo = new MemoryRepo()
    const svc = new ProjectsService({ repo, fs: NodeFsPort, now: () => 1, root, tokenTtlMs: 3_600_000 })
    await svc.init()
    await svc.createProject('app')
    const victim = join(outside, 'victim')
    await mkdir(victim, { recursive: true })
    await writeFile(join(victim, 'IMPORTANT.txt'), 'IMPORTANT')
    const user = await svc.createUser('app', 'bob', 'pw')

    const record = (await repo.get('users', user.slug)) as { workspacePath: string | null }
    record.workspacePath = victim
    await repo.put('users', user.slug, record)

    await svc.disableUser('bob')
    expect((await svc.deleteUser('bob')).workspacesRemoved).toEqual([])
    expect(await readFile(join(victim, 'IMPORTANT.txt'), 'utf8')).toBe('IMPORTANT')
  })
})

describe('deleting a project against the real filesystem', () => {
  it('removes the project directory once its users are disabled', async () => {
    const svc = await service()
    await svc.createProject('app')
    await writeFile(join(root, 'app', 'keep.txt'), 'KEEP')
    const user = await svc.createUser('app', 'bob', 'pw')
    await svc.disableUser('bob')

    const report = await svc.deleteProject('app')
    expect(report.directoryRemoved).toBe(true)
    expect(await exists(join(root, 'app'))).toBe(false)
    expect(await exists(user.workspacePath!)).toBe(false)
  })

  it('keeps a directory the project was BOUND to', async () => {
    // The bound directory is the operator's real repository. Deleting the
    // project must clear the records and leave the directory standing.
    const repo = new MemoryRepo()
    const svc = new ProjectsService({
      repo,
      fs: NodeFsPort,
      now: () => 1,
      root,
      tokenTtlMs: 3_600_000,
    })
    await svc.init()
    const bound = join(outside, 'real-repo')
    await mkdir(bound, { recursive: true })
    await writeFile(join(bound, 'source.ts'), 'KEEP')
    await svc.createProject('bound', bound)

    const report = await svc.deleteProject('bound')
    expect(report.directoryRemoved).toBe(false)
    expect(report.keptDirectory).toBe(bound)
    expect(await readFile(join(bound, 'source.ts'), 'utf8')).toBe('KEEP')
    expect(await svc.listProjects()).toEqual([])
  })

  it('keeps a bound directory even when it has users with workspaces', async () => {
    const repo = new MemoryRepo()
    const svc = new ProjectsService({
      repo,
      fs: NodeFsPort,
      now: () => 1,
      root,
      tokenTtlMs: 3_600_000,
    })
    await svc.init()
    const bound = join(outside, 'real-repo')
    await mkdir(bound, { recursive: true })
    await writeFile(join(bound, 'source.ts'), 'KEEP')
    await svc.createProject('bound', bound)
    const user = await svc.createUser('bound', 'bob', 'pw')
    await svc.disableUser('bob')

    const report = await svc.deleteProject('bound')
    expect(report.usersDeleted).toEqual(['bound/bob'])
    expect(await exists(user.workspacePath!)).toBe(false)
    expect(report.directoryRemoved).toBe(false)
    expect(await readFile(join(bound, 'source.ts'), 'utf8')).toBe('KEEP')
  })

  it('refuses to BIND a project inside the plugin root', async () => {
    // Binding into the managed area puts an operator directory and a managed
    // one on paths that deletion cannot tell apart, so it is refused outright.
    const svc = await service()
    await mkdir(join(root, 'mine'), { recursive: true })
    await writeFile(join(root, 'mine', 'keep.txt'), 'KEEP')
    await expect(svc.createProject('mine', join(root, 'mine'))).rejects.toThrow(/根目录/)
    expect(await readFile(join(root, 'mine', 'keep.txt'), 'utf8')).toBe('KEEP')
  })

  it('refuses to bind a project to another project directory', async () => {
    const svc = await service()
    await svc.createProject('other')
    await writeFile(join(root, 'other', 'SOURCE.ts'), 'KEEP')
    await expect(svc.createProject('x', join(root, 'other'))).rejects.toThrow(/根目录/)
    // And the managed project still deletes only its own directory.
    const report = await svc.deleteProject('other')
    expect(report.directoryRemoved).toBe(true)
  })

  it('records provenance so a bound path is never treated as managed', async () => {
    const repo = new MemoryRepo()
    const svc = new ProjectsService({ repo, fs: NodeFsPort, now: () => 1, root, tokenTtlMs: 3_600_000 })
    await svc.init()
    await svc.createProject('created')
    const bound = join(outside, 'repo')
    await mkdir(bound, { recursive: true })
    await svc.createProject('bound', bound)

    expect((await repo.get('projects', 'created') as { managed?: boolean }).managed).toBe(true)
    expect((await repo.get('projects', 'bound') as { managed?: boolean }).managed).toBe(false)
  })

  it('still deletes a project record whose provenance predates the field', async () => {
    // Legacy records carry no `managed`; they fall back to the path check they
    // were created under, so nothing already deployed becomes undeletable.
    const repo = new MemoryRepo()
    const svc = new ProjectsService({ repo, fs: NodeFsPort, now: () => 1, root, tokenTtlMs: 3_600_000 })
    await svc.init()
    await svc.createProject('legacy')
    const record = (await repo.get('projects', 'legacy')) as { managed?: boolean }
    delete record.managed
    await repo.put('projects', 'legacy', record)

    const report = await svc.deleteProject('legacy')
    expect(report.directoryRemoved).toBe(true)
    expect(await exists(join(root, 'legacy'))).toBe(false)
  })
})