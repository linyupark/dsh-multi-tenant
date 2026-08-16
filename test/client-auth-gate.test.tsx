// @vitest-environment jsdom
/**
 * AuthGate component: the shell.overlay seat in controlled mode. The parent
 * (identity source) decides the phase; the gate only renders:
 *  - 'checking': a full-frame veil while the identity resolves — the stock
 *    UI underneath must never flash through;
 *  - 'form':     the login card (submits, reports errors, stores the token);
 *  - 'hidden':   nothing.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AuthGateView, type AuthGateMode } from '../src/client/auth-gate.tsx'
import { zh, type ProjectsLocaleKey } from '../src/client/locales.ts'
import { TOKEN_KEY, type ClientDeps } from '../src/client/api.ts'

const t = (key: ProjectsLocaleKey) => zh[key]!

function fakeDeps(routes: Record<string, { status: number; body?: unknown }>): ClientDeps {
  const storage = {
    store: new Map<string, string>(),
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

function gate(mode: AuthGateMode, deps: ClientDeps) {
  return render(<AuthGateView t={t} deps={deps} mode={mode} />)
}

afterEach(cleanup)

describe('AuthGate view (controlled)', () => {
  it('renders a full-frame checking veil while the identity resolves', () => {
    const { container } = gate('checking', fakeDeps({}))
    expect(container).not.toBeEmptyDOMElement()
    expect(screen.getByRole('status', { name: zh['gate.checking'] })).toBeTruthy()
  })

  it('renders nothing when hidden', () => {
    const { container } = gate('hidden', fakeDeps({}))
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the login form in form mode', () => {
    gate('form', fakeDeps({}))
    expect(screen.getByRole('heading', { name: zh['gate.title'] })).toBeTruthy()
    expect(screen.getByLabelText(zh['gate.username'])).toBeTruthy()
    expect(screen.getByLabelText(zh['gate.password'])).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['gate.submit'] })).toBeTruthy()
  })

  it('stores the token on a successful submit (the parent then flips the mode)', async () => {
    const deps = fakeDeps({
      'POST /projects/api/login': { status: 200, body: { token: 'tok-1', user: { slug: 'bob', role: 'user' } } },
    })
    gate('form', deps)
    ;(await screen.findByLabelText(zh['gate.username'])).setAttribute('value', 'bob')
    ;(await screen.findByLabelText(zh['gate.password'])).setAttribute('value', 'pw')
    const form = screen.getByRole('form')
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await screen.findByRole('button', { name: zh['gate.submit'] })
    expect(deps.storage.getItem(TOKEN_KEY)).toBe('tok-1')
  })

  it('surfaces a server rejection under the form', async () => {
    const deps = fakeDeps({
      'POST /projects/api/login': { status: 401, body: { error: '用户名或密码错误' } },
    })
    gate('form', deps)
    ;(await screen.findByLabelText(zh['gate.username'])).setAttribute('value', 'bob')
    ;(await screen.findByLabelText(zh['gate.password'])).setAttribute('value', 'bad')
    const form = screen.getByRole('form')
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    expect(await screen.findByRole('status')).toHaveTextContent('用户名或密码错误')
  })
})
