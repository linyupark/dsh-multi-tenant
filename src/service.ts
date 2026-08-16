/**
 * ProjectsService: the domain core. Pure orchestration over injected ports
 * (Repo, FsPort, clock) — no dsh imports, fully unit-testable.
 *
 * Threat model: 防君子不防小人 (best-effort). Nothing here is a hard boundary;
 * the hard outer boundary is the tunnel-level auth in front of dsh.
 */
import { hashPassword, verifyPassword, newToken, tokenFingerprint } from './crypto.ts'
import { slug } from './slug.ts'
import { isAbsolute, resolve } from 'node:path'
import { planUserWorkspace, projectWorkspacePath } from './paths.ts'
import { renderAgentsMd } from './agents-md.ts'
import type { Repo } from './repo.ts'
import type { FsPort } from './fs-port.ts'
import type { ProjectRecord, TokenRecord, UserRecord } from './records.ts'

/** The storage key of a project user: `<projectSlug>/<userSlug>` — same-name users may exist across projects. */
function userKey(projectSlug: string, userSlug: string): string {
  return `${projectSlug}/${userSlug}`
}

/** Ports and knobs injected at construction. */
export interface ServiceDeps {
  repo: Repo
  fs: FsPort
  now(): number
  /** Absolute root holding all project/user workspaces. */
  root: string
  tokenTtlMs: number
  /** Bootstrap admin password, applied only when the user store is empty. */
  adminPassword?: string
  /** Extra AGENTS.md rules. */
  agentsRules?: readonly string[]
}

/** A login session handed to the client (token shown once). */
export interface LoginSession {
  token: string
  user: PublicUser
}

/** User projection safe to return to clients. */
export interface PublicUser {
  slug: string
  name: string
  projectSlug: string | null
  role: 'admin' | 'user'
  status: 'active' | 'disabled'
  workspacePath: string | null
}

/** Result of syncing a user workspace against the project dir. */
export interface SyncReport {
  linked: Array<{ name: string }>
  skippedExisting: Array<{ name: string }>
}

function publicUser(u: UserRecord): PublicUser {
  return {
    slug: u.slug,
    name: u.name,
    projectSlug: u.projectSlug,
    role: u.role,
    status: u.status,
    workspacePath: u.workspacePath,
  }
}

/** The domain core. */
export class ProjectsService {
  constructor(private readonly deps: ServiceDeps) {}

  /** Seed roles and the optional bootstrap admin. Idempotent. */
  async init(): Promise<void> {
    if ((await this.deps.repo.list('roles')).length === 0) {
      await this.deps.repo.put('roles', 'admin', {
        code: 'admin',
        description: '管理员：可管理项目与用户',
      })
      await this.deps.repo.put('roles', 'user', {
        code: 'user',
        description: '普通用户：一次性账号，工作区受限（软约束）',
      })
    }
    const users = await this.deps.repo.list('users')
    if (users.length === 0 && this.deps.adminPassword) {
      await this.deps.repo.put('users', 'admin', {
        slug: 'admin',
        name: 'admin',
        projectSlug: null,
        role: 'admin',
        passwordHash: hashPassword(this.deps.adminPassword),
        status: 'active',
        workspacePath: null,
        createdAt: this.deps.now(),
      } satisfies UserRecord)
    }
  }

  /** Create a project; auto-creates its workspace, or binds an existing directory. */
  async createProject(name: string, workspacePath?: string): Promise<ProjectRecord> {
    const s = slug(name)
    if (await this.deps.repo.get('projects', s)) throw new Error(`项目 ${s} 已存在`)
    let wsPath: string
    if (workspacePath !== undefined && workspacePath !== '') {
      if (!isAbsolute(workspacePath)) throw new Error('绑定的工作区路径必须是绝对路径')
      wsPath = resolve(workspacePath)
      if (!(await this.deps.fs.exists(wsPath))) throw new Error(`绑定的工作区目录不存在: ${wsPath}`)
    } else {
      wsPath = projectWorkspacePath(this.deps.root, name)
      await this.deps.fs.mkdir(wsPath)
    }
    const record: ProjectRecord = {
      slug: s,
      name,
      workspacePath: wsPath,
      createdAt: this.deps.now(),
    }
    await this.deps.repo.put('projects', s, record)
    return record
  }

  /** Create a one-shot user with a symlinked workspace + AGENTS.md. */
  async createUser(projectName: string, userName: string, password: string): Promise<UserRecord> {
    const projectSlug = slug(projectName)
    const project = (await this.deps.repo.get('projects', projectSlug)) as
      | ProjectRecord
      | undefined
    if (!project) throw new Error(`项目 ${projectSlug} 不存在`)
    const userSlug = slug(userName)
    const key = userKey(projectSlug, userSlug)
    if (await this.deps.repo.get('users', key)) {
      throw new Error(`用户 ${userSlug} 已存在于项目 ${projectSlug}`)
    }
    const entries = await this.deps.fs.readdir(project.workspacePath).catch(() => [] as string[])
    const plan = planUserWorkspace({
      root: this.deps.root,
      projectName,
      userName,
      projectWorkspacePath: project.workspacePath,
      projectEntries: entries,
      reserved: ['AGENTS.md'],
    })
    await this.deps.fs.mkdir(plan.userWorkspacePath)
    for (const link of plan.symlinks) await this.deps.fs.symlink(link.targetPath, link.linkPath)
    await this.deps.fs.writeFile(
      `${plan.userWorkspacePath}/AGENTS.md`,
      renderAgentsMd({
        userName,
        projectName,
        customRules: this.deps.agentsRules,
      }),
    )
    const record: UserRecord = {
      slug: key,
      name: userName,
      projectSlug,
      role: 'user',
      passwordHash: hashPassword(password),
      status: 'active',
      workspacePath: plan.userWorkspacePath,
      createdAt: this.deps.now(),
    }
    await this.deps.repo.put('users', key, record)
    return record
  }

