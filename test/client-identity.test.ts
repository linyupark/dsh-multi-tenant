// @vitest-environment jsdom
/**
 * The client identity controller: one shared resolution of "who is at the
 * browser" (guard-status + stored token + whoami) that drives every restricted
 * seat — shadowing must activate for normal users only, and re-resolve when
 * the auth state changes (login/logout).
 */
import { describe, expect, it } from 'vitest'
import {
  resolveIdentity,
  shouldRestrictUi,
  watchIdentity,
  type IdentityState,
} from '../src/client/identity.ts'
import { TOKEN_KEY, authEvents, type ClientDeps } from '../src/client/api.ts'

function deps(
  routes: Record<string, { status: number; body?: unknown }>,
  token: string | null = 'tok',
): ClientDeps {
  const storage = {
    store: new Map<string, string>(token ? [[TOKEN_KEY, token]] : []),
    getItem(k: string) { return this.store.get(k) ?? null },
    setItem(k: string, v: string) { this.store.set(k, v) },
    removeItem(k: string) { this.store.delete(k) },
  }
  return {
    fetch: async (input: string, init?: { method?: string }) => {
      const route = routes[`${init?.method ?? 'GET'} ${input}`]
      if (!route) return { ok: false, status: 404, json: async () => ({ error: 'not found' }) }
      return { ok: route.status < 400, status: route.status, json: async () => route.body }
    },
    storage,
    reload() { /* no-op in tests */ },
  }
}

const USER = { slug: 'bob', role: 'user' as const, cwd: '/w/demo-bob', projectSlug: 'demo', projectName: 'demo' }
const ADMIN = { slug: 'admin', role: 'admin' as const, cwd: null, projectSlug: null, projectName: null }

describe('resolveIdentity', () => {
  it('resolves guard-off when the guard is disabled', async () => {
    const state = await resolveIdentity(deps({ 'GET /projects/api/guard-status': { status: 200, body: { guardEnabled: false } } }))
    expect(state.kind).toBe('guard-off')
  })

  it('resolves anonymous when the guard is on but no token is stored', async () => {
    const routes = { 'GET /projects/api/guard-status': { status: 200, body: { guardEnabled: true } } }
    const state = await resolveIdentity(deps(routes, null))
    expect(state.kind).toBe('anonymous')
  })

  it('resolves user for a valid normal-user token', async () => {
    const routes = {
      'GET /projects/api/guard-status': { status: 200, body: { guardEnabled: true } },
      'GET /projects/api/whoami': { status: 200, body: { user: USER } },
    }
    const state = await resolveIdentity(deps(routes))
    expect(state).toEqual({ kind: 'user', user: USER })
  })

  it('resolves admin for an admin token', async () => {
    const routes = {
      'GET /projects/api/guard-status': { status: 200, body: { guardEnabled: true } },
      'GET /projects/api/whoami': { status: 200, body: { user: ADMIN } },
    }
    const state = await resolveIdentity(deps(routes))
    expect(state).toEqual({ kind: 'admin', user: ADMIN })
  })

  it('resolves anonymous when the stored token is rejected (fail-open)', async () => {
    const routes = {
      'GET /projects/api/guard-status': { status: 200, body: { guardEnabled: true } },
      'GET /projects/api/whoami': { status: 401, body: { error: 'token 无效' } },
    }
    const state = await resolveIdentity(deps(routes))
    expect(state.kind).toBe('anonymous')
  })

  it('resolves guard-off when the probe itself errors (fail-open)', async () => {
    const state = await resolveIdentity(deps({}))
    expect(state.kind).toBe('guard-off')
  })
})

describe('shouldRestrictUi', () => {
  it('restricts only normal users', () => {
    expect(shouldRestrictUi({ kind: 'user', user: USER })).toBe(true)
    expect(shouldRestrictUi({ kind: 'admin', user: ADMIN })).toBe(false)
    expect(shouldRestrictUi({ kind: 'anonymous' })).toBe(false)
    expect(shouldRestrictUi({ kind: 'guard-off' })).toBe(false)
    expect(shouldRestrictUi({ kind: 'resolving' })).toBe(false)
  })
})

describe('watchIdentity', () => {
  it('publishes the resolved state and re-resolves on auth changes', async () => {
    let me: { role: string; cwd: string | null } | undefined
    const routes = () => ({
      'GET /projects/api/guard-status': { status: 200, body: { guardEnabled: true } },
      'GET /projects/api/whoami': { status: 200, body: { user: me } },
    })
    me = { role: 'user', cwd: '/w/demo-bob' }
    const d: ClientDeps = {
      fetch: async (input: string, init?: { method?: string }) => {
        const table: Record<string, { status: number; body?: unknown }> = routes()
        const route = table[`${init?.method ?? 'GET'} ${input}`]
        if (!route) return { ok: false, status: 404, json: async () => ({ error: 'not found' }) }
        return { ok: route.status < 400, status: route.status, json: async () => route.body }
      },
      storage: (() => {
        const store = new Map<string, string>([[TOKEN_KEY, 'tok']])
        return {
          getItem: (k: string) => store.get(k) ?? null,
          setItem: (k: string, v: string) => { store.set(k, v) },
          removeItem: (k: string) => { store.delete(k) },
        } as ClientDeps['storage']
      })(),
      reload() { /* no-op in tests */ },
    }
    const seen: IdentityState[] = []
    const off = watchIdentity(d, (state) => seen.push(state))
    await new Promise((r) => setTimeout(r, 0))
    expect(seen.at(-1)?.kind).toBe('user')
    // Login as admin: token revalidated, state flips to admin.
    me = { role: 'admin', cwd: null }
    authEvents.emit('changed')
    await new Promise((r) => setTimeout(r, 0))
    expect(seen.at(-1)?.kind).toBe('admin')
    off()
    // After dispose, no further publications arrive.
    const before = seen.length
    authEvents.emit('changed')
    await new Promise((r) => setTimeout(r, 0))
    expect(seen.length).toBe(before)
  })

  it('hasOptimisticRestriction is true exactly when a token is stored', () => {
    const routes = { 'GET /projects/api/guard-status': { status: 200, body: { guardEnabled: true } } }
    expect(hasToken(deps(routes))).toBe(true)
    expect(hasToken(deps(routes, null))).toBe(false)
  })

  function hasToken(d: ClientDeps): boolean {
    return d.storage.getItem(TOKEN_KEY) !== null
  }
})
