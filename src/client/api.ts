/**
 * Browser-side API helpers for the projects plugin: a tiny fetch wrapper over
 * `/projects/api`, the stored bearer token, the auth-gate decision, and a
 * minimal auth event bus. Everything is dependency-injected (fetchLike /
 * storage) so the whole layer unit-tests without a browser or a running dsh.
 */

/** The fetch surface callApi needs (a subset of globalThis.fetch). */
export interface FetchLike {
  (input: string, init?: {
    method?: string
    headers?: Record<string, string>
    body?: string
  }): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>
}

/** The storage surface token helpers need (a subset of localStorage). */
export interface TokenStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Error carrying the HTTP status and the server-provided message. */
export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

/** localStorage key holding the bearer token. */
export const TOKEN_KEY = 'dsh-projects-token'

/** One API call: JSON in, JSON out, non-2xx throws {@link ApiError}. */
export async function callApi(
  fetchLike: FetchLike,
  path: string,
  opts: { method?: 'GET' | 'POST'; body?: unknown; token?: string } = {},
): Promise<unknown> {
  const headers: Record<string, string> = {}
  let body: string | undefined
  if (opts.body !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  if (opts.token) headers.authorization = `Bearer ${opts.token}`
  const res = await fetchLike(path, { method: opts.method ?? 'GET', headers, body })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) throw new ApiError(res.status, typeof json.error === 'string' ? json.error : `HTTP ${res.status}`)
  return json
}

/** Read the stored bearer token, or null. */
export function readStoredToken(storage: TokenStorage): string | null {
  return storage.getItem(TOKEN_KEY)
}

/** Persist the bearer token. */
export function writeStoredToken(storage: TokenStorage, token: string): void {
  storage.setItem(TOKEN_KEY, token)
}

/** Drop the stored bearer token (logout). */
export function clearStoredToken(storage: TokenStorage): void {
  storage.removeItem(TOKEN_KEY)
}

/** The public user shape returned by /whoami and /login. */
export interface WhoAmI {
  slug: string
  role: 'admin' | 'user'
  cwd: string | null
  /** Owning project (slug/name); null for admins and legacy responses. */
  projectSlug: string | null
  projectName: string | null
}

/** Everything the UI components need from the environment. */
export interface ClientDeps {
  fetch: FetchLike
  storage: TokenStorage
  /** Hard-reset the page after logout so every surface re-probes. */
  reload(): void
}

/** The browser environment (swappable in tests). */
export const browserDeps: ClientDeps = {
  fetch: (input, init) => globalThis.fetch(input, init),
  storage: globalThis.localStorage,
  reload: () => globalThis.location?.reload(),
}

/**
 * The gate decision: render nothing (open) or demand a login. Fails open when
 * the guard-status probe itself errors — a broken plugin API must never lock
 * the stock UI (same policy the previous tapIndex guard had).
 */
export type GateDecision =
  | { phase: 'open'; user?: WhoAmI }
  | { phase: 'login' }

/** Probe guard-status (and whoami when a token exists) and decide. */
export async function resolveGate(fetchLike: FetchLike, storage: TokenStorage): Promise<GateDecision> {
  let guardEnabled = false
  try {
    const status = await callApi(fetchLike, '/projects/api/guard-status') as { guardEnabled?: boolean }
    guardEnabled = status.guardEnabled === true
  } catch {
    return { phase: 'open' } // fail-open: probe itself failed
  }
  if (!guardEnabled) return { phase: 'open' }
  const token = readStoredToken(storage)
  if (!token) return { phase: 'login' }
  try {
    const res = await callApi(fetchLike, '/projects/api/whoami', { token }) as { user?: WhoAmI }
    return { phase: 'open', user: normalizeWhoAmI(res.user) ?? undefined }
  } catch {
    return { phase: 'login' }
  }
}

/** Fill in absent project fields from older responses (fail-soft nulls). */
function normalizeWhoAmI(user: WhoAmI | undefined): WhoAmI | null {
  if (!user) return null
  return {
    slug: user.slug,
    role: user.role,
    cwd: user.cwd ?? null,
    projectSlug: user.projectSlug ?? null,
    projectName: user.projectName ?? null,
  }
}

/** Resolve the current user through the stored token; null when absent. */
export async function whoAmI(deps: ClientDeps): Promise<WhoAmI | null> {
  const token = readStoredToken(deps.storage)
  if (!token) return null
  try {
    const res = await callApi(deps.fetch, '/projects/api/whoami', { token }) as { user?: WhoAmI }
    return normalizeWhoAmI(res.user)
  } catch {
    return null
  }
}

/** Login with credentials, persist the minted token, return the user. */
export async function login(deps: ClientDeps, username: string, password: string): Promise<WhoAmI> {
  const res = await callApi(deps.fetch, '/projects/api/login', {
    method: 'POST',
    body: { username, password },
  }) as { token: string; user: WhoAmI }
  writeStoredToken(deps.storage, res.token)
  authEvents.emit('changed')
  return res.user
}

/** Drop the token, notify listeners, and reload so the gate re-arms. */
export function logout(deps: ClientDeps): void {
  clearStoredToken(deps.storage)
  authEvents.emit('changed')
  deps.reload()
}

/** Auth state change notifications shared by the gate, badge and console. */
class AuthEventBus {
  private readonly target = typeof EventTarget !== 'undefined' ? new EventTarget() : undefined
  private readonly handlers = new Set<() => void>()

  /** Subscribe to 'changed'; returns the unsubscribe function. */
  on(event: 'changed', handler: () => void): () => void {
    const target = this.target
    if (target) {
      target.addEventListener(event, handler)
      return () => target.removeEventListener(event, handler)
    }
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  /** Fire a 'changed' notification. */
  emit(event: 'changed'): void {
    if (this.target) {
      this.target.dispatchEvent(new Event(event))
    } else {
      for (const h of [...this.handlers]) h()
    }
  }
}

export const authEvents = new AuthEventBus()
