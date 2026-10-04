import { describe, expect, it, beforeEach } from 'vitest'
import { ProjectsService } from '../src/service.ts'
import { MemoryRepo, type Repo } from '../src/repo.ts'
import type { FsPort } from '../src/fs-port.ts'

/** In-memory fs fake with dir/file/symlink nodes. */
class MemFs implements FsPort {
  nodes = new Map<string, { type: 'dir' | 'file' | 'symlink'; target?: string; content?: string }>()

  constructor(public root = '/ws') {
    this.nodes.set(root, { type: 'dir' })
  }

  async mkdir(path: string): Promise<void> {
    const parts = path.split('/').filter(Boolean)
    let cur = ''
    for (const p of parts) {
      cur += '/' + p
      const node = this.nodes.get(cur)
      if (node && node.type !== 'dir') throw new Error('not a dir: ' + cur)
      if (!node) this.nodes.set(cur, { type: 'dir' })
    }
  }

  async readdir(path: string): Promise<string[]> {
    const names: string[] = []
    for (const key of this.nodes.keys()) {
      if (!key.startsWith(path + '/')) continue
      const rest = key.slice(path.length + 1)
      if (rest.includes('/')) continue
      names.push(rest)
    }
    return names
  }

  async symlink(target: string, path: string): Promise<void> {
    this.nodes.set(path, { type: 'symlink', target })
  }

  async readlink(path: string): Promise<string> {
    const n = this.nodes.get(path)
    if (!n || n.type !== 'symlink') throw new Error('not a symlink')
    return n.target!
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.nodes.set(path, { type: 'file', content })
  }

  async readFile(path: string): Promise<string> {
    const n = this.nodes.get(path)
    if (!n || n.type !== 'file') throw new Error('no file: ' + path)
    return n.content!
  }

  async exists(path: string): Promise<boolean> {
    return this.nodes.has(path)
  }

  /**
   * Remove a node and, for a directory, its descendants.
   *
   * Mirrors the property the real adapter relies on: a symlink node is deleted
   * itself and its target is never touched — a user workspace is a directory of
   * symlinks into the project, so following them would delete the project.
   */
  async remove(path: string): Promise<void> {
    this.nodes.delete(path)
    for (const key of this.nodes.keys()) {
      if (key.startsWith(path + '/')) this.nodes.delete(key)
    }
  }

  async realpath(path: string): Promise<string> {
    if (!this.nodes.has(path)) throw new Error('no such path: ' + path)
    return path
  }
}

const NOW = 1_000_000
const clock = { now: () => NOW, advance(ms: number) { this.now = () => NOW + ms } }

function makeService(opts?: { repo?: Repo; adminPassword?: string }) {
  const fs = new MemFs()
  const svc = new ProjectsService({
    repo: opts?.repo ?? new MemoryRepo(),
    fs,
    now: () => clock.now(),
    root: '/ws',
    tokenTtlMs: 60 * 60 * 1000,
    adminPassword: opts?.adminPassword,
  })
  return { fs, svc }
}

beforeEach(() => {
  clock.now = () => NOW
})

describe('bootstrap', () => {
  it('seeds roles and a bootstrap admin when the store is empty', async () => {
    const { svc } = makeService({ adminPassword: 'rootpw' })
    await svc.init()
    const session = await svc.login('admin', 'rootpw')
    expect(session.user.role).toBe('admin')
  })

  it('does not create an admin when no adminPassword is configured', async () => {
    const { svc } = makeService()
    await svc.init()
    await expect(svc.login('admin', 'x')).rejects.toThrow(/用户名或密码/)
  })
})

