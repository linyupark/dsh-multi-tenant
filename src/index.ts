/**
 * dsh-multi-tenant-projects — host plugin.
 *
 * Project-scoped one-shot users on a single DSH instance:
 *  - project workspace  <root>/<projectSlug>          (the real source)
 *  - user workspace     <root>/<projectSlug>-<user>   (real dir, entries are
 *    symlinks back into the project, plus a per-user AGENTS.md that DSH
 *    auto-injects as the soft constraint)
 *  - cwd session bucketing (filterSessions kind:'cwd') and per-user session
 *    listing through the same mechanism
 *  - token auth (scrypt + sha256 fingerprints) with a JSON API under
 *    /projects/api; the browser half (src/client/) mounts the login gate on
 *    `shell.overlay` and the admin console on `settings.section`
 *
 * Threat model: 防君子不防小人 (best effort). The hard boundary stays at the
 * tunnel/reverse-proxy layer in front of dsh; nothing inside this plugin is
 * a hard security boundary.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-workspace'
import z from '@deepseek-ai/schemastery'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { appendFileSync } from 'node:fs'
import { ProjectsService } from './service.ts'
import { JsonFileRepo, StorageDomainRepo, type Repo, type DomainHandleLike } from './repo.ts'
import { NodeFsPort } from './fs-port.ts'
import { syncUserWorkspaces, type WorkspaceRegistryLike } from './workspace-sync.ts'
import { createProjectsApi, type ApiRequest, type ApiResponse, type SessionLister } from './http.ts'
import { ProjectRecord, UserRecord, TokenRecord, RoleRecord } from './records.ts'
import { LOCKED_PRESET, isProjectUserWorkspace, permissionLockResult } from './permission-lock.ts'
import { GUARD_SECTION_NAME, GUARD_SECTION_ORDER, restrictedGuardSectionText } from './prompt-guard.ts'
import { applyTitleFold, type TitleFoldObservation } from './title-fold.ts'

/** Plugin id (matches the cordis.patch.yml row). */
export const name = 'projects'

/** The webserver carries all our routes; settings carries the config UI. */
export const inject = ['webServer']

/**
 * Profile entry id (the `cordis.patch.yml` row id). 0.2.0 removed the
 * `settingsNamespace` helper: the Settings service keys each form by the
 * plugin's profile entry id, so this is the id, not a namespace object.
 */
export const PROJECTS_SETTINGS_NAMESPACE = name

/**
 * Storage-domain unit name for the projects/users tables. The harness's
 * `UNIT_NAME_RE` (`/^[a-z][a-z0-9_]*$/`) rejects hyphens, so this is an
 * underscore name; a hyphen made `defineDomain` throw and quietly degraded
 * the store to the JSON fallback.
 */
export const PROJECTS_DOMAIN_NAME = 'projects_users'

/**
 * Plugin configuration.
 *
 * In 0.2.0 the schema below *is* the settings schema — there is nothing to
 * register. Ordinary fields are deployment configuration and changing one
 * remounts this plugin (the Loader's ordinary update path), so they take
 * effect on re-apply. `guardEnabled` is the one live-tunable field: it is
 * `.volatile()`, read per request, and exposed to configuration clients as a
 * stable reference.
 */
export const Config = z.object({
  /** Root holding every project/user workspace. */
  workspaceRoot: z.string().default(join(homedir(), '.dsh', 'projects-ws')),
  /** Bootstrap admin password, applied only when the user store is empty. */
  adminPassword: z.string().default('admin'),
  /** Bearer token lifetime in hours. */
  tokenTtlHours: z.number().default(72),
  /** Redirect unauthenticated browsers to the login card; read live. */
  guardEnabled: z.boolean().default(true).volatile(),
  /** Extra AGENTS.md rules appended for every user workspace. */
  agentsRules: z.array(z.string()),
})

/** The validated configuration {@link Config} produces. */
export type Config = ReturnType<typeof Config>

/**
 * The projects/users domain spec, built through the harness's own
 * `defineDomain`/`domainTable` so an invalid unit name, version or table set
 * fails here (and in the test) instead of silently degrading the store.
 */
