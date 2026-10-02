// @vitest-environment jsdom
/**
 * AdminSection component: the settings.section page carrying the whole
 * project/user console. Admins manage projects, users and workspace links
 * here; non-admins only see their identity and a denial note.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
      projects: [
        { slug: 'demo', name: 'demo', workspacePath: '/ws/demo' },
        { slug: 'retired', name: 'retired', workspacePath: '/ws/retired' },
      ],
      users: [
        { slug: 'bob', name: 'bob', projectSlug: 'demo', role: 'user', status: 'active', workspacePath: '/w/demo-bob' },
        { slug: 'carol', name: 'carol', projectSlug: 'retired', role: 'user', status: 'disabled', workspacePath: '/w/retired-carol' },
      ],
    },
  },
}

/** The project <li> for a slug, found by its (unique) workspace path. */
const projectRow = (slug: string): HTMLElement =>
  screen.getByText(`/ws/${slug}`).closest('li') as HTMLElement

/** The user <li> for a name, found by the name node. */
const userRow = (name: string): HTMLElement =>
  screen.getByText(name).closest('li') as HTMLElement

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
    expect(within(userRow('bob')).getByRole('button', { name: zh['admin.disable'] })).toBeTruthy()
    expect(within(userRow('bob')).getByRole('button', { name: zh['admin.sync'] })).toBeTruthy()
    // The token handoff is gone: accounts log in with their password.
    expect(screen.queryByRole('button', { name: '补发令牌' })).toBeNull()
  })

  it('offers physical deletion only for a disabled user', async () => {
    render(<AdminSectionView t={t} close={() => {}} deps={fakeDeps(ADMIN_OVERVIEW)} />)
    await screen.findAllByText('demo')
    const active = within(userRow('bob')).getByRole('button', { name: zh['admin.delete'] }) as HTMLButtonElement
    const disabled = within(userRow('carol')).getByRole('button', { name: zh['admin.delete'] }) as HTMLButtonElement
    expect(active.disabled).toBe(true)
    expect(disabled.disabled).toBe(false)
  })

  it('offers project deletion only once every user under it is disabled', async () => {
    render(<AdminSectionView t={t} close={() => {}} deps={fakeDeps(ADMIN_OVERVIEW)} />)
    await screen.findAllByText('demo')
    const busy = within(projectRow('demo')).getByRole('button', { name: zh['admin.deleteProject'] }) as HTMLButtonElement
    const retired = within(projectRow('retired')).getByRole('button', { name: zh['admin.deleteProject'] }) as HTMLButtonElement
    expect(busy.disabled).toBe(true)
    expect(retired.disabled).toBe(false)
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

  it('deletes a disabled user after confirmation, naming them in the prompt', async () => {
    const routes: Record<string, { status: number; body?: unknown }> = {
      ...ADMIN_OVERVIEW,
      'POST /projects/api/admin/delete-user': { status: 200, body: { slug: 'retired/carol' } },
    }
    const prompts: string[] = []
    render(
      <AdminSectionView
        t={t}
        close={() => {}}
        deps={fakeDeps(routes)}
        confirm={(message) => { prompts.push(message); return true }}
      />,
    )
    await screen.findAllByText('demo')
    ;(within(userRow('carol')).getByRole('button', { name: zh['admin.delete'] }) as HTMLButtonElement).click()

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(zh['admin.deleteUserDone']))
    expect(prompts[0]).toContain('carol')
  })

  it('sends nothing when the deletion is not confirmed', async () => {
    const calls: string[] = []
    const deps = fakeDeps(ADMIN_OVERVIEW)
    const origFetch = deps.fetch
    deps.fetch = async (input: string, init?: { method?: string }) => {
      calls.push(`${init?.method ?? 'GET'} ${input}`)
      return origFetch(input, init)
    }
    render(<AdminSectionView t={t} close={() => {}} deps={deps} confirm={() => false} />)
    await screen.findAllByText('demo')
    ;(within(userRow('carol')).getByRole('button', { name: zh['admin.delete'] }) as HTMLButtonElement).click()

    expect(calls.some((c) => c.includes('delete-user'))).toBe(false)
  })

  it('deletes a project and reports a kept bound directory', async () => {
    const routes: Record<string, { status: number; body?: unknown }> = {
      ...ADMIN_OVERVIEW,
      'POST /projects/api/admin/delete-project': {
        status: 200,
        body: { slug: 'retired', directoryRemoved: false, keptDirectory: '/repos/real' },
      },
    }
    render(<AdminSectionView t={t} close={() => {}} deps={fakeDeps(routes)} confirm={() => true} />)
    await screen.findAllByText('demo')
    ;(within(projectRow('retired')).getByRole('button', { name: zh['admin.deleteProject'] }) as HTMLButtonElement).click()

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(zh['admin.deleteProjectDone']))
    // The operator has to be told that the bound directory survived.
    expect(screen.getByRole('status')).toHaveTextContent(zh['admin.boundDirKept'])
    expect(screen.getByRole('status')).toHaveTextContent('/repos/real')
  })

  it('surfaces API failures in the message area', async () => {
    const routes: Record<string, { status: number; body?: unknown }> = {
      ...ADMIN_OVERVIEW,
      'POST /projects/api/admin/disable': { status: 404, body: { error: '用户 nope 不存在' } },
    }
    render(<AdminSectionView t={t} close={() => { }} deps={fakeDeps(routes)} />)
    await screen.findAllByText('demo')
    ;(within(userRow('bob')).getByRole('button', { name: zh['admin.disable'] }) as HTMLButtonElement).click()
    expect(await screen.findByRole('alert')).toHaveTextContent('用户 nope 不存在')
  })

  it('asks visitors without a token to log in first', async () => {
    const routes = { 'GET /projects/api/whoami': { status: 401, body: { error: 'missing token' } } }
    render(<AdminSectionView t={t} close={() => {}} deps={fakeDeps(routes, undefined)} />)
    expect(await screen.findByRole('status')).toHaveTextContent(zh['admin.notSignedIn'])
  })
})