describe('projects', () => {
  it('creates the project workspace directory', async () => {
    const { fs, svc } = makeService()
    await svc.init()
    const p = await svc.createProject('My App')
    expect(p.slug).toBe('my-app')
    expect(await fs.exists('/ws/my-app')).toBe(true)
  })

  it('rejects duplicate project slugs', async () => {
    const { svc } = makeService()
    await svc.init()
    await svc.createProject('My App')
    await expect(svc.createProject('my app')).rejects.toThrow(/已存在/)
  })

  it('binds an existing directory when workspacePath is given', async () => {
    const { fs, svc } = makeService()
    fs.nodes.set('/elsewhere/proj', { type: 'dir' })
    await svc.init()
    const project = await svc.createProject('demo', '/elsewhere/proj')
    expect(project.workspacePath).toBe('/elsewhere/proj')
    // no directory is created under the plugin root for a bound project
    expect(fs.nodes.has('/ws/demo')).toBe(false)
    const projects = await svc.listProjects()
    expect(projects[0]).toMatchObject({ slug: 'demo', workspacePath: '/elsewhere/proj' })
  })

  it('rejects a relative bound workspace path', async () => {
    const { svc } = makeService()
    await svc.init()
    await expect(svc.createProject('demo', 'elsewhere/proj')).rejects.toThrow(/绝对路径/)
  })

  it('rejects a bound workspace path that does not exist', async () => {
    const { svc } = makeService()
    await svc.init()
    await expect(svc.createProject('demo', '/elsewhere/missing')).rejects.toThrow(/不存在/)
  })

  it('users of a bound project symlink from the bound directory', async () => {
    const { fs, svc } = makeService()
    fs.nodes.set('/elsewhere/proj', { type: 'dir' })
    fs.nodes.set('/elsewhere/proj/spec.md', { type: 'file', content: 'x' })
    await svc.init()
    await svc.createProject('demo', '/elsewhere/proj')
    const user = await svc.createUser('demo', 'bob', 'pw')
    // The avatar workspace sits BESIDE the bound project directory.
    expect(user.workspacePath).toBe('/elsewhere/proj-bob')
    expect(await fs.readlink('/elsewhere/proj-bob/spec.md')).toBe('/elsewhere/proj/spec.md')
  })

  it('allows the same user name across different projects', async () => {
    const { svc } = makeService()
    await svc.init()
    await svc.createProject('alpha')
    await svc.createProject('beta')
    const a = await svc.createUser('alpha', 'bob', 'pw-a')
    const b = await svc.createUser('beta', 'bob', 'pw-b')
    expect(a.workspacePath).not.toBe(b.workspacePath)
    // A same-name user within ONE project is still rejected.
    await expect(svc.createUser('alpha', 'bob', 'pw2')).rejects.toThrow(/已存在/)
  })

  it('logs in an ambiguous name via project/name and reports ambiguity otherwise', async () => {
    const { svc } = makeService()
    await svc.init()
    await svc.createProject('alpha')
    await svc.createProject('beta')
    await svc.createUser('alpha', 'bob', 'pw-a')
    await svc.createUser('beta', 'bob', 'pw-b')
    await expect(svc.login('bob', 'nope')).rejects.toThrow(/重名/)
    const session = await svc.login('alpha/bob', 'pw-a')
    expect(session.user.name).toBe('bob')
    expect(session.user.projectSlug).toBe('alpha')
  })

  it('logs in a unique user name without the project prefix', async () => {
    const { svc } = makeService()
    await svc.init()
    await svc.createProject('alpha')
    await svc.createUser('alpha', 'carol', 'pw')
    const session = await svc.login('carol', 'pw')
    expect(session.user.name).toBe('carol')
  })

  it('disableUser accepts the project/name form for shared names', async () => {
    const { svc } = makeService()
    await svc.init()
    await svc.createProject('alpha')
    await svc.createProject('beta')
    await svc.createUser('alpha', 'bob', 'pw-a')
    await svc.createUser('beta', 'bob', 'pw-b')
    await svc.disableUser('alpha/bob')
    await expect(svc.login('alpha/bob', 'pw-a')).rejects.toThrow(/禁用/)
    const session = await svc.login('beta/bob', 'pw-b')
    const authed = await svc.authenticate(session.token)
    expect(authed.name).toBe('bob')
    expect(authed.projectSlug).toBe('beta')
  })
})

