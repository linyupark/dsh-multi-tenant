// @vitest-environment jsdom
/**
 * AdminSection component: the settings.section page carrying the whole
 * project/user console. Admins manage projects, users, tokens and workspace
 * sync; non-admins only see their identity and a denial note.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AdminSectionView } from '../src/client/admin-section.tsx'
import { zh } from '../src/client/locales.ts'
import { TOKEN_KEY, type ClientDeps } from '../src/client/api.ts'

const t = (key: keyof typeof zh) => zh[key]!

function fakeDeps(routes: Record<string, { status: number; body?: unknown }>, token = 'tok'): ClientDeps {
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

const ADMIN_OVERVIEW = {
  'GET /projects/api/whoami': {
    status: 200,
    body: { user: { slug: 'admin', role: 'admin', cwd: null } },
  },
  'GET /projects/api/admin/overview': {
    status: 200,
    body: {
      projects: [{ slug: 'demo', name: 'demo', workspacePath: '/ws/demo' }],
      users: [
        { slug: 'bob', name: 'bob', projectSlug: 'demo', role: 'user', status: 'active', workspacePath: '/w/demo-bob' },
      ],
    },
  },
}

afterEach(cleanup)

describe('AdminSection view', () => {
  it('shows the signed-in identity', async () => {
    render(<AdminSectionView t={t} close={() => {}} deps={fakeDeps(ADMIN_OVERVIEW)} />)
    expect(await screen.findByText('admin')).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['admin.logout'] })).toBeTruthy()
  })

  it('denies the console to non-admin users', async () => {
    const routes = {
      'GET /projects/api/whoami': { status: 200, body: { user: { slug: 'bob', role: 'user', cwd: '/w' } } },
    }
    render(<AdminSectionView t={t} close={() => {}} deps={fakeDeps(routes)} />)
    expect(await screen.findByRole('status')).toHaveTextContent(zh['admin.denied'])
    expect(screen.queryByRole('button', { name: zh['admin.createProject'] })).toBeNull()
  })

  it('renders the project and user console for admins', async () => {
    render(<AdminSectionView t={t} close={() => {}} deps={fakeDeps(ADMIN_OVERVIEW)} />)
    expect((await screen.findAllByText('demo')).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: zh['admin.createProject'] })).toBeTruthy()
    expect(screen.getByText('bob')).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['admin.issueToken'] })).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['admin.disable'] })).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['admin.sync'] })).toBeTruthy()
  })

  it('shows each project workspace path and a bind-path field on the create form', async () => {
    render(<AdminSectionView t={t} close={() => {}} deps={fakeDeps(ADMIN_OVERVIEW)} />)
    expect(await screen.findByText('/ws/demo')).toBeTruthy()
    expect(screen.getByLabelText(zh['admin.projectPath'])).toBeTruthy()
  })

  it('sends the bound workspace path when one is entered', async () => {
    const bodies: unknown[] = []
    const routes: Record<string, { status: number; body?: unknown }> = {
      ...ADMIN_OVERVIEW,
      'POST /projects/api/admin/projects': { status: 201, body: { project: { slug: 'alpha', name: 'alpha' } } },
    }
    const deps = fakeDeps(routes)
    const origFetch = deps.fetch
    deps.fetch = async (input: string, init?: { method?: string; body?: string }) => {
      if (init?.method === 'POST' && input.endsWith('/admin/projects')) bodies.push(JSON.parse(init.body ?? '{}'))
      return origFetch(input, init)
    }
    render(<AdminSectionView t={t} close={() => {}} deps={deps} />)
    await screen.findAllByText('demo')
    fireEvent.change(screen.getByLabelText(zh['admin.projectName']), { target: { value: 'alpha' } })
    fireEvent.change(screen.getByLabelText(zh['admin.projectPath']), { target: { value: '/bound/dir' } })
    fireEvent.click(screen.getByRole('button', { name: zh['admin.createProject'] }))
    await waitFor(() => expect(bodies.length).toBeGreaterThan(0))
    expect(bodies[0]).toMatchObject({ name: 'alpha', workspacePath: '/bound/dir' })
  })

  it('fills the path via the directory picker (same host primitive as the stock picker)', async () => {
    const deps = fakeDeps(ADMIN_OVERVIEW)
    render(
      <AdminSectionView t={t} close={() => {}} deps={deps} picker={{ pick: async () => '/picked/ws' }} />,
    )
    await screen.findAllByText('demo')
    fireEvent.click(screen.getByRole('button', { name: zh['admin.browse'] }))
    await waitFor(() =>
      expect((screen.getByLabelText(zh['admin.projectPath']) as HTMLInputElement).value).toBe('/picked/ws'),
    )
  })

  it('keeps the path and surfaces an error when the picker fails', async () => {
    const deps = fakeDeps(ADMIN_OVERVIEW)
    render(
      <AdminSectionView t={t} close={() => {}} deps={deps} picker={{ pick: async () => { throw new Error('no native backend') } }} />,
    )
    await screen.findAllByText('demo')
    fireEvent.change(screen.getByLabelText(zh['admin.projectPath']), { target: { value: '/typed/path' } })
    fireEvent.click(screen.getByRole('button', { name: zh['admin.browse'] }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect((screen.getByLabelText(zh['admin.projectPath']) as HTMLInputElement).value).toBe('/typed/path')
  })

  it('hides the browse affordance when no picker is available', async () => {
    render(<AdminSectionView t={t} close={() => {}} deps={fakeDeps(ADMIN_OVERVIEW)} />)
    await screen.findAllByText('demo')
    expect(screen.queryByRole('button', { name: zh['admin.browse'] })).toBeNull()
  })

  it('creates a project through the API and refreshes the overview', async () => {
    const calls: string[] = []
    const routes: Record<string, { status: number; body?: unknown }> = {
      ...ADMIN_OVERVIEW,
      'POST /projects/api/admin/projects': { status: 201, body: { project: { slug: 'alpha', name: 'alpha' } } },
    }
    const deps = fakeDeps(routes)
    const origFetch = deps.fetch
    deps.fetch = async (input: string, init?: { method?: string }) => {
      calls.push(`${init?.method ?? 'GET'} ${input}`)
      return origFetch(input, init)
    }
    render(<AdminSectionView t={t} close={() => {}} deps={deps} />)
    await screen.findAllByText('demo')
    ;(screen.getByLabelText(zh['admin.projectName']) as HTMLInputElement).setAttribute('value', 'alpha')
    ;(screen.getByRole('button', { name: zh['admin.createProject'] }) as HTMLButtonElement).click()
    await waitFor(() => expect(calls).toContain('POST /projects/api/admin/projects'))
    await waitFor(() => expect(calls.filter((c) => c === 'GET /projects/api/admin/overview').length).toBe(2))
  })

  it('shows the one-time token after issuing one', async () => {
    const routes: Record<string, { status: number; body?: unknown }> = {
      ...ADMIN_OVERVIEW,
      'POST /projects/api/admin/tokens': { status: 200, body: { token: 'fresh-tok' } },
    }
    render(<AdminSectionView t={t} close={() => {}} deps={fakeDeps(routes)} />)
    await screen.findAllByText('demo')
    ;(screen.getByRole('button', { name: zh['admin.issueToken'] }) as HTMLButtonElement).click()
    expect(await screen.findByText('fresh-tok')).toBeTruthy()
  })

  it('surfaces API failures in the message area', async () => {
    const routes: Record<string, { status: number; body?: unknown }> = {
      ...ADMIN_OVERVIEW,
      'POST /projects/api/admin/disable': { status: 404, body: { error: '用户 nope 不存在' } },
    }
    render(<AdminSectionView t={t} close={() => { }} deps={fakeDeps(routes)} />)
    await screen.findAllByText('demo')
    ;(screen.getByRole('button', { name: zh['admin.disable'] }) as HTMLButtonElement).click()
    expect(await screen.findByRole('alert')).toHaveTextContent('用户 nope 不存在')
  })

  it('asks visitors without a token to log in first', async () => {
    const routes = { 'GET /projects/api/whoami': { status: 401, body: { error: 'missing token' } } }
    render(<AdminSectionView t={t} close={() => {}} deps={fakeDeps(routes, undefined)} />)
    expect(await screen.findByRole('status')).toHaveTextContent(zh['admin.notSignedIn'])
  })
})
