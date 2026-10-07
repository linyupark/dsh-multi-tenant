// @vitest-environment jsdom
/**
 * The restricted-UI seats shadowed over the stock client for normal users:
 *  - RestrictedWorkspacesView — the sidebar.workspaces shadow listing ONLY
 *    the user's own cwd-bucketed sessions (per-user isolation);
 *  - RestrictedSettingsView — the sidebar.settings shadow rendering nothing
 *    (normal users must not see or reach the global settings panel);
 *  - RestrictedPickerView — the conversation.hero.workspace shadow offering
 *    only the user's own workspace (no workspace switching);
 *  - UserBadgeView — the sidebar.footer.action entry with identity + logout.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  RestrictedPickerView,
  RestrictedSettingsView,
  RestrictedWorkspacesView,
  type RestrictedWorkspacesViewProps,
  UserBadgeView,
  pickerPosition,
} from '../src/client/restricted.tsx'
import { zh } from '../src/client/locales.ts'
import { TOKEN_KEY, type ClientDeps, type WhoAmI } from '../src/client/api.ts'

const t = (key: keyof typeof zh) => zh[key]!

const USER: WhoAmI = {
  slug: 'bob',
  role: 'user',
  cwd: '/ws/demo-bob',
  projectSlug: 'demo',
  projectName: 'demo',
}

/** A useSessions-style selector hook over a fixed SessionListState. */
function sessionsHook(state: {
  ids: string[]
  byId: Record<string, { id: string; displayTitle: string; cwd?: string; running?: boolean; blank?: boolean; origin?: 'subagent' }>
  current?: string
}) {
  return <T,>(selector: (s: typeof state) => T): T => selector(state)
}

/** A useWorkspaces-style selector hook over fixed items. */
function workspacesHook(items: Array<{ workspaceId: string; path: string; title: string }>) {
  const state = { items }
  return <T,>(selector: (s: typeof state) => T): T => selector(state)
}

/**
 * The archive wiring every render needs (the view owns the archive affordance
 * because a shadow cannot reach the stock row menu); cases override per file.
 */
function archiveProps(
  over: Partial<Pick<RestrictedWorkspacesViewProps, 'archivedIds' | 'archiveSession' | 'unarchiveSession' | 'confirm'>> = {},
): Pick<RestrictedWorkspacesViewProps, 'archivedIds' | 'archiveSession' | 'unarchiveSession' | 'confirm'> {
  return {
    archivedIds: [],
    archiveSession: async () => {},
    unarchiveSession: async () => {},
    ...over,
  }
}

function deps(): ClientDeps & { reloadedCount: number } {
  const bag = { reloaded: 0 }
  const store = new Map<string, string>([[TOKEN_KEY, 'tok']])
  return {
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    storage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
    },
    reload() { bag.reloaded += 1 },
    get reloadedCount() { return bag.reloaded },
  }
}

afterEach(cleanup)

describe('RestrictedWorkspacesView', () => {
  const state = {
    ids: ['mine-1', 'other-1', 'mine-2', 'sub-1', 'mine-blank'],
    byId: {
      'mine-1': { id: 'mine-1', displayTitle: '我的会话', cwd: '/ws/demo-bob' },
      'other-1': { id: 'other-1', displayTitle: '别人的会话', cwd: '/ws/demo-alice' },
      'mine-2': { id: 'mine-2', displayTitle: '运行中的会话', cwd: '/ws/demo-bob', running: true },
      'sub-1': { id: 'sub-1', displayTitle: '子代理', cwd: '/ws/demo-bob', origin: 'subagent' as const },
      'mine-blank': { id: 'mine-blank', displayTitle: 'New Session', cwd: '/ws/demo-bob', blank: true },
    },
    current: 'mine-1',
  }

  it('lists only the sessions whose cwd is the user workspace', () => {
    render(
      <RestrictedWorkspacesView
        t={t}
        wide
        useSessions={sessionsHook(state)}
        openSession={() => {}}
        user={USER}
        {...archiveProps()}
      />,
    )
    expect(screen.getByText('我的会话')).toBeTruthy()
    expect(screen.getByText('运行中的会话')).toBeTruthy()
    expect(screen.queryByText('别人的会话')).toBeNull()
    expect(screen.queryByText('子代理')).toBeNull()
    expect(screen.queryByText('New Session')).toBeNull()
  })

  it('shows the project concept in the header', () => {
    render(
      <RestrictedWorkspacesView
        t={t}
        wide
        useSessions={sessionsHook(state)}
        openSession={() => {}}
        user={USER}
        {...archiveProps()}
      />,
    )
    expect(screen.getByText(zh['browser.project'])).toBeTruthy()
    expect(screen.getByText('demo')).toBeTruthy()
  })

  it('opens a session on row click', () => {
    const opened: string[] = []
    render(
      <RestrictedWorkspacesView
        t={t}
        wide
        useSessions={sessionsHook(state)}
        openSession={(id) => opened.push(id)}
        user={USER}
        {...archiveProps()}
      />,
    )
    ;(screen.getByText('运行中的会话') as HTMLElement).closest('button')!.click()
    expect(opened).toEqual(['mine-2'])
  })

  it('shows an empty note when the user has no sessions yet', () => {
    render(
      <RestrictedWorkspacesView
        t={t}
        wide
        useSessions={sessionsHook({ ids: [], byId: {} })}
        openSession={() => {}}
        user={USER}
        {...archiveProps()}
      />,
    )
    expect(screen.getByText(zh['browser.empty'])).toBeTruthy()
  })

  it('fills cold sessions with the durable-log titles instead of the directory name', () => {
    const cold = {
      ids: ['mine-cold'],
      byId: {
        // A cold session: the stock feed fell back to the cwd basename.
        'mine-cold': { id: 'mine-cold', displayTitle: 'demo-bob', cwd: '/ws/demo-bob' },
      },
    }
    render(
      <RestrictedWorkspacesView
        t={t}
        wide
        useSessions={sessionsHook(cold)}
        openSession={() => {}}
        user={USER}
        titles={{ 'mine-cold': '帮我写个脚本' }}
        {...archiveProps()}
      />,
    )
    expect(screen.getByText('帮我写个脚本')).toBeTruthy()
    expect(screen.queryByText('demo-bob')).toBeNull()
  })

  it('prefers the feed title over the durable-log supplement', () => {
    const warm = {
      ids: ['mine-warm'],
      byId: {
        'mine-warm': { id: 'mine-warm', displayTitle: 'demo-bob', title: '热标题', cwd: '/ws/demo-bob' },
      },
    }
    render(
      <RestrictedWorkspacesView
        t={t}
        wide
        useSessions={sessionsHook(warm)}
        openSession={() => {}}
        user={USER}
        titles={{ 'mine-warm': '旧补给标题' }}
        {...archiveProps()}
      />,
    )
    expect(screen.getByText('热标题')).toBeTruthy()
    expect(screen.queryByText('旧补给标题')).toBeNull()
  })
})