describe('users', () => {
  async function seeded() {
    const ctx = makeService()
    await ctx.svc.init()
    await ctx.svc.createProject('app')
    return ctx
  }

  it('creates user workspace with symlinks into the project and an AGENTS.md', async () => {
    const { fs, svc } = await seeded()
    // project grows some entries before the user is created
    await fs.mkdir('/ws/app/src')
    await fs.writeFile('/ws/app/README.md', 'hi')
    const u = await svc.createUser('app', 'Bob 张', 'pw123')
    expect(u.slug).toBe('app/bob-5f20')
    expect(u.workspacePath).toBe('/ws/app-bob-5f20')
    expect(await fs.readlink('/ws/app-bob-5f20/src')).toBe('/ws/app/src')
    expect(await fs.readlink('/ws/app-bob-5f20/README.md')).toBe('/ws/app/README.md')
    const md = await fs.readFile('/ws/app-bob-5f20/AGENTS.md')
    expect(md).toContain('Bob 张')
  })

  it('rejects globally duplicate user slugs', async () => {
    const { svc } = await seeded()
    await svc.createUser('app', 'bob', 'pw')
    await expect(svc.createUser('app', 'Bob', 'pw2')).rejects.toThrow(/已存在/)
  })

  it('rejects users for unknown projects', async () => {
    const { svc } = await seeded()
    await expect(svc.createUser('nope', 'bob', 'pw')).rejects.toThrow(/不存在/)
  })
})

describe('auth', () => {
  async function seeded() {
    const ctx = makeService()
    await ctx.svc.init()
    await ctx.svc.createProject('app')
    await ctx.svc.createUser('app', 'bob', 'pw')
    return ctx
  }

  it('issues a token on login and authenticates it', async () => {
    const { svc } = await seeded()
    const session = await svc.login('bob', 'pw')
    expect(session.token).toMatch(/^[0-9a-f]{64}$/)
    const who = await svc.authenticate(session.token)
    expect(who.slug).toBe('app/bob')
  })

  it('rejects wrong passwords', async () => {
    const { svc } = await seeded()
    await expect(svc.login('bob', 'nope')).rejects.toThrow(/用户名或密码/)
  })

  it('rejects expired tokens via the injected clock', async () => {
    const { svc } = await seeded()
    const session = await svc.login('bob', 'pw')
    clock.advance(2 * 60 * 60 * 1000)
    await expect(svc.authenticate(session.token)).rejects.toThrow(/token/i)
  })

  it('disabled users cannot log in and their tokens die', async () => {
    const { svc } = await seeded()
    const session = await svc.login('bob', 'pw')
    await svc.disableUser('bob')
    await expect(svc.login('bob', 'pw')).rejects.toThrow(/禁用/)
    await expect(svc.authenticate(session.token)).rejects.toThrow(/禁用/)
  })
})

describe('password change', () => {
  async function withAdmin() {
    const ctx = makeService({ adminPassword: 'rootpw' })
    await ctx.svc.init()
    return ctx
  }

  it('replaces the password once the current one verifies', async () => {
    const { svc } = await withAdmin()
    const session = await svc.login('admin', 'rootpw')
    await svc.changePassword('admin', 'rootpw', 'newpw', session.token)

    await expect(svc.login('admin', 'rootpw')).rejects.toThrow(/用户名或密码/)
    const again = await svc.login('admin', 'newpw')
    expect(again.user.slug).toBe('admin')
  })

  it("revokes the user's other tokens but keeps the caller's own", async () => {
    const { svc } = await withAdmin()
    const stale = await svc.login('admin', 'rootpw')
    const session = await svc.login('admin', 'rootpw')

    expect(await svc.changePassword('admin', 'rootpw', 'newpw', session.token)).toBe(1)
    await expect(svc.authenticate(stale.token)).rejects.toThrow(/无效/)
    await expect(svc.authenticate(session.token)).resolves.toMatchObject({ slug: 'admin' })
  })

  it('rejects a wrong current password and an empty new one', async () => {
    const { svc } = await withAdmin()
    await expect(svc.changePassword('admin', 'nope', 'x')).rejects.toThrow(/当前密码错误/)
    await expect(svc.changePassword('admin', 'rootpw', '')).rejects.toThrow(/不能为空/)
    // Neither rejection may have written anything.
    await expect(svc.login('admin', 'rootpw')).resolves.toBeTruthy()
  })
})