export async function buildProjectsDomainSpec(): Promise<unknown> {
  const domainModule = (await import('@deepseek-ai/dsh-storage-domain')) as {
    defineDomain: (spec: unknown) => unknown
    domainTable: (schema: unknown) => unknown
  }
  return domainModule.defineDomain({
    name: PROJECTS_DOMAIN_NAME,
    version: 1,
    tables: {
      projects: domainModule.domainTable(ProjectRecord),
      users: domainModule.domainTable(UserRecord),
      tokens: domainModule.domainTable(TokenRecord),
      roles: domainModule.domainTable(RoleRecord),
    },
  })
}

/** Prefer the official typed domain storage; fall back to a JSON file. */
async function makeDomainRepo(
  storageDomain: { open(spec: unknown): Promise<DomainHandleLike> },
): Promise<Repo> {
  return new StorageDomainRepo(
    await storageDomain.open(await buildProjectsDomainSpec()),
  )
}

/** Wire the plugin: repo, service, routes, guard tap and settings page. */
export function apply(
  ctx: Context,
  config: Config = Config({}),
): void {
  let service: ProjectsService | undefined
  let sessionLister: SessionLister | undefined
  /** Set while the workspaceRegistry nested plugin is live; re-syncs user workspaces. */
  let syncWorkspaces: (() => Promise<void>) | undefined

  const bootService = (repo: Repo): void => {
    void (async () => {
      try {
        service = new ProjectsService({
          repo,
          fs: NodeFsPort,
          now: () => Date.now(),
          root: resolve(config.workspaceRoot),
          tokenTtlMs: config.tokenTtlHours * 3_600_000,
          adminPassword: config.adminPassword,
          agentsRules: config.agentsRules,
        })
        await service.init()
        ctx.logger.info(
          'projects: 就绪（root=%s，guard=%s）',
          resolve(config.workspaceRoot),
          config.guardEnabled.get(),
        )
      } catch (error) {
        ctx.logger.error('projects: 初始化失败（%s）', String(error))
      }
    })()
  }

  // Optional dependency via nested plugin: cordis inject is hard-required,
  // but a nested fiber whose service is absent simply stays inactive — the
  // idiomatic optional-inject. Accessing ctx.sessionQuery / ctx.storageDomain
  // directly from this fiber throws ("cannot get property without inject"),
  // which is exactly what 400'd every API request in the first build.
  ctx.plugin({
    name: 'projects.storage',
    inject: ['storageDomain'],
    apply(sctx) {
      void (async () => {
        try {
          const repo = await makeDomainRepo(sctx.storageDomain)
          sctx.effect(() => () => void repo.close?.())
          ctx.logger.info('projects: 使用 storageDomain 存储（单元 projects-users）')
          bootService(repo)
        } catch (error) {
          ctx.logger.warn('projects: storageDomain 打开失败，回退 JSON 存储（%s）', String(error))
          bootService(new JsonFileRepo(join(homedir(), '.dsh', 'dsh-multi-tenant-projects', 'state.json')))
        }
      })()
    },
  })

  // JSON-file fallback when the storageDomain service never shows up (5s).
  const fallbackTimer = setTimeout(() => {
    if (service) return
    ctx.logger.info('projects: storageDomain 服务未激活，使用 JSON 文件存储')
    bootService(new JsonFileRepo(join(homedir(), '.dsh', 'dsh-multi-tenant-projects', 'state.json')))
  }, 5_000)
  ctx.effect(() => () => clearTimeout(fallbackTimer))

  ctx.plugin({
    name: 'projects.sessions',
    inject: ['sessionQuery'],
    apply(sctx) {
      // Capture the service VALUE once, while this fiber is active. Reading
      // `sctx.sessionQuery` per request throws "cannot get required service in
      // inactive context" once this optional child is torn down, while the
      // closure itself outlives it through the route.
      const engine = sctx.sessionQuery
      sessionLister = async (cwd) => {
        try {
          const rows = await engine.filterSessions([{ kind: 'cwd', values: [cwd] }])
          const base = rows.map((r) => ({
            id: r.header.id,
            live: r.live,
            persisted: r.persisted,
            title: (r.header as { title?: string } | undefined)?.title,
          }))
          // The stock client list RPC only carries titles of sessions whose
          // object layer is hot (opened once during this host lifetime); cold
          // sessions would fall back to the cwd directory name in the sidebar.
          // Fold the durable log-backed titles so every row is self-sufficient.
          try {
            const fold = (engine as unknown as {
              readTitleSnapshots?(ids: readonly string[]): Promise<readonly TitleFoldObservation[]>
            }).readTitleSnapshots
            if (fold === undefined || base.length === 0) return base
            const observations = await fold.call(engine, base.map((r) => r.id))
            return applyTitleFold(base, observations)
          } catch (error) {
            ctx.logger.warn('projects: title fold 失败，列表保持原样（%s）', String(error))
            return base
          }
        } catch (error) {
          // Fail closed: an unavailable session query yields an empty list
          // rather than another tenant's rows.
          ctx.logger.warn('projects: 会话列表查询失败，返回空列表（%s）', String(error))
          return []
        }
      }
    },
  })

  // Register every user workspace into the official workspaceRegistry so the
  // stock Web Client can open sessions in them (and the restricted sidebar
  // finds its rows). Optional-inject again: the registry service is absent on
  // bare hosts; the sync then simply never arms.
  ctx.plugin({
    name: 'projects.workspaces',
    inject: ['workspaceRegistry'],
    apply(sctx) {
      const registry = sctx.workspaceRegistry as WorkspaceRegistryLike
      // Captured once: this closure is reached from the route handler, which
      // can outlive this optional child.
      const log = sctx.logger
      const attempt = async (): Promise<boolean> => {
        const svc = service
        if (!svc) return false
        try {
          const count = await syncUserWorkspaces(() => svc.listUsers(null), registry, (error) => {
            log.warn('projects: 用户工作区注册失败（%s）', String(error))
          })
          if (count > 0) log.info('projects: 已同步 %d 个用户工作区到 workspaceRegistry', count)
        } catch {
          return false // listUsers failed (service still booting) — retry
        }
        return true
      }
      const timer = setInterval(() => {
        void attempt().then((ok) => { if (ok) clearInterval(timer) })
      }, 1_000)
      sctx.effect(() => () => {
        clearInterval(timer)
        syncWorkspaces = undefined
      })
      void attempt().then((ok) => { if (ok) clearInterval(timer) })
      // Later admin mutations (create user / sync links) re-run the idempotent sync.
      syncWorkspaces = async () => {
        const svc = service
        if (!svc) return
        await syncUserWorkspaces(() => svc.listUsers(null), registry, (error) => {
          log.warn('projects: 用户工作区注册失败（%s）', String(error))
        })
      }
    },
  })

  // ---- permission lock for project users (防君子 layer) --------------------
  //
  // Two host-side guards, both keyed on "this session's cwd bucket is a
  // project-user workspace":
  //  1. `session/created` → pin the session to workspace-write (the official
  //     permissionPresets service's own set() — idempotent, no-op when the
  //     deployment default already matches);
  //  2. `agent/created` → register a per-agent shadow of the `permission`
  //     command under that agent's scoped context (the official per-agent
  //     variant mechanism): queries report the locked preset, switches are
  //     refused. Admin/global sessions keep the stock command untouched.
  // Optional-inject: absent services simply leave the lock unarmed.
  ctx.plugin({
    name: 'projects.permissions',
    inject: ['commands', 'permissionPresets'],
    apply(sctx) {
      /** Narrowed face of the official permission-preset service. */
      const presets = (sctx as unknown as {
        permissionPresets: {
          names?: readonly string[]
          set(session: unknown, name: string): void
        }
      }).permissionPresets
      /** Narrowed face of the official command registry. */
      const commands = (sctx as unknown as {
        commands: {
          register(definition: {
            name: string
            description: string
            input?: { hint: string }
            handler: (args: { rawInput?: string }) => { kind: 'success' | 'error'; text: string }
          }): () => void
        }
      }).commands

      // Cached user-workspace paths (refreshed lazily; the cwd check is
      // synchronous inside the event listeners below).
      let userPaths: string[] = []
      let lockSupported: boolean | undefined
      const refreshPaths = async (): Promise<void> => {
        const svc = service
        if (!svc) return
        try {
          const users = await svc.listUsers(null)
          userPaths = users.flatMap((u) => (u.role === 'user' && u.workspacePath ? [u.workspacePath] : []))
        } catch {
          /* service still booting — keep the previous cache */
        }
      }

      const locked = (cwd: string | undefined): boolean => isProjectUserWorkspace(cwd, userPaths)

      /** Pin one freshly created session to the locked preset. */
      const pinSession = (session: unknown): void => {
        const cwd = (session as { header?: { cwd?: string } } | undefined)?.header?.cwd
        if (!locked(cwd)) return
        if (lockSupported === undefined) {
          lockSupported = presets.names?.includes(LOCKED_PRESET) ?? false
          if (!lockSupported) {
            sctx.logger.warn('projects: 部署未配置 %s 权限预设，普通用户权限锁定未生效', LOCKED_PRESET)
          }
        }
        if (!lockSupported) return
        try {
          presets.set(session, LOCKED_PRESET)
        } catch (error) {
          sctx.logger.warn('projects: 权限锁定失败（%s）', String(error))
        }
      }

      // Warm the cache, then keep it fresh (users get created at runtime).
      void refreshPaths()
      const refreshTimer = setInterval(() => { void refreshPaths() }, 5_000)
      sctx.effect(() => () => clearInterval(refreshTimer))

      const onSession = 'session/created'
      ;(sctx as unknown as {
        on(event: typeof onSession, listener: (session: unknown) => void): void
      }).on(onSession, (session) => {
        void refreshPaths().then(() => pinSession(session))
      })

      const onAgent = 'agent/created'
      ;(sctx as unknown as {
        on(event: typeof onAgent, listener: (payload: { agent: unknown }) => void): void
      }).on(onAgent, ({ agent }) => {
        const a = agent as {
          session?: { header?: { cwd?: string } } | undefined
          ctx?: { inject: (deps: string[], cb: (c: unknown) => void) => void }
        } | undefined
        if (!a?.ctx) return
        const cwd = a.session?.header?.cwd
        if (!locked(cwd)) return
        // The per-agent variant: registered under the agent's own context it
        // shadows the global `permission` command for exactly this agent and
        // disposes with it.
        a.ctx.inject(['commands'], (agentCmdCtx) => {
          const cmdCtx = agentCmdCtx as unknown as {
            commands?: typeof commands
            effect(fn: () => () => void): void
          }
          const register = cmdCtx.commands?.register
          if (!register) return
          try {
            // Own the disposer explicitly: `register` returns a plain remover
            // and does not tie itself to the calling fiber.
            cmdCtx.effect(() => register({
              name: 'permission',
              description: 'Switch the permission preset (locked to workspace-write for project users)',
              input: { hint: '<preset>' },
              handler: ({ rawInput }) => permissionLockResult(rawInput ?? ''),
            }))
          } catch (error) {
            sctx.logger.warn('projects: 权限命令遮蔽注册失败（%s）', String(error))
          }
        })
        // Guard section in the system prompt body itself (strongest layer of
        // the tenant boundary; the AGENTS.md baseline is the softer second
        // layer). Scoped to this agent — registration disposes with it.
        // Call CHAINED on the service proxy: destructuring `.section` drops
        // the receiver and the registry call fails on `this.layers`.
        a.ctx.inject(['systemPrompt'], (agentPromptCtx) => {
          const promptCtx = agentPromptCtx as unknown as {
            systemPrompt?: { section(s: unknown): () => void }
            effect(fn: () => () => void): void
          }
          const sp = promptCtx.systemPrompt
          if (!sp) return
          try {
            // Own the disposer explicitly; the section registry does not tie
            // itself to the calling fiber.
            promptCtx.effect(() => sp.section({
              name: GUARD_SECTION_NAME,
              order: GUARD_SECTION_ORDER,
              text: restrictedGuardSectionText(),
            }))
          } catch (error) {
            sctx.logger.warn('projects: 系统提示词守则注入失败（%s）', String(error))
          }
        })
      })

      sctx.logger.info('projects: 普通用户权限锁定已布防（preset=%s）', LOCKED_PRESET)
    },
  })

  // ---- routes -------------------------------------------------------------

  const readBody = (req: { on: unknown }): Promise<Record<string, unknown>> =>
    new Promise((resolveBody) => {
      const r = req as { on(e: string, cb: (c: Buffer) => void): void }
      const chunks: Buffer[] = []
      r.on('data', (c) => chunks.push(c))
      r.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8')
          resolveBody(raw ? (JSON.parse(raw) as Record<string, unknown>) : {})
        } catch {
          resolveBody({})
        }
      })
    })

  const writeJson = (res: {
    writeHead(status: number, headers: Record<string, string>): void
    end(body: string): void
  }, response: ApiResponse): void => {
    res.writeHead(response.status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(response.json ?? {}))
  }

  const tokenOf = (header: string | undefined): string | undefined => {
    if (!header?.startsWith('Bearer ')) return undefined
    const t = header.slice(7).trim()
    return t.length > 0 ? t : undefined
  }

  // JSON API under /projects/api
  const DEBUG_LOG = join(homedir(), '.dsh', 'projects-debug.log')
  const reportError = (err: unknown): string => {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err)
    try {
      appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ${msg}\n`)
    } catch {
      /* best effort */
    }
    return msg
  }
  /** Lazy, throw-proof service lookup: a dead/reloading context must not 400 the API. */

  // Own the route through this fiber: `webServer.register` returns a plain
  // remover and leaves the route in the table otherwise, so a recomposition
  // would keep serving the old handler and the replacement registration would
  // throw "duplicate prefix route".
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/projects/api',
    handler: async (req, res) => {
      try {
        if (!service) {
          writeJson(res, { status: 503, json: { error: '初始化中，请稍后重试' } })
          return
        }
        const api = createProjectsApi({ service, sessionLister })
        const url = new URL(req.url ?? '/', 'http://local')
        const path = url.pathname.replace(/^\/projects\/api/, '') || '/'
        const request: ApiRequest = {
          method: req.method ?? 'GET',
          path,
          body: req.method === 'POST' ? await readBody(req) : undefined,
          token: tokenOf(req.headers.authorization),
        }
        if (request.path === '/guard-status') {
          writeJson(res, { status: 200, json: { guardEnabled: config.guardEnabled.get() } })
          return
        }
        const response = await api(request)
        writeJson(res, response)
        // Mutating admin endpoints may have created user workspaces — re-sync
        // the (idempotent) workspace registry registration in the background.
        if (response.status < 400 && request.method === 'POST' && request.path.startsWith('/admin/')) {
          void syncWorkspaces?.()
        }
      } catch (err) {
        try {
          writeJson(res, { status: 500, json: { error: reportError(err) } })
        } catch {
          /* headers already sent — nothing more we can do */
        }
      }
    },
  }))

  // The browser half (exports["./client"] — see src/client/) renders the
  // login gate on `shell.overlay` and the admin console on `settings.section`
  // inside the official Web Client. The host only serves the JSON API.

  // ---- settings ------------------------------------------------------------
  //
  // 0.2.0 derives configuration forms from the plugin's own `Config` schema,
  // keyed by this profile entry's id — `installSettingsSection` and
  // `settingsNamespace` no longer exist, and there is nothing to register in
  // their place. The call below only records the presentation policy: this
  // plugin ships its own Settings page (the "Projects & Users" console on the
  // client's `settings.section` seat), so a schema-derived page is suppressed.
  // It runs in an optional child so the plugin still works without Settings.

  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })
}
