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
import { avatarPathBeside, isInside, planUserWorkspace, projectWorkspacePath } from './paths.ts'
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

/** Result of physically deleting one user. */
export interface UserDeletionReport {
  slug: string
  tokensRemoved: number
  /**
   * Directory paths ACTUALLY removed — empty when there was nothing to remove
   * or the recorded path was refused. Consumers act on this, never on the
   * record's own `workspacePath`, so a refused removal cannot deregister a
   * live workspace.
   */
  workspacesRemoved: string[]
}

/** Result of physically deleting one project. */
export interface ProjectDeletionReport {
  slug: string
  usersDeleted: string[]
  /** The user workspace directories that were removed, for registry cleanup. */
  workspacesRemoved: string[]
  /** False when the directory was a bound path and therefore left in place. */
  directoryRemoved: boolean
  /** Set to the preserved directory when it was a bound path. */
  keptDirectory?: string
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
    let managed: boolean
    if (workspacePath !== undefined && workspacePath !== '') {
      if (!isAbsolute(workspacePath)) throw new Error('绑定的工作区路径必须是绝对路径')
      wsPath = resolve(workspacePath)
      // Binding INTO the plugin's own root would put an operator directory and
      // a managed one on the same path, and deletion then cannot tell them
      // apart: deleting a same-named managed project would take the bound
      // directory with it. The root is this plugin's private area.
      if (isInside(this.deps.root, wsPath)) {
        throw new Error('绑定的工作区不能位于插件根目录内')
      }
      if (!(await this.deps.fs.exists(wsPath))) throw new Error(`绑定的工作区目录不存在: ${wsPath}`)
      managed = false
    } else {
      wsPath = projectWorkspacePath(this.deps.root, name)
      await this.deps.fs.mkdir(wsPath)
      managed = true
    }
    const record: ProjectRecord = {
      slug: s,
      name,
      workspacePath: wsPath,
      managed,
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

  /**
   * Replace a user's password after verifying the current one, and revoke that
   * user's other live tokens: the reason to change a password is usually "a
   * session I no longer trust", and tokens are the only thing that outlives it.
   * `keepToken` is the caller's own bearer, so the UI that made the change
   * survives it (the route always passes it).
   *
   * Returns how many other tokens were revoked.
   */
  async changePassword(
    identifier: string,
    currentPassword: string,
    newPassword: string,
    keepToken?: string,
  ): Promise<number> {
    const user = await this.resolveUser(identifier)
    if (!verifyPassword(currentPassword, user.passwordHash)) throw new Error('当前密码错误')
    if (!newPassword) throw new Error('新密码不能为空')
    user.passwordHash = hashPassword(newPassword)
    await this.deps.repo.put('users', user.slug, user)

    const keep = keepToken ? tokenFingerprint(keepToken) : undefined
    let revoked = 0
    for (const [key, value] of await this.deps.repo.list('tokens')) {
      const token = value as TokenRecord
      if (token.userSlug !== user.slug || token.revoked || key === keep) continue
      token.revoked = true
      await this.deps.repo.put('tokens', key, token)
      revoked += 1
    }
    return revoked
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

  /**
   * Refresh one user's workspace against its project directory. Idempotent, so
   * it is safe to run on every session and at boot.
   */
  async syncUserWorkspace(projectName: string, userName: string): Promise<SyncReport> {
    const project = (await this.deps.repo.get('projects', slug(projectName))) as
      | ProjectRecord
      | undefined
    const user = (await this.deps.repo.get('users', userKey(slug(projectName), slug(userName)))) as UserRecord | undefined
    if (!project || !user || !user.workspacePath) throw new Error('项目或用户不存在')
    return this.syncWorkspace(project, user)
  }

  /**
   * Refresh the workspace of whichever user owns this cwd, if any.
   *
   * Session creation is the natural moment: the link set is a snapshot taken
   * when the user was created, so project entries added since then are missing
   * until something re-runs the plan. Returns undefined when the cwd belongs to
   * no project user (an admin session, or an ordinary directory).
   */
  async syncWorkspaceForCwd(cwd: string): Promise<SyncReport | undefined> {
    const target = resolve(cwd)
    const user = (await this.deps.repo.list('users'))
      .map(([, value]) => value as UserRecord)
      .find((u) => u.role === 'user' && u.workspacePath !== null && resolve(u.workspacePath) === target)
    if (!user?.projectSlug) return undefined
    const project = (await this.deps.repo.get('projects', user.projectSlug)) as ProjectRecord | undefined
    if (!project) return undefined
    return this.syncWorkspace(project, user)
  }

  /** Refresh every project user's workspace; returns how many succeeded. */
  async syncAllWorkspaces(): Promise<number> {
    const projects = new Map(
      (await this.deps.repo.list('projects')).map(([key, value]) => [key, value as ProjectRecord]),
    )
    let synced = 0
    for (const [, value] of await this.deps.repo.list('users')) {
      const user = value as UserRecord
      if (user.role !== 'user' || !user.workspacePath || !user.projectSlug) continue
      const project = projects.get(user.projectSlug)
      if (!project) continue
      try {
        await this.syncWorkspace(project, user)
        synced += 1
      } catch {
        // One broken workspace must not stop the rest; the caller logs the count.
      }
    }
    return synced
  }

  /**
   * Link project entries created after the user workspace was set up, and
   * refresh the workspace's AGENTS.md to the current guard rules.
   */
  private async syncWorkspace(project: ProjectRecord, user: UserRecord): Promise<SyncReport> {
    if (!user.workspacePath) throw new Error('用户没有工作区')
    const entries = await this.deps.fs.readdir(project.workspacePath).catch(() => [] as string[])
    const plan = planUserWorkspace({
      root: this.deps.root,
      projectName: project.name,
      userName: user.name,
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
    // Refreshing matters after a rules upgrade: workspaces created earlier keep
    // a stale baseline otherwise (the official agent-instructions channel
    // re-loads the changed file per session).
    await this.deps.fs.writeFile(
      `${plan.userWorkspacePath}/AGENTS.md`,
      renderAgentsMd({
        userName: user.name,
        projectName: project.name,
        customRules: this.deps.agentsRules,
      }),
    )
    return { linked, skippedExisting }
  }

  /**
   * Physically delete one DISABLED project user: their tokens, their workspace
   * directory, and the record itself.
   *
   * The disabled gate is the safety design — a live account is never removable
   * in one step, so disabling stays a reversible stage of its own.
   */
  async deleteUser(username: string): Promise<UserDeletionReport> {
    const user = await this.resolveUser(username)
    this.assertDeletable(user)

    const project = user.projectSlug
      ? (await this.deps.repo.get('projects', user.projectSlug)) as ProjectRecord | undefined
      : undefined

    let tokensRemoved = 0
    for (const [key, value] of await this.deps.repo.list('tokens')) {
      if ((value as TokenRecord).userSlug !== user.slug) continue
      if (await this.deps.repo.delete('tokens', key)) tokensRemoved += 1
    }

    const removed = await this.removeWorkspace(user.workspacePath, project, user.name)
    await this.deps.repo.delete('users', user.slug)
    return { slug: user.slug, tokensRemoved, workspacesRemoved: removed ? [resolve(user.workspacePath!)] : [] }
  }

  /** The one-way gate both deletions share: disabled, and never an admin. */
  private assertDeletable(user: UserRecord): void {
    if (user.role === 'admin') throw new Error('不能删除管理员账号')
    if (user.status !== 'disabled') throw new Error('只能删除已禁用的用户；请先禁用')
  }

  /**
   * Physically delete a project and everything under it, once every one of its
   * users is disabled.
   *
   * A directory the operator BOUND to an existing path is deliberately kept:
   * that is their real repository, not ours to remove. Only a workspace this
   * plugin created is deleted, which is why provenance is recorded at create
   * time rather than inferred from the path.
   */
  async deleteProject(projectName: string): Promise<ProjectDeletionReport> {
    const project = (await this.deps.repo.get('projects', slug(projectName))) as
      | ProjectRecord
      | undefined
    if (!project) throw new Error(`项目 ${slug(projectName)} 不存在`)

    const users = (await this.deps.repo.list('users'))
      .map(([, value]) => value as UserRecord)
      .filter((u) => u.projectSlug === project.slug)
    // Validate EVERY user before deleting any: a rejection halfway through the
    // loop would leave some users gone and the project record stranded, and an
    // admin record inside a project would make it permanently undeletable.
    for (const user of users) this.assertDeletable(user)

    const usersDeleted: string[] = []
    const workspacesRemoved: string[] = []
    for (const user of users) {
      const report = await this.deleteUser(user.slug)
      usersDeleted.push(report.slug)
      workspacesRemoved.push(...report.workspacesRemoved)
    }

    // A user created between the read above and here would be left pointing at
    // a project that no longer exists once the record goes.
    const stragglers = (await this.deps.repo.list('users'))
      .map(([, value]) => value as UserRecord)
      .filter((u) => u.projectSlug === project.slug)
    if (stragglers.length > 0) {
      throw new Error(`项目下仍有 ${stragglers.length} 个用户；请重试删除`)
    }

    const managed = this.isManagedProjectPath(project)
    let directoryRemoved = false
    if (managed) {
      // Normalize before removing: a lexical check on a raw record path with a
      // symlink component plus `..` would pass while the kernel resolved the
      // symlink first and deleted somewhere else.
      await this.deps.fs.remove(resolve(project.workspacePath))
      directoryRemoved = true
    }
    await this.deps.repo.delete('projects', project.slug)
    return {
      slug: project.slug,
      usersDeleted,
      workspacesRemoved,
      directoryRemoved,
      ...(managed ? {} : { keptDirectory: project.workspacePath }),
    }
  }

  /**
   * Whether a project directory is one this plugin created.
   *
   * Provenance is recorded at create time. A record written before that field
   * existed falls back to the lexical check: for those, the path position is
   * the only evidence there is, and it is what they were created under.
   */
  private isManagedProjectPath(project: ProjectRecord): boolean {
    if (project.managed !== undefined) return project.managed
    return resolve(project.workspacePath) === projectWorkspacePath(this.deps.root, project.name)
  }

  /**
   * Remove a user workspace directory, but only the one this plugin would have
   * created for that user.
   *
   * The allow-list is the point: the path must be exactly the avatar path
   * derived from the project directory and the user's own name. A corrupted,
   * stale or tampered record pointing at a sibling project, another user's
   * workspace, or an arbitrary directory therefore removes nothing. The
   * containment checks after it are defence in depth for the derivation itself.
   *
   * The removal never descends through symlinks (see {@link FsPort.remove}), so
   * the project's files are safe even though the workspace is full of links
   * into it.
   */
  private async removeWorkspace(
    workspacePath: string | null,
    project: ProjectRecord | undefined,
    userName: string,
  ): Promise<boolean> {
    if (!workspacePath || !project) return false
    const target = resolve(workspacePath)
    if (target !== resolve(avatarPathBeside(project.workspacePath, userName))) return false
    const root = resolve(this.deps.root)
    const projectPath = resolve(project.workspacePath)
    if (target === projectPath || isInside(target, projectPath)) return false
    if (target === root || isInside(target, root)) return false
    if (!(await this.deps.fs.exists(target))) return false
    await this.deps.fs.remove(target)
    return true
  }
}
