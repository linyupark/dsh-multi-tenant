import { describe, expect, it, vi } from 'vitest'
import { armAutoSync, syncSessionWorkspace, type SessionLike } from '../src/auto-sync.ts'
import type { ProjectsService, SyncReport } from '../src/service.ts'

/** A service stand-in exposing just the two sync entry points. */
function fakeService(over: {
  forCwd?: (cwd: string) => Promise<SyncReport | undefined>
  all?: () => Promise<number>
} = {}) {
  const seen: string[] = []
  const service = {
    async syncWorkspaceForCwd(cwd: string) {
      seen.push(cwd)
      return over.forCwd ? over.forCwd(cwd) : undefined
    },
    async syncAllWorkspaces() {
      return over.all ? over.all() : 0
    },
  } as unknown as ProjectsService
  return { service, seen }
}

function logger() {
  return { info: vi.fn(), warn: vi.fn() } as unknown as {
    info: ReturnType<typeof vi.fn>
    warn: ReturnType<typeof vi.fn>
  }
}

const report = (names: string[]): SyncReport => ({
  linked: names.map((name) => ({ name })),
  skippedExisting: [],
})

describe('syncSessionWorkspace', () => {
  it('syncs the workspace owning the session cwd', async () => {
    const { service, seen } = fakeService({ forCwd: async () => report([]) })
    syncSessionWorkspace(service, { header: { cwd: '/ws/app-bob' } }, logger() as never)
    await vi.waitFor(() => expect(seen).toEqual(['/ws/app-bob']))
  })

  it('does nothing without a service, or without a cwd', async () => {
    const { service, seen } = fakeService()
    syncSessionWorkspace(undefined, { header: { cwd: '/ws/app-bob' } }, logger() as never)
    syncSessionWorkspace(service, {}, logger() as never)
    syncSessionWorkspace(service, { header: {} }, logger() as never)
    expect(seen).toEqual([])
  })

  it('logs only when something was actually linked', async () => {
    const busy = logger()
    syncSessionWorkspace(
      fakeService({ forCwd: async () => report(['a', 'b']) }).service,
      { header: { cwd: '/ws/app-bob' } },
      busy as never,
    )
    await vi.waitFor(() => expect(busy.info).toHaveBeenCalled())
    expect(String(busy.info.mock.calls[0]?.[0])).toContain('补链')

    const quiet = logger()
    syncSessionWorkspace(
      fakeService({ forCwd: async () => report([]) }).service,
      { header: { cwd: '/ws/app-bob' } },
      quiet as never,
    )
    await new Promise((r) => setTimeout(r, 5))
    expect(quiet.info).not.toHaveBeenCalled()
  })

  it('never throws when the sync fails, and logs instead', async () => {
    // Session creation is a synchronous boundary: a sync failure must not veto
    // the session, so the rejection has to be swallowed and reported.
    const log = logger()
    const failing = fakeService({
      forCwd: async () => { throw new Error('readdir exploded') },
    })
    expect(() => {
      syncSessionWorkspace(failing.service, { header: { cwd: '/ws/app-bob' } }, log as never)
    }).not.toThrow()
    await vi.waitFor(() => expect(log.warn).toHaveBeenCalled())
    expect(String(log.warn.mock.calls[0]?.[1])).toContain('readdir exploded')
  })
})

describe('armAutoSync', () => {
  it('subscribes to session creation and forwards the cwd', async () => {
    const { service, seen } = fakeService({ forCwd: async () => report([]) })
    let listener: ((session: SessionLike) => void) | undefined
    armAutoSync({
      service: () => service,
      onSession: (fn) => { listener = fn },
      logger: logger() as never,
      setInterval: (() => 0) as never,
      clearInterval: (() => {}) as never,
    })
    expect(listener).toBeDefined()
    listener!({ header: { cwd: '/ws/app-bob' } })
    await vi.waitFor(() => expect(seen).toEqual(['/ws/app-bob']))
  })

  it('waits for the service, then runs one boot pass', async () => {
    const logs = logger()
    let tick: (() => void) | undefined
    const cleared = vi.fn()
    let booted = false
    const all = vi.fn(async () => 3)

    armAutoSync({
      service: () => (booted ? (fakeService({ all }).service) : undefined),
      onSession: () => {},
      logger: logs as never,
      setInterval: ((fn: () => void) => { tick = fn; return 7 }) as never,
      clearInterval: cleared as never,
    })

    // Service still booting: the tick must neither run the pass nor clear itself.
    tick!()
    expect(all).not.toHaveBeenCalled()
    expect(cleared).not.toHaveBeenCalled()

    booted = true
    tick!()
    await vi.waitFor(() => expect(logs.info).toHaveBeenCalled())
    expect(all).toHaveBeenCalledTimes(1)
    // The timer is released once the pass has run.
    expect(cleared).toHaveBeenCalledWith(7)
    expect(String(logs.info.mock.calls[0]?.[0])).toContain('启动时已同步')
  })

  it('stays quiet when the boot pass finds nothing to do', async () => {
    const logs = logger()
    let tick: (() => void) | undefined
    armAutoSync({
      service: () => fakeService({ all: async () => 0 }).service,
      onSession: () => {},
      logger: logs as never,
      setInterval: ((fn: () => void) => { tick = fn; return 1 }) as never,
      clearInterval: (() => {}) as never,
    })
    tick!()
    await new Promise((r) => setTimeout(r, 5))
    expect(logs.info).not.toHaveBeenCalled()
  })

  it('reports a boot-pass failure without throwing', async () => {
    const logs = logger()
    let tick: (() => void) | undefined
    armAutoSync({
      service: () => fakeService({ all: async () => { throw new Error('repo down') } }).service,
      onSession: () => {},
      logger: logs as never,
      setInterval: ((fn: () => void) => { tick = fn; return 1 }) as never,
      clearInterval: (() => {}) as never,
    })
    expect(() => tick!()).not.toThrow()
    await vi.waitFor(() => expect(logs.warn).toHaveBeenCalled())
    expect(String(logs.warn.mock.calls[0]?.[1])).toContain('repo down')
  })

  it('releases the timer when the fiber is disposed', () => {
    const cleared = vi.fn()
    const dispose = armAutoSync({
      service: () => undefined,
      onSession: () => {},
      logger: logger() as never,
      setInterval: (() => 42) as never,
      clearInterval: cleared as never,
    })
    dispose()
    expect(cleared).toHaveBeenCalledWith(42)
  })
})