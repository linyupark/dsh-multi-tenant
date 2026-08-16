// @vitest-environment jsdom
/**
 * Client-side API helpers: fetch wrapper, token storage, and the auth-gate
 * decision — all dependency-injected (fetchLike / storage) so they unit-test
 * without a browser or a running dsh.
 */
import { describe, expect, it } from 'vitest'
import {
  ApiError,
  TOKEN_KEY,
  callApi,
  clearStoredToken,
  login,
  logout,
  readStoredToken,
  resolveGate,
  writeStoredToken,
  authEvents,
  type ClientDeps,
  type FetchLike,
  type TokenStorage,
} from '../src/client/api.ts'

/** Minimal fetch double scripted per URL. */
function fakeFetch(routes: Record<string, { status: number; body?: unknown }>): FetchLike {
  return async (input: string, init?: { method?: string; headers?: Record<string, string> }) => {
    const route = routes[`${init?.method ?? 'GET'} ${input}`]
    if (!route) return { ok: false, status: 404, json: async () => ({ error: 'not found' }) }
    return { ok: route.status < 400, status: route.status, json: async () => route.body }
  }
}

/** Minimal localStorage double. */
function fakeStorage(initial: Record<string, string> = {}): TokenStorage {
  const store = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
}

describe('callApi', () => {
  it('GETs JSON and returns the parsed body', async () => {
    const fetch = fakeFetch({ 'GET /projects/api/guard-status': { status: 200, body: { guardEnabled: true } } })
    await expect(callApi(fetch, '/projects/api/guard-status')).resolves.toEqual({ guardEnabled: true })
  })

  it('POSTs a JSON body with the right headers', async () => {
    let seen: { body?: string; headers?: Record<string, string> } = {}
    const fetch: FetchLike = async (_input, init) => {
      seen = { body: init?.body as string, headers: init?.headers }
      return { ok: true, status: 200, json: async () => ({ ok: true }) }
    }
    await callApi(fetch, '/projects/api/admin/disable', {
      method: 'POST',
      body: { username: 'bob' },
      token: 'tok',
    })
    expect(seen.body).toBe(JSON.stringify({ username: 'bob' }))
    expect(seen.headers?.['content-type']).toBe('application/json')
    expect(seen.headers?.authorization).toBe('Bearer tok')
  })

  it('throws ApiError carrying the server message on failure', async () => {
    const fetch = fakeFetch({ 'POST /projects/api/login': { status: 401, body: { error: '用户名或密码错误' } } })
    const err = await callApi(fetch, '/projects/api/login', { method: 'POST', body: {} }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(401)
    expect((err as ApiError).message).toBe('用户名或密码错误')
  })
})

describe('token storage', () => {
  it('round-trips a token through the storage port', () => {
    const storage = fakeStorage()
    expect(readStoredToken(storage)).toBeNull()
    writeStoredToken(storage, 'abc')
    expect(storage.getItem(TOKEN_KEY)).toBe('abc')
    clearStoredToken(storage)
    expect(readStoredToken(storage)).toBeNull()
  })
})

describe('resolveGate', () => {
  it('opens immediately when the guard is disabled', async () => {
    const fetch = fakeFetch({ 'GET /projects/api/guard-status': { status: 200, body: { guardEnabled: false } } })
    await expect(resolveGate(fetch, fakeStorage())).resolves.toEqual({ phase: 'open' })
  })

  it('opens for a valid stored token', async () => {
    const fetch = fakeFetch({
      'GET /projects/api/guard-status': { status: 200, body: { guardEnabled: true } },
      'GET /projects/api/whoami': {
        status: 200,
        body: { user: { slug: 'bob', role: 'user', cwd: '/w', projectSlug: 'demo', projectName: 'demo' } },
      },
    })
    await expect(resolveGate(fetch, fakeStorage({ [TOKEN_KEY]: 'tok' }))).resolves.toEqual({
      phase: 'open',
      user: { slug: 'bob', role: 'user', cwd: '/w', projectSlug: 'demo', projectName: 'demo' },
    })
  })

  it('demands login when the stored token is rejected', async () => {
    const fetch = fakeFetch({
      'GET /projects/api/guard-status': { status: 200, body: { guardEnabled: true } },
      'GET /projects/api/whoami': { status: 401, body: { error: 'token 无效' } },
    })
    await expect(resolveGate(fetch, fakeStorage({ [TOKEN_KEY]: 'stale' }))).resolves.toEqual({ phase: 'login' })
  })

  it('demands login when no token is stored', async () => {
    const fetch = fakeFetch({ 'GET /projects/api/guard-status': { status: 200, body: { guardEnabled: true } } })
    await expect(resolveGate(fetch, fakeStorage())).resolves.toEqual({ phase: 'login' })
  })

  it('fails open when the guard-status probe itself errors', async () => {
    await expect(resolveGate(fakeFetch({}), fakeStorage())).resolves.toEqual({ phase: 'open' })
  })
})

describe('authEvents', () => {
  it('notifies subscribers when the auth state changes', () => {
    const seen: string[] = []
    const off = authEvents.on('changed', () => seen.push('x'))
    authEvents.emit('changed')
    off()
    authEvents.emit('changed')
    expect(seen).toEqual(['x'])
  })
})

describe('login/logout round trip', () => {
  it('logout clears the token, notifies, and reloads the page', () => {
    const reloads: number[] = []
    const d: ClientDeps = {
      fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
      storage: fakeStorage({ [TOKEN_KEY]: 'stale' }),
      reload() { reloads.push(1) },
    }
    let notified = 0
    const off = authEvents.on('changed', () => { notified += 1 })
    logout(d)
    off()
    expect(readStoredToken(d.storage)).toBeNull()
    expect(notified).toBe(1)
    expect(reloads.length).toBe(1)
  })

  it('login persists the minted token and returns the project-bearing user', async () => {
    const d: ClientDeps = {
      fetch: fakeFetch({
        'POST /projects/api/login': {
          status: 200,
          body: { token: 'fresh', user: { slug: 'bob', role: 'user', cwd: '/w/demo-bob', projectSlug: 'demo', projectName: 'demo' } },
        },
      }),
      storage: fakeStorage(),
      reload() { /* no-op in tests */ },
    }
    const user = await login(d, 'bob', 'bob12345')
    expect(user.projectName).toBe('demo')
    expect(readStoredToken(d.storage)).toBe('fresh')
  })
})
