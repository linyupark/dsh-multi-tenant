import { describe, expect, it, vi } from 'vitest'
import { apply, normalizeBindHost, webCommand, WEB_STARTUP_SERVICE } from '../src/remote/startup.ts'

/**
 * Run the real `apply` over one command line and report what it provided.
 *
 * `parseCmdline` requires `ctx.cmdlineArgs` (the argv source) and `ctx.appExit`
 * (how a usage error terminates), so the fake context supplies both. Nothing
 * here re-implements the flag logic — the assertions observe the published
 * service values.
 */
function run(args: string[]): { values: Record<string, unknown> | undefined; error: string | undefined } {
  let values: Record<string, unknown> | undefined
  let error: string | undefined
  const cmdlineArgs = { get: () => [...args], rest: () => [] }
  const appExit = (code: number): void => {
    error = `exit:${String(code)}`
  }
  // `parseCmdline` reads the launcher services through `ctx.get`, and the
  // plugin publishes `webStartup` through `ctx.provide`.
  const services = new Map<string, unknown>([['cmdlineArgs', cmdlineArgs], ['appExit', appExit]])
  const ctx = {
    cmdlineArgs,
    appExit,
    provide: (id: string, value: unknown) => {
      services.set(id, value)
      if (id === WEB_STARTUP_SERVICE) values = value as Record<string, unknown>
    },
    get: (id: string) => services.get(id),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }
  try {
    apply(ctx as never)
  } catch (err) {
    // commander throws its CommanderError through exitOverride only when the
    // caller installs one; a plain throw here is still a failed parse.
    error ??= (err as Error).message
  }
  return { values, error }
}

describe('normalizeBindHost', () => {
  it('accepts both hosts the webserver schema allows', () => {
    expect(normalizeBindHost('127.0.0.1')).toBe('127.0.0.1')
    expect(normalizeBindHost('0.0.0.0')).toBe('0.0.0.0')
  })

  it('rejects anything the schema would refuse anyway, with a clear message', () => {
    expect(() => normalizeBindHost('192.168.1.5')).toThrow(/unsupported bind host/)
    expect(() => normalizeBindHost('::')).toThrow(/unsupported bind host/)
    expect(() => normalizeBindHost('')).toThrow(/unsupported bind host/)
  })
})

describe('webCommand', () => {
  it('documents the network bind in its help', () => {
    const help = webCommand().helpInformation()
    expect(help).toContain('--host <host>')
    expect(help).toContain('0.0.0.0')
  })

  it('builds a fresh program each call, so one process can parse twice', () => {
    expect(webCommand()).not.toBe(webCommand())
  })
})

describe('the published webStartup values', () => {
  it('accepts --host 0.0.0.0, which the stock startup hard-rejects', () => {
    const { values, error } = run(['--host', '0.0.0.0'])
    expect(error).toBeUndefined()
    expect(values).toMatchObject({ host: '0.0.0.0', openBrowser: true, trustedHosts: [] })
  })

  it('still accepts the loopback host', () => {
    const { values, error } = run(['--host', '127.0.0.1'])
    expect(error).toBeUndefined()
    expect(values).toMatchObject({ host: '127.0.0.1' })
  })

  it('omits the host entirely when the invocation names none', () => {
    const { values } = run([])
    expect(values).toMatchObject({ openBrowser: true, trustedHosts: [] })
    expect(values).not.toHaveProperty('host')
    expect(values).not.toHaveProperty('port')
  })

  it('carries --port and --no-open through', () => {
    const { values } = run(['--port', '8080', '--no-open'])
    expect(values).toMatchObject({ port: 8080, openBrowser: false })
  })

  it('accepts port 0 so the OS can pick a free one', () => {
    const { values } = run(['--port', '0'])
    expect(values).toMatchObject({ port: 0 })
  })

  it('refuses a non-numeric port and provides nothing', () => {
    const { values, error } = run(['--port', 'abc'])
    expect(values).toBeUndefined()
    expect(error).toBeDefined()
  })

  it('refuses an unsupported host and provides nothing', () => {
    const { values, error } = run(['--host', '192.168.1.5'])
    expect(values).toBeUndefined()
    expect(error).toContain('exit:1')
  })

  it('passes --trusted-host through', () => {
    const { values } = run(['--host', '0.0.0.0', '--trusted-host', 'dsh.example.com'])
    expect(values).toMatchObject({ host: '0.0.0.0', trustedHosts: ['dsh.example.com'] })
  })
})
