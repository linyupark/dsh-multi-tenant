import { describe, expect, it } from 'vitest'
import { createProjectsApi } from '../src/http.ts'
import { ProjectsService } from '../src/service.ts'
import { MemoryRepo } from '../src/repo.ts'
import type { FsPort } from '../src/fs-port.ts'

class FlatFs implements FsPort {
  files = new Set<string>()
  links = new Map<string, string>()
  dirs = new Set<string>()
  async mkdir(p: string) {
    this.dirs.add(p)
  }
  async readdir(p: string) {
    return [...this.files, ...this.links.keys()]
      .filter((f) => f.startsWith(p + '/'))
      .map((f) => f.slice(p.length + 1))
  }
  async symlink(t: string, p: string) {
    this.links.set(p, t)
  }
  async readlink(p: string) {
    return this.links.get(p) ?? ''
  }
  async writeFile(p: string) {
    this.files.add(p)
  }
  async readFile(p: string) {
    return `content of ${p}`
  }
  async exists(p: string) {
    return this.dirs.has(p) || this.files.has(p) || this.links.has(p)
  }
}

async function makeApi(sessionLister?: (cwd: string) => Promise<Array<{ id: string; title?: string }>>) {
  const svc = new ProjectsService({
    repo: new MemoryRepo(),
    fs: new FlatFs(),
    now: () => 1,
    root: '/ws',
    tokenTtlMs: 3_600_000,
    adminPassword: 'rootpw',
  })
  await svc.init()
  const api = createProjectsApi({ service: svc, sessionLister })
  return { svc, api }
}

describe('auth endpoints', () => {
  it('login returns a token; whoami resolves it', async () => {
    const { api } = await makeApi()
    const login = await api({ method: 'POST', path: '/login', body: { username: 'admin', password: 'rootpw' } })
    expect(login.status).toBe(200)
    const token = (login.json as { token: string }).token
    const who = await api({ method: 'GET', path: '/whoami', token })
    expect(who.status).toBe(200)
    expect((who.json as { user: { role: string } }).user.role).toBe('admin')
  })

  it('whoami carries the project slug and name for project users', async () => {
    const { api } = await makeApi()
    const adminLogin = await api({ method: 'POST', path: '/login', body: { username: 'admin', password: 'rootpw' } })
    const adminToken = (adminLogin.json as { token: string }).token
    await api({ method: 'POST', path: '/admin/projects', token: adminToken, body: { name: 'demo app' } })
    await api({
      method: 'POST',
      path: '/admin/users',
      token: adminToken,
      body: { project: 'demo app', username: 'bob', password: 'pw' },
    })
    const bob = await api({ method: 'POST', path: '/login', body: { username: 'bob', password: 'pw' } })
    const res = await api({ method: 'GET', path: '/whoami', token: (bob.json as { token: string }).token })
    expect(res.status).toBe(200)
    expect((res.json as { user: Record<string, unknown> }).user).toMatchObject({
      slug: 'demo-app/bob',
      role: 'user',
      projectSlug: 'demo-app',
      projectName: 'demo app',
      cwd: '/ws/demo-app-bob',
    })
  })

  it('whoami for admins keeps project fields null', async () => {
    const { api } = await makeApi()
    const login = await api({ method: 'POST', path: '/login', body: { username: 'admin', password: 'rootpw' } })
    const res = await api({ method: 'GET', path: '/whoami', token: (login.json as { token: string }).token })
    expect((res.json as { user: Record<string, unknown> }).user).toMatchObject({
      role: 'admin',
      projectSlug: null,
      projectName: null,
      cwd: null,
    })
  })

  it('whoami without a token is 401', async () => {
    const { api } = await makeApi()
    const res = await api({ method: 'GET', path: '/whoami' })
    expect(res.status).toBe(401)
  })

  it('bad credentials are 401 with a message', async () => {
    const { api } = await makeApi()
    const res = await api({ method: 'POST', path: '/login', body: { username: 'admin', password: 'x' } })
    expect(res.status).toBe(401)
    expect((res.json as { error: string }).error).toContain('用户名或密码')
  })
})

