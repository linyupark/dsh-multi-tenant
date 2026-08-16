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

  it('issueToken and disableUser accept the project/name form for shared names', async () => {
    const { svc } = makeService()
    await svc.init()
    await svc.createProject('alpha')
    await svc.createProject('beta')
    await svc.createUser('alpha', 'bob', 'pw-a')
    await svc.createUser('beta', 'bob', 'pw-b')
    await svc.disableUser('alpha/bob')
    await expect(svc.login('alpha/bob', 'pw-a')).rejects.toThrow(/禁用/)
    const token = await svc.issueToken('beta/bob')
    const authed = await svc.authenticate(token)
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

  it('admin can mint a token for a user (one-shot handoff)', async () => {
    const { svc } = await seeded()
    const t = await svc.issueToken('bob')
    const who = await svc.authenticate(t)
    expect(who.slug).toBe('app/bob')
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
})