describe('RestrictedWorkspacesView archive', () => {
  const state = {
    ids: ['mine-1', 'mine-2'],
    byId: {
      'mine-1': { id: 'mine-1', displayTitle: '我的会话', cwd: '/ws/demo-bob' },
      'mine-2': { id: 'mine-2', displayTitle: '运行中的会话', cwd: '/ws/demo-bob', running: true },
    },
  }

  /** The row element owning a session title (its archive action sits inside). */
  const rowOf = (title: string): HTMLElement => (screen.getByText(title) as HTMLElement).closest('div') as HTMLElement

  const view = (
    over: Partial<Pick<RestrictedWorkspacesViewProps, 'archivedIds' | 'archiveSession' | 'unarchiveSession' | 'confirm'>> = {},
  ): void => {
    render(
      <RestrictedWorkspacesView
        t={t}
        wide
        useSessions={sessionsHook(state)}
        openSession={() => {}}
        user={USER}
        {...archiveProps(over)}
      />,
    )
  }

  it('archives a session from its row action', async () => {
    const calls: Array<[string, boolean | undefined]> = []
    view({ archiveSession: async (id, stop) => { calls.push([id, stop]) } })
    fireEvent.click(within(rowOf('我的会话')).getByRole('button', { name: zh['browser.archive'] }))
    await waitFor(() => expect(calls).toEqual([['mine-1', undefined]]))
  })

  it('stops and archives a running session once the user confirms', async () => {
    const calls: Array<[string, boolean | undefined]> = []
    view({
      archiveSession: async (id, stop) => {
        calls.push([id, stop])
        if (stop !== true) throw { rpcError: { code: 'workspace/session-active' } }
      },
      confirm: () => true,
    })
    fireEvent.click(within(rowOf('运行中的会话')).getByRole('button', { name: zh['browser.archive'] }))
    await waitFor(() => expect(calls).toEqual([['mine-2', undefined], ['mine-2', true]]))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('leaves a refused session alone when the user declines the stop', async () => {
    const calls: Array<[string, boolean | undefined]> = []
    view({
      archiveSession: async (id, stop) => {
        calls.push([id, stop])
        throw { rpcError: { code: 'workspace/session-active' } }
      },
      confirm: () => false,
    })
    fireEvent.click(within(rowOf('运行中的会话')).getByRole('button', { name: zh['browser.archive'] }))
    await waitFor(() => expect(calls).toEqual([['mine-2', undefined]]))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('surfaces any other archive failure', async () => {
    view({ archiveSession: async () => { throw new Error('host 掉线') } })
    fireEvent.click(within(rowOf('我的会话')).getByRole('button', { name: zh['browser.archive'] }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('host 掉线'))
  })

  it('hides archived sessions behind the filter and restores them', async () => {
    const restored: string[] = []
    view({ archivedIds: ['mine-2'], unarchiveSession: async (id) => { restored.push(id) } })
    expect(screen.queryByText('运行中的会话')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: `${zh['browser.showArchived']} (1)` }))
    expect(screen.queryByText('我的会话')).toBeNull()
    fireEvent.click(within(rowOf('运行中的会话')).getByRole('button', { name: zh['browser.unarchive'] }))
    await waitFor(() => expect(restored).toEqual(['mine-2']))
  })
})

describe('RestrictedSettingsView', () => {
  it('renders nothing (the settings entry disappears for normal users)', () => {
    const { container } = render(<RestrictedSettingsView />)
    expect(container.innerHTML).toBe('')
  })
})

describe('RestrictedPickerView', () => {
  const items = [
    { workspaceId: 'w-mine', path: '/ws/demo-bob', title: 'demo-bob' },
    { workspaceId: 'w-alice', path: '/ws/demo-alice', title: 'demo-alice' },
  ]

  it('offers only the user workspace while open', () => {
    render(
      <RestrictedPickerView
        t={t}
        open
        anchorRef={{ current: null }}
        selectedId={undefined}
        onPick={() => {}}
        onClose={() => {}}
        useWorkspaces={workspacesHook(items)}
        user={USER}
      />,
    )
    expect(screen.getByText('demo-bob')).toBeTruthy()
    expect(screen.queryByText('demo-alice')).toBeNull()
    expect(screen.queryByText('demo-alice')).toBeNull()
  })

  it('picks the user workspace and closes', () => {
    const picked: string[] = []
    render(
      <RestrictedPickerView
        t={t}
        open
        anchorRef={{ current: null }}
        selectedId={undefined}
        onPick={(id) => picked.push(id)}
        onClose={() => {}}
        useWorkspaces={workspacesHook(items)}
        user={USER}
      />,
    )
    ;(screen.getByText('demo-bob') as HTMLElement).closest('button')!.click()
    expect(picked).toEqual(['w-mine'])
  })

  it('renders nothing while closed', () => {
    const { container } = render(
      <RestrictedPickerView
        t={t}
        open={false}
        anchorRef={{ current: null }}
        selectedId={undefined}
        onPick={() => {}}
        onClose={() => {}}
        useWorkspaces={workspacesHook(items)}
        user={USER}
      />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('explains when the workspace has not been registered yet', () => {
    render(
      <RestrictedPickerView
        t={t}
        open
        anchorRef={{ current: null }}
        selectedId={undefined}
        onPick={() => {}}
        onClose={() => {}}
        useWorkspaces={workspacesHook([{ workspaceId: 'w-alice', path: '/ws/demo-alice', title: 'demo-alice' }])}
        user={USER}
      />,
    )
    expect(screen.getByText(zh['picker.missing'])).toBeTruthy()
  })

  it('anchors the menu under the trigger chip, not the screen center', () => {
    const anchor = document.createElement('button')
    anchor.getBoundingClientRect = () => ({
      x: 40, y: 100, top: 100, bottom: 132, left: 40, right: 240,
      width: 200, height: 32, toJSON: () => ({}),
    } as DOMRect)
    render(
      <RestrictedPickerView
        t={t}
        open
        anchorRef={{ current: anchor }}
        selectedId={undefined}
        onPick={() => {}}
        onClose={() => {}}
        useWorkspaces={workspacesHook(items)}
        user={USER}
      />,
    )
    const menu = screen.getByRole('menu')
    expect(menu.style.top).toBe('138px')
    expect(menu.style.left).toBe('40px')
    expect(menu.style.minWidth).toBe('200px')
  })
})

describe('pickerPosition', () => {
  const rect = (over: Partial<DOMRect>): DOMRect =>
    ({ x: 0, y: 0, top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, toJSON: () => ({}), ...over }) as DOMRect

  it('drops the menu right below the anchor', () => {
    const p = pickerPosition(rect({ bottom: 132, left: 40, width: 200 }), { height: 800 })
    expect(p.top).toBe(138)
    expect(p.left).toBe(40)
    expect(p.minWidth).toBe(200)
  })

  it('flips above the anchor when the drop would overflow the viewport', () => {
    const p = pickerPosition(rect({ top: 780, bottom: 812, left: 40, width: 200 }), { height: 820 })
    expect(p.top).toBeLessThan(780)
    expect(p.top).toBeGreaterThan(0)
  })

  it('clamps the left edge into the viewport', () => {
    const p = pickerPosition(rect({ bottom: 132, left: -30, width: 200 }), { height: 800 })
    expect(p.left).toBeGreaterThanOrEqual(8)
  })
})

describe('UserBadgeView', () => {
  it('shows the identity and signs out (clears token + reloads)', () => {
    const d = deps()
    render(<UserBadgeView t={t} wide user={USER} deps={d} />)
    expect(screen.getByText('bob')).toBeTruthy()
    ;(screen.getByRole('button', { name: zh['badge.logout'] }) as HTMLButtonElement).click()
    expect(d.storage.getItem(TOKEN_KEY)).toBeNull()
    expect(d.reloadedCount).toBe(1)
  })

  it('also serves the admin identity (no cwd/project decoration)', () => {
    const d = deps()
    const admin: WhoAmI = { slug: 'admin', role: 'admin', cwd: null, projectSlug: null, projectName: null }
    render(<UserBadgeView t={t} wide user={admin} deps={d} />)
    expect(screen.getByText('admin')).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['badge.logout'] })).toBeTruthy()
  })
})