describe('admin endpoints', () => {
  async function admin() {
    const t = await makeApi()
    const login = await t.api({ method: 'POST', path: '/login', body: { username: 'admin', password: 'rootpw' } })
    return { ...t, adminToken: (login.json as { token: string }).token }
  }

  it('admin creates a project, a user, and mints a token for them', async () => {
    const { api, adminToken } = await admin()
    expect((await api({ method: 'POST', path: '/admin/projects', token: adminToken, body: { name: 'app' } })).status).toBe(201)
    const user = await api({
      method: 'POST',
      path: '/admin/users',
      token: adminToken,
      body: { project: 'app', username: 'bob', password: 'pw' },
    })
    expect(user.status).toBe(201)
    expect((user.json as { user: { workspacePath: string } }).user.workspacePath).toBe('/ws/app-bob')
    const minted = await api({ method: 'POST', path: '/admin/tokens', token: adminToken, body: { username: 'bob' } })
    expect((minted.json as { token: string }).token).toMatch(/^[0-9a-f]{64}$/)
  })

  it('non-admin tokens are rejected with 403', async () => {
    const { api, adminToken } = await admin()
    await api({ method: 'POST', path: '/admin/projects', token: adminToken, body: { name: 'app' } })
    await api({ method: 'POST', path: '/admin/users', token: adminToken, body: { project: 'app', username: 'bob', password: 'pw' } })
    const bobLogin = await api({ method: 'POST', path: '/login', body: { username: 'bob', password: 'pw' } })
    const bobToken = (bobLogin.json as { token: string }).token
    const res = await api({ method: 'POST', path: '/admin/projects', token: bobToken, body: { name: 'nope' } })
    expect(res.status).toBe(403)
  })

  it('overview lists projects and users', async () => {
    const { api, adminToken } = await admin()
    await api({ method: 'POST', path: '/admin/projects', token: adminToken, body: { name: 'app' } })
    await api({ method: 'POST', path: '/admin/users', token: adminToken, body: { project: 'app', username: 'bob', password: 'pw' } })
    const res = await api({ method: 'GET', path: '/admin/overview', token: adminToken })
    const body = res.json as { projects: unknown[]; users: unknown[] }
    expect(body.projects.length).toBe(1)
    expect(body.users.length).toBe(2) // admin + bob
  })
})

describe('my sessions', () => {
  it('returns the cwd-filtered session list for the calling user', async () => {
    const { api } = await makeApi(async (cwd) => [{ id: `s-${cwd}` }])
    const adminLogin = await api({ method: 'POST', path: '/login', body: { username: 'admin', password: 'rootpw' } })
    const adminToken = (adminLogin.json as { token: string }).token
    await api({ method: 'POST', path: '/admin/projects', token: adminToken, body: { name: 'app' } })
    await api({ method: 'POST', path: '/admin/users', token: adminToken, body: { project: 'app', username: 'bob', password: 'pw' } })
    const bob = await api({ method: 'POST', path: '/login', body: { username: 'bob', password: 'pw' } })
    const res = await api({ method: 'GET', path: '/my/sessions', token: (bob.json as { token: string }).token })
    expect(res.status).toBe(200)
    expect(res.json).toEqual({ sessions: [{ id: 's-/ws/app-bob' }] })
  })

  it('passes durable folded titles through my/sessions', async () => {
    const { api } = await makeApi(async () => [{ id: 's1', title: '帮我写个脚本' }, { id: 's2' }])
    const adminLogin = await api({ method: 'POST', path: '/login', body: { username: 'admin', password: 'rootpw' } })
    const adminToken = (adminLogin.json as { token: string }).token
    await api({ method: 'POST', path: '/admin/projects', token: adminToken, body: { name: 'app' } })
    await api({ method: 'POST', path: '/admin/users', token: adminToken, body: { project: 'app', username: 'bob', password: 'pw' } })
    const bob = await api({ method: 'POST', path: '/login', body: { username: 'bob', password: 'pw' } })
    const res = await api({ method: 'GET', path: '/my/sessions', token: (bob.json as { token: string }).token })
    expect(res.status).toBe(200)
    expect(res.json).toEqual({ sessions: [{ id: 's1', title: '帮我写个脚本' }, { id: 's2' }] })
  })
})

describe('protocol hygiene', () => {
  it('unknown paths are 404 and wrong methods 405', async () => {
    const { api } = await makeApi()
    expect((await api({ method: 'GET', path: '/nope' })).status).toBe(404)
    expect((await api({ method: 'DELETE', path: '/login' })).status).toBe(405)
  })
})

describe('bound project workspaces', () => {
  it('admin/projects passes workspacePath through and overview echoes it', async () => {
    const { api } = await makeApi()
    const adminLogin = await api({ method: 'POST', path: '/login', body: { username: 'admin', password: 'rootpw' } })
    const adminToken = (adminLogin.json as { token: string }).token
    // A default project first — its auto-created directory is then bound.
    await api({ method: 'POST', path: '/admin/projects', token: adminToken, body: { name: 'srcproj' } })
    const created = await api({
      method: 'POST',
      path: '/admin/projects',
      token: adminToken,
      body: { name: 'demo', workspacePath: '/ws/srcproj' },
    })
    expect(created.status).toBe(201)
    expect((created.json as { project: { workspacePath: string } }).project.workspacePath).toBe('/ws/srcproj')
    const overview = await api({ method: 'GET', path: '/admin/overview', token: adminToken })
    const projects = (overview.json as { projects: Array<{ slug: string; workspacePath: string }> }).projects
    expect(projects.find((p) => p.slug === 'demo')?.workspacePath).toBe('/ws/srcproj')
  })

  it('admin/projects rejects a nonexistent bound path with 409', async () => {
    const { api } = await makeApi()
    const adminLogin = await api({ method: 'POST', path: '/login', body: { username: 'admin', password: 'rootpw' } })
    const adminToken = (adminLogin.json as { token: string }).token
    const res = await api({
      method: 'POST',
      path: '/admin/projects',
      token: adminToken,
      body: { name: 'demo', workspacePath: '/nope/missing' },
    })
    expect(res.status).toBe(409)
  })
})