describe('physical deletion', () => {
  async function withUser() {
    const ctx = makeService()
    await ctx.svc.init()
    await ctx.svc.createProject('app')
    await ctx.fs.mkdir('/ws/app/src')
    await ctx.fs.writeFile('/ws/app/src/main.ts', 'code')
    await ctx.svc.createUser('app', 'bob', 'pw')
    return ctx
  }

  it('refuses to delete a user that is still active', async () => {
    const { svc } = await withUser()
    await expect(svc.deleteUser('bob')).rejects.toThrow(/先禁用/)
  })

  it('refuses to delete the admin account', async () => {
    const { svc } = makeService({ adminPassword: 'root' })
    await svc.init()
    await svc.disableUser('admin')
    await expect(svc.deleteUser('admin')).rejects.toThrow(/管理员/)
  })

  it('deletes a disabled user, their tokens and their workspace', async () => {
    const { fs, svc } = await withUser()
    const session = await svc.login('bob', 'pw')
    await svc.disableUser('bob')
    const report = await svc.deleteUser('bob')

    expect(report.slug).toBe('app/bob')
    expect(report.workspacesRemoved).toEqual(['/ws/app-bob'])
    expect(report.tokensRemoved).toBe(1)
    expect(await fs.exists('/ws/app-bob')).toBe(false)
    await expect(svc.authenticate(session.token)).rejects.toThrow()
    await expect(svc.login('bob', 'pw')).rejects.toThrow()
  })

  it('never deletes the project through the user workspace symlinks', async () => {
    // A shape check only: the fake gives a symlink no content tree to follow,
    // so it can neither pass nor fail on the syscall's behaviour. The real
    // assertion is test/delete-real-fs.test.ts, against a real temp directory.
    const { fs, svc } = await withUser()
    expect(await fs.readlink('/ws/app-bob/src')).toBe('/ws/app/src')
    await svc.disableUser('bob')
    await svc.deleteUser('bob')

    expect(await fs.exists('/ws/app/src/main.ts')).toBe(true)
    expect(await fs.readFile('/ws/app/src/main.ts')).toBe('code')
    expect(await fs.exists('/ws/app')).toBe(true)
  })

  it('leaves the plugin root alone even if a record points at it', async () => {
    // A corrupted workspace path must not turn the removal into a wipe of the
    // whole root (which holds every project).
    const repo = new MemoryRepo()
    const fs = new MemFs()
    const svc = new ProjectsService({
      repo,
      fs,
      now: () => clock.now(),
      root: '/ws',
      tokenTtlMs: 60 * 60 * 1000,
    })
    await svc.init()
    await svc.createProject('app')
    await fs.writeFile('/ws/app/main.ts', 'code')
    await svc.createUser('app', 'bob', 'pw')
    const user = (await repo.get('users', 'app/bob')) as { workspacePath: string | null }
    user.workspacePath = '/ws'
    await repo.put('users', 'app/bob', user)

    await svc.disableUser('bob')
    const report = await svc.deleteUser('bob')
    expect(report.workspacesRemoved).toEqual([])
    expect(await fs.exists('/ws')).toBe(true)
    expect(await fs.exists('/ws/app/main.ts')).toBe(true)
  })

  it('refuses to delete a project while any of its users is active', async () => {
    const { svc } = await withUser()
    await svc.createUser('app', 'carol', 'pw')
    await svc.disableUser('bob')
    await expect(svc.deleteProject('app')).rejects.toThrow(/先禁用/)
  })

  it('deletes a project once every user under it is disabled', async () => {
    const { fs, svc } = await withUser()
    await svc.disableUser('bob')
    const report = await svc.deleteProject('app')

    expect(report.slug).toBe('app')
    expect(report.usersDeleted).toEqual(['app/bob'])
    expect(report.workspacesRemoved).toEqual(['/ws/app-bob'])
    expect(report.directoryRemoved).toBe(true)
    expect(await fs.exists('/ws/app')).toBe(false)
    expect(await fs.exists('/ws/app-bob')).toBe(false)
    expect(await svc.listProjects()).toEqual([])
  })

  it('deletes a project that has no users at all', async () => {
    const { fs, svc } = makeService()
    await svc.init()
    await svc.createProject('empty')
    const report = await svc.deleteProject('empty')
    expect(report.directoryRemoved).toBe(true)
    expect(await fs.exists('/ws/empty')).toBe(false)
  })

  it('keeps a BOUND project directory, deleting only the records', async () => {
    // A bound path is the operator's real repository; removing it would destroy
    // data the plugin never created.
    const { fs, svc } = makeService()
    await svc.init()
    await fs.mkdir('/repos/real')
    await svc.createProject('bound', '/repos/real')
    const report = await svc.deleteProject('bound')

    expect(report.directoryRemoved).toBe(false)
    expect(report.keptDirectory).toBe('/repos/real')
    expect(await fs.exists('/repos/real')).toBe(true)
    expect(await svc.listProjects()).toEqual([])
  })

  it('reports a missing project rather than silently succeeding', async () => {
    const { svc } = makeService()
    await svc.init()
    await expect(svc.deleteProject('nope')).rejects.toThrow(/不存在/)
  })
})

