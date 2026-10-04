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
  async remove(p: string) {
    this.dirs.delete(p)
    this.files.delete(p)
    this.links.delete(p)
    for (const f of this.files) if (f.startsWith(p + '/')) this.files.delete(f)
    for (const l of this.links.keys()) if (l.startsWith(p + '/')) this.links.delete(l)
    for (const d of this.dirs) if (d.startsWith(p + '/')) this.dirs.delete(d)
  }
  async realpath(p: string) {
    if (!(await this.exists(p))) throw new Error('no such path: ' + p)
    return p
  }
}

async function makeApi(sessionLister?: (cwd: string) => Promise<Array<{ id: string; title?: string }>>) {
  const fs = new FlatFs()
  const svc = new ProjectsService({
    repo: new MemoryRepo(),
    fs,
    now: () => 1,
    root: '/ws',
    tokenTtlMs: 3_600_000,
    adminPassword: 'rootpw',
  })
  await svc.init()
  const api = createProjectsApi({ service: svc, sessionLister })
  return { svc, fs, api }
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
    // The one-shot token handoff is gone; the account signs in with its password.
    expect((await api({ method: 'POST', path: '/admin/tokens', token: adminToken, body: { username: 'bob' } })).status).toBe(404)
  })

  it('deletes a user only once disabled, and deletes a project only then', async () => {
    const { api, adminToken } = await admin()
    await api({ method: 'POST', path: '/admin/projects', token: adminToken, body: { name: 'app' } })
    await api({ method: 'POST', path: '/admin/users', token: adminToken, body: { project: 'app', username: 'bob', password: 'pw' } })

    const tooEarly = await api({ method: 'POST', path: '/admin/delete-user', token: adminToken, body: { username: 'app/bob' } })
    expect(tooEarly.status).toBe(409)
    expect((tooEarly.json as { error: string }).error).toMatch(/先禁用/)

    const active = await api({ method: 'POST', path: '/admin/delete-project', token: adminToken, body: { project: 'app' } })
    expect(active.status).toBe(409)
    expect((active.json as { error: string }).error).toMatch(/先禁用/)

    expect((await api({ method: 'POST', path: '/admin/disable', token: adminToken, body: { username: 'app/bob' } })).status).toBe(200)

    const removed = await api({ method: 'POST', path: '/admin/delete-project', token: adminToken, body: { project: 'app' } })
    expect(removed.status).toBe(200)
    const body = removed.json as { usersDeleted: string[]; workspacesRemoved: string[] }
    expect(body.usersDeleted).toEqual(['app/bob'])
    expect(body.workspacesRemoved).toEqual(['/ws/app-bob'])
  })

  it('changes the caller admin password and kills the old one', async () => {
    const { api, adminToken } = await admin()
    const wrong = await api({
      method: 'POST',
      path: '/admin/password',
      token: adminToken,
      body: { currentPassword: 'nope', newPassword: 'next' },
    })
    expect(wrong.status).toBe(403)
    expect((await api({ method: 'POST', path: '/admin/password', token: adminToken, body: { currentPassword: 'rootpw' } })).status).toBe(400)

    const changed = await api({
      method: 'POST',
      path: '/admin/password',
      token: adminToken,
      body: { currentPassword: 'rootpw', newPassword: 'next' },
    })
    expect(changed.status).toBe(200)
    // The caller's own session survives the change it just made.
    expect((await api({ method: 'GET', path: '/whoami', token: adminToken })).status).toBe(200)
    expect((await api({ method: 'POST', path: '/login', body: { username: 'admin', password: 'next' } })).status).toBe(200)
    expect((await api({ method: 'POST', path: '/login', body: { username: 'admin', password: 'rootpw' } })).status).toBe(401)
  })

  it('refuses a password change from a non-admin', async () => {
    const { api, adminToken } = await admin()
    await api({ method: 'POST', path: '/admin/projects', token: adminToken, body: { name: 'app' } })
    await api({ method: 'POST', path: '/admin/users', token: adminToken, body: { project: 'app', username: 'bob', password: 'pw' } })
    const bob = await api({ method: 'POST', path: '/login', body: { username: 'bob', password: 'pw' } })
    const res = await api({
      method: 'POST',
      path: '/admin/password',
      token: (bob.json as { token: string }).token,
      body: { currentPassword: 'pw', newPassword: 'next' },
    })
    expect(res.status).toBe(403)
  })

  it('requires a username or project for the delete routes', async () => {
    const { api, adminToken } = await admin()
    expect((await api({ method: 'POST', path: '/admin/delete-user', token: adminToken, body: {} })).status).toBe(400)
    expect((await api({ method: 'POST', path: '/admin/delete-project', token: adminToken, body: {} })).status).toBe(400)
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
    const { api, fs } = await makeApi()
    const adminLogin = await api({ method: 'POST', path: '/login', body: { username: 'admin', password: 'rootpw' } })
    const adminToken = (adminLogin.json as { token: string }).token
    // The bound directory lives OUTSIDE the plugin root.
    await fs.mkdir('/repos/srcproj')
    const created = await api({
      method: 'POST',
      path: '/admin/projects',
      token: adminToken,
      body: { name: 'demo', workspacePath: '/repos/srcproj' },
    })
    expect(created.status).toBe(201)
    expect((created.json as { project: { workspacePath: string } }).project.workspacePath).toBe('/repos/srcproj')
    const overview = await api({ method: 'GET', path: '/admin/overview', token: adminToken })
    const projects = (overview.json as { projects: Array<{ slug: string; workspacePath: string }> }).projects
    expect(projects.find((p) => p.slug === 'demo')?.workspacePath).toBe('/repos/srcproj')
  })

  it('refuses to bind a path inside the plugin root', async () => {
    // Binding into the managed area would make a managed directory and an
    // operator directory share a path, which deletion cannot tell apart.
    const { api } = await makeApi()
    const login = await api({ method: 'POST', path: '/login', body: { username: 'admin', password: 'rootpw' } })
    const adminToken = (login.json as { token: string }).token
    await api({ method: 'POST', path: '/admin/projects', token: adminToken, body: { name: 'srcproj' } })
    const res = await api({
      method: 'POST',
      path: '/admin/projects',
      token: adminToken,
      body: { name: 'demo', workspacePath: '/ws/srcproj' },
    })
    expect(res.status).toBe(409)
    expect((res.json as { error: string }).error).toMatch(/根目录/)
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