  /** Resolve a user by `project/name` or a bare unique name (same names across projects). */
  private async resolveUser(identifier: string): Promise<UserRecord> {
    const slash = identifier.indexOf('/')
    if (slash > 0) {
      const project = slug(identifier.slice(0, slash))
      const direct = (await this.deps.repo.get('users', userKey(project, slug(identifier.slice(slash + 1))))) as UserRecord | undefined
      if (direct) return direct
    }
    const rows = await this.deps.repo.list('users')
    const matches = rows.map(([, v]) => v as UserRecord).filter((u) => u.name === identifier || u.slug === identifier)
    if (matches.length > 1) throw new Error('用户名在多个项目中重名，请用 项目/用户名 形式')
    const user = matches[0]
    if (!user) throw new Error('用户不存在')
    return user
  }

  /** Verify credentials and mint a bearer token. */
  async login(username: string, password: string): Promise<LoginSession> {
    let user: UserRecord
    try {
      user = await this.resolveUser(username)
    } catch (e) {
      if ((e as Error).message.includes('重名')) throw e
      throw new Error('用户名或密码错误')
    }
    if (!verifyPassword(password, user.passwordHash)) {
      throw new Error('用户名或密码错误')
    }
    if (user.status === 'disabled') throw new Error('用户已被禁用')
    const token = newToken()
    await this.mint(user.slug, token)
    return { token, user: publicUser(user) }
  }

  /** Mint an extra token for a user (admin handoff). */
  async issueToken(username: string): Promise<string> {
    const user = await this.resolveUser(username)
    const token = newToken()
    await this.mint(user.slug, token)
    return token
  }

  private async mint(userSlug: string, token: string): Promise<void> {
    const record: TokenRecord = {
      fingerprint: tokenFingerprint(token),
      userSlug,
      createdAt: this.deps.now(),
      expiresAt: this.deps.now() + this.deps.tokenTtlMs,
      revoked: false,
    }
    await this.deps.repo.put('tokens', record.fingerprint, record)
  }

  /** Resolve a bearer token to its active user. Throws on any failure. */
  async authenticate(token: string): Promise<UserRecord> {
    const record = (await this.deps.repo.get('tokens', tokenFingerprint(token))) as
      | TokenRecord
      | undefined
    if (!record || record.revoked) throw new Error('token 无效')
    if (record.expiresAt <= this.deps.now()) throw new Error('token 已过期')
    const user = (await this.deps.repo.get('users', record.userSlug)) as UserRecord | undefined
    if (!user) throw new Error('token 指向的用户不存在')
    if (user.status === 'disabled') throw new Error('用户已被禁用')
    return user
  }

  /** Disable a user; their tokens die with them. */
  async disableUser(username: string): Promise<void> {
    const user = await this.resolveUser(username)
    user.status = 'disabled'
    await this.deps.repo.put('users', user.slug, user)
  }

  /** List projects (public projections). */
  async listProjects(): Promise<Array<{ slug: string; name: string; workspacePath: string }>> {
    const rows = await this.deps.repo.list('projects')
    return rows.map(([, v]) => {
      const p = v as ProjectRecord
      return { slug: p.slug, name: p.name, workspacePath: p.workspacePath }
    })
  }

  /** List users of one project (or all when projectSlug is null). */
  async listUsers(projectSlug: string | null): Promise<PublicUser[]> {
    const rows = await this.deps.repo.list('users')
    return rows
      .map(([, v]) => v as UserRecord)
      .filter((u) => (projectSlug === null ? true : u.projectSlug === projectSlug))
      .map(publicUser)
  }

  /** Link project entries created after the user workspace was set up. */
  async syncUserWorkspace(projectName: string, userName: string): Promise<SyncReport> {
    const project = (await this.deps.repo.get('projects', slug(projectName))) as
      | ProjectRecord
      | undefined
    const user = (await this.deps.repo.get('users', userKey(slug(projectName), slug(userName)))) as UserRecord | undefined
    if (!project || !user || !user.workspacePath) throw new Error('项目或用户不存在')
    const entries = await this.deps.fs.readdir(project.workspacePath).catch(() => [] as string[])
    const plan = planUserWorkspace({
      root: this.deps.root,
      projectName,
      userName,
      projectWorkspacePath: project.workspacePath,
      projectEntries: entries,
      reserved: ['AGENTS.md'],
    })
    const linked: Array<{ name: string }> = []
    const skippedExisting: Array<{ name: string }> = []
    for (const link of plan.symlinks) {
      if (await this.deps.fs.exists(link.linkPath)) {
        skippedExisting.push({ name: link.name })
        continue
      }
      await this.deps.fs.symlink(link.targetPath, link.linkPath)
      linked.push({ name: link.name })
    }
    // Refresh the AGENTS.md to the CURRENT guard rules: workspaces created
    // before a rules upgrade keep a stale baseline otherwise (the official
    // agent-instructions channel re-loads the changed file per session).
    await this.deps.fs.writeFile(
      `${plan.userWorkspacePath}/AGENTS.md`,
      renderAgentsMd({
        userName,
        projectName,
        customRules: this.deps.agentsRules,
      }),
    )
    return { linked, skippedExisting }
  }
}
