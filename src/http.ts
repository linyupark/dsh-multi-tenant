/**
 * Transport-agnostic API dispatcher. The webserver route handler adapts
 * node req/res onto ApiRequest/ApiResponse; everything here is pure and
 * unit-tested.
 */
import type { ProjectsService } from './service.ts'

/** A request already normalized off the wire. */
export interface ApiRequest {
  method: string
  /** Path below the mount point, always starts with `/`. */
  path: string
  /** Parsed JSON body (POST). */
  body?: Record<string, unknown>
  /** Bearer token when the client presented one. */
  token?: string
}

/** A response ready to be written back. */
export interface ApiResponse {
  status: number
  json?: unknown
}

/** Optional bridge to ctx.sessionQuery.filterSessions (cwd bucketing). */
export type SessionLister = (cwd: string) => Promise<Array<Record<string, unknown>>>

/** Dispatcher dependencies. */
export interface ApiDeps {
  service: ProjectsService
  sessionLister?: SessionLister
}

function json(status: number, body: unknown): ApiResponse {
  return { status, json: body }
}

function fail(status: number, error: string): ApiResponse {
  return { status, json: { error } }
}

interface Route {
  method: string
  pattern: RegExp
  admin?: boolean
  user?: boolean
  handler: (m: RegExpMatchArray, req: ApiRequest, deps: ApiDeps, auth: { role: string; slug: string; cwd: string | null; projectSlug: string | null }) => Promise<ApiResponse>
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

const routes: Route[] = [
  {
    method: 'POST',
    pattern: /^\/login$/,
    async handler(_m, req, deps) {
      const username = str(req.body?.username)
      const password = str(req.body?.password)
      if (!username || !password) return fail(400, 'username 与 password 必填')
      try {
        const session = await deps.service.login(username, password)
        return json(200, session)
      } catch (e) {
        return fail(401, (e as Error).message)
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/whoami$/,
    user: true,
    async handler(_m, _req, deps, auth) {
      let projectName: string | null = null
      if (auth.projectSlug) {
        const projects = await deps.service.listProjects()
        projectName = projects.find((p) => p.slug === auth.projectSlug)?.name ?? null
      }
      return json(200, {
        user: {
          slug: auth.slug,
          role: auth.role,
          cwd: auth.cwd,
          projectSlug: auth.projectSlug,
          projectName,
        },
      })
    },
  },
  {
    method: 'GET',
    pattern: /^\/my\/sessions$/,
    user: true,
    async handler(_m, _req, deps, auth) {
      if (!auth.cwd) return fail(400, '管理员没有用户工作区')
      if (!deps.sessionLister) return fail(501, 'sessionQuery 不可用')
      const sessions = await deps.sessionLister(auth.cwd)
      return json(200, { sessions })
    },
  },
  {
    method: 'GET',
    pattern: /^\/admin\/overview$/,
    admin: true,
    async handler(_m, _req, deps) {
      return json(200, {
        projects: await deps.service.listProjects(),
        users: await deps.service.listUsers(null),
      })
    },
  },
  {
    method: 'POST',
    pattern: /^\/admin\/projects$/,
    admin: true,
    async handler(_m, req, deps) {
      const name = str(req.body?.name)
      if (!name) return fail(400, 'name 必填')
      const workspacePath = str(req.body?.workspacePath)
      try {
        const project = await deps.service.createProject(name, workspacePath || undefined)
        return json(201, { project })
      } catch (e) {
        return fail(409, (e as Error).message)
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/admin\/users$/,
    admin: true,
    async handler(_m, req, deps) {
      const project = str(req.body?.project)
      const username = str(req.body?.username)
      const password = str(req.body?.password)
      if (!project || !username || !password) return fail(400, 'project/username/password 必填')
      try {
        const user = await deps.service.createUser(project, username, password)
        return json(201, { user: { slug: user.slug, name: user.name, workspacePath: user.workspacePath } })
      } catch (e) {
        return fail(409, (e as Error).message)
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/admin\/disable$/,
    admin: true,
    async handler(_m, req, deps) {
      const username = str(req.body?.username)
      if (!username) return fail(400, 'username 必填')
      try {
        await deps.service.disableUser(username)
        return json(200, { ok: true })
      } catch (e) {
        return fail(404, (e as Error).message)
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/admin\/delete-user$/,
    admin: true,
    async handler(_m, req, deps) {
      const username = str(req.body?.username)
      if (!username) return fail(400, 'username 必填')
      try {
        return json(200, await deps.service.deleteUser(username))
      } catch (e) {
        return fail(409, (e as Error).message)
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/admin\/delete-project$/,
    admin: true,
    async handler(_m, req, deps) {
      const project = str(req.body?.project)
      if (!project) return fail(400, 'project 必填')
      try {
        return json(200, await deps.service.deleteProject(project))
      } catch (e) {
        return fail(409, (e as Error).message)
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/admin\/sync$/,
    admin: true,
    async handler(_m, req, deps) {
      const project = str(req.body?.project)
      const username = str(req.body?.username)
      if (!project || !username) return fail(400, 'project/username 必填')
      try {
        return json(200, await deps.service.syncUserWorkspace(project, username))
      } catch (e) {
        return fail(404, (e as Error).message)
      }
    },
  },
]

/** Build the pure API dispatcher. */
export function createProjectsApi(deps: ApiDeps): (req: ApiRequest) => Promise<ApiResponse> {
  return async (req) => {
    const route = routes.find((r) => r.pattern.test(req.path))
    if (!route) return fail(404, 'not found')
    if (route.method !== req.method) return fail(405, 'method not allowed')
    let auth: { role: string; slug: string; cwd: string | null; projectSlug: string | null } | undefined
    if (route.user || route.admin) {
      if (!req.token) return fail(401, 'missing token')
      try {
        const user = await deps.service.authenticate(req.token)
        auth = { role: user.role, slug: user.slug, cwd: user.workspacePath, projectSlug: user.projectSlug ?? null }
      } catch (e) {
        return fail(401, (e as Error).message)
      }
      if (route.admin && auth.role !== 'admin') return fail(403, '需要管理员')
    }
    const m = req.path.match(route.pattern)!
    return route.handler(m, req, deps, auth ?? { role: 'anonymous', slug: '', cwd: null, projectSlug: null })
  }
}