describe('workspace sync', () => {
  it('links entries added to the project after user creation', async () => {
    const ctx = makeService()
    await ctx.svc.init()
    await ctx.svc.createProject('app')
    await ctx.svc.createUser('app', 'bob', 'pw')
    await ctx.fs.mkdir('/ws/app/newdir')
    const report = await ctx.svc.syncUserWorkspace('app', 'bob')
    expect(report.linked.map((l) => l.name)).toEqual(['newdir'])
    expect(await ctx.fs.readlink('/ws/app-bob/newdir')).toBe('/ws/app/newdir')
  })

  it('refreshes a stale AGENTS.md to the current guard rules', async () => {
    const ctx = makeService()
    await ctx.svc.init()
    await ctx.svc.createProject('app')
    await ctx.svc.createUser('app', 'bob', 'pw')
    // A pre-guard-era AGENTS.md (only the original four rules).
    await ctx.fs.writeFile('/ws/app-bob/AGENTS.md', '# 工作区守则（旧版）\n\n- 只在本目录内工作。\n')
    await ctx.svc.syncUserWorkspace('app', 'bob')
    const md = await ctx.fs.readFile('/ws/app-bob/AGENTS.md')
    expect(md).toContain('不要读取、展示或复制工作区之外的任何文件或目录的内容')
    expect(md).toContain('不要执行会离开本工作区的命令')
    expect(md).toContain('不要给出绕过工作区边界的做法或命令')
    expect(md).not.toContain('旧版')
  })

  it('is idempotent, so running it on every session costs nothing', async () => {
    const ctx = makeService()
    await ctx.svc.init()
    await ctx.svc.createProject('app')
    await ctx.svc.createUser('app', 'bob', 'pw')
    await ctx.fs.mkdir('/ws/app/newdir')
    const first = await ctx.svc.syncUserWorkspace('app', 'bob')
    const second = await ctx.svc.syncUserWorkspace('app', 'bob')
    expect(first.linked.map((l) => l.name)).toEqual(['newdir'])
    expect(second.linked).toEqual([])
    expect(second.skippedExisting.map((s) => s.name)).toEqual(['newdir'])
  })

  it('syncs the workspace that owns a cwd, and nothing else', async () => {
    const ctx = makeService()
    await ctx.svc.init()
    await ctx.svc.createProject('app')
    await ctx.svc.createUser('app', 'bob', 'pw')
    await ctx.fs.mkdir('/ws/app/later')

    const report = await ctx.svc.syncWorkspaceForCwd('/ws/app-bob')
    expect(report?.linked.map((l) => l.name)).toEqual(['later'])
    expect(await ctx.fs.exists('/ws/app-bob/later')).toBe(true)
  })

  it('returns undefined for a cwd no project user owns', async () => {
    const ctx = makeService()
    await ctx.svc.init()
    await ctx.svc.createProject('app')
    await ctx.svc.createUser('app', 'bob', 'pw')
    expect(await ctx.svc.syncWorkspaceForCwd('/tmp/elsewhere')).toBeUndefined()
    expect(await ctx.svc.syncWorkspaceForCwd('/ws/app')).toBeUndefined()
  })

  it('syncs every project user in one pass, skipping admins', async () => {
    const ctx = makeService({ adminPassword: 'root' })
    await ctx.svc.init()
    await ctx.svc.createProject('app')
    await ctx.svc.createUser('app', 'bob', 'pw')
    await ctx.svc.createUser('app', 'carol', 'pw')
    await ctx.fs.mkdir('/ws/app/shared')

    expect(await ctx.svc.syncAllWorkspaces()).toBe(2)
    expect(await ctx.fs.exists('/ws/app-bob/shared')).toBe(true)
    expect(await ctx.fs.exists('/ws/app-carol/shared')).toBe(true)
  })
})
