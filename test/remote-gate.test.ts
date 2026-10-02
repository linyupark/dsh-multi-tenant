import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { apply as armGate, isIndexRequest, isPageNavigation, tokenPage } from '../src/remote/gate.ts'

type RouteHandler = (req: unknown, res: unknown) => Promise<void>
type Facts = { headers: Record<string, string | string[] | undefined>; method?: string; url?: string }

/** A fake webserver whose fallback seat the gate wraps. */
function fakeServer(mode: 'existing' | 'later' = 'existing') {
  const registered: RouteHandler[] = []
  const server: Record<string, unknown> = {
    registerFallback: (handler: RouteHandler) => {
      registered.push(handler)
      return () => {}
    },
    port: 3080,
  }
  if (mode === 'existing') server.fallback = (): void => {}
  return { server, registered }
}

/**
 * The host's own cookie-name derivation, reproduced independently.
 *
 * Deliberately NOT `digest('base64url')`: it spells out the host's two steps
 * (base64, then `+`→`-`, `/`→`_`, strip padding) so a divergence in either
 * implementation is caught. See `dsh-client-connection`'s `encodeBase64Url` and
 * `cookieName`. Reusing the gate's own formula would make the check a tautology
 * over the one property that decides whether the SPA loads at all.
 */
function hostCookieName(authority: string): string {
  const digest = createHash('sha256').update(authority).digest()
  return 'dsh-auth-' + digest.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function fakeCtx(
  webServer: unknown,
  over: { rejection?: 401 | 403 | undefined; trustedHosts?: readonly string[] } = {},
) {
  return {
    webServer,
    connection: {
      authenticatedUrl: (base: string) => `${base}/?token=LAUNCH`,
      requestRejection: () => over.rejection,
      trustedHosts: over.trustedHosts,
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    provide: vi.fn(),
    on: vi.fn(),
    effect: (fn: () => (() => void) | void) => fn(),
  } as never
}

function req(over: Partial<Facts> = {}): Facts {
  return {
    headers: over.headers ?? { host: '192.168.2.2:3080', accept: 'text/html' },
    method: over.method ?? 'GET',
    url: over.url ?? '/',
  }
}

function recorder() {
  const rec = { status: 0, headers: {} as Record<string, string | string[]>, body: undefined as string | undefined }
  return {
    rec,
    res: {
      writeHead(status: number, headers: Record<string, string | string[]>) {
        rec.status = status
        rec.headers = headers
      },
      end(body?: string) {
        rec.body = body
      },
    } as unknown as Record<string, unknown>,
  }
}

/** Arm the gate and return the wrapped fallback handler. */
function arm(
  mode: 'existing' | 'later' = 'existing',
  over: { rejection?: 401 | 403 | undefined; trustedHosts?: readonly string[] } = {},
) {
  const { server, registered } = fakeServer(mode)
  armGate(fakeCtx(server, over))
  if (mode === 'later') {
    const noop: RouteHandler = () => Promise.resolve()
    ;(server.registerFallback as (h: RouteHandler) => () => void)(noop)
  }
  return { handler: (mode === 'existing' ? server.fallback : registered[registered.length - 1]) as RouteHandler }
}

describe('isPageNavigation', () => {
  it('trusts fetch metadata when present', () => {
    expect(isPageNavigation({ headers: { 'sec-fetch-mode': 'navigate' } })).toBe(true)
    expect(isPageNavigation({ headers: { 'sec-fetch-mode': 'nested-navigate' } })).toBe(true)
    expect(isPageNavigation({ headers: { 'sec-fetch-mode': 'cors' } })).toBe(false)
  })

  it('falls back to Accept, and reads the first value of a repeated header', () => {
    expect(isPageNavigation({ headers: { accept: 'text/html' } })).toBe(true)
    expect(isPageNavigation({ headers: { accept: ['text/html', 'application/json'] } })).toBe(true)
    expect(isPageNavigation({ headers: { accept: 'application/json' } })).toBe(false)
    expect(isPageNavigation({ headers: {} })).toBe(false)
  })
})

describe('isIndexRequest', () => {
  it('gates only the SPA shell', () => {
    expect(isIndexRequest({ headers: {}, url: '/' })).toBe(true)
    expect(isIndexRequest({ headers: {}, url: '/index.html?x=1' })).toBe(true)
    expect(isIndexRequest({ headers: {}, url: '/assets/app.js' })).toBe(false)
  })
})

describe('tokenPage', () => {
  it('renders the host token URL as a clickable link', () => {
    const html = tokenPage('http://192.168.2.2:3080/?token=SECRET', '192.168.2.2:3080')
    expect(html).toContain('href="http://192.168.2.2:3080/?token=SECRET"')
    expect(html).toContain('http://192.168.2.2:3080/?token=SECRET')
  })

  it('escapes the URL so it cannot inject markup', () => {
    const html = tokenPage('http://x/?a=1&b="><script>alert(1)</script>', 'x')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&quot;&gt;')
    expect(html).toContain('&amp;')
  })

  it('warns when the link authority differs from the one requested', () => {
    const html = tokenPage('http://127.0.0.1:3080/?token=T', '192.168.2.2:3080')
    expect(html).toContain('127.0.0.1:3080')
    expect(html).toContain('192.168.2.2:3080')
  })

  it('omits the warning when the authorities agree', () => {
    const html = tokenPage('http://192.168.2.2:3080/?token=T', '192.168.2.2:3080')
    expect(html).not.toContain('注意')
  })

  it('escapes the mismatch-warning authority too', () => {
    // WHATWG host parsing keeps `"` and `&` verbatim, so a hostile Host reached
    // the warning text through an unescaped interpolation.
    const html = tokenPage('http://x"y/?token=T', 'x%22y')
    expect(html).not.toMatch(/<b>x"y<\/b>/)
    expect(html).toContain('&quot;')
  })

  it('escapes ampersands in every interpolation', () => {
    const html = tokenPage('http://a&b/?token=T&x=1', 'a&b')
    expect(html).not.toContain('token=T&x=1')
    expect(html).toContain('&amp;')
  })

  it('carries literal colour fallbacks, since no stylesheet has loaded', () => {
    const html = tokenPage('http://x/?token=T', 'x')
    expect(html).toContain('prefers-color-scheme')
    expect(html).toContain('--accent')
  })
})

describe('the index seat', () => {
  it('shows the token link to a browser that arrives without one', async () => {
    const { handler } = arm()
    const { rec, res } = recorder()
    await handler(req(), res)
    expect(rec.status).toBe(401)
    expect(rec.headers['content-type']).toContain('text/html')
    expect(rec.body).toContain('?token=LAUNCH')
  })

  it('builds the link from the authority the caller actually used', async () => {
    const { handler } = arm()
    const { rec, res } = recorder()
    await handler(req({ headers: { host: '10.1.2.3:9999', accept: 'text/html' } }), res)
    expect(rec.body).toContain('http://10.1.2.3:9999/?token=LAUNCH')
  })

  it('delegates a request that already carries the token', async () => {
    // Regression: intercepting this would shadow the host's own exchange.
    const { handler } = arm()
    const { rec, res } = recorder()
    await handler(req({ url: '/?token=already' }), res)
    expect(rec.status).toBe(0)
  })

  it('never intercepts a non-navigation request', async () => {
    const { handler } = arm()
    const { rec, res } = recorder()
    await handler(req({ headers: { host: 'x:3080', accept: 'application/json' } }), res)
    expect(rec.status).toBe(0)
  })

  it('never intercepts static assets', async () => {
    const { handler } = arm()
    const { rec, res } = recorder()
    await handler(req({ url: '/assets/app.js' }), res)
    expect(rec.status).toBe(0)
  })

  it('sends headers only on HEAD', async () => {
    const { handler } = arm()
    const { rec, res } = recorder()
    await handler(req({ method: 'HEAD' }), res)
    expect(rec.status).toBe(401)
    expect(rec.body).toBeUndefined()
  })

  it('never sets a cookie — it issues nothing', async () => {
    const { handler } = arm()
    const { rec, res } = recorder()
    await handler(req(), res)
    expect(rec.headers['set-cookie']).toBeUndefined()
  })

  it('marks the response no-store so the token is not cached', async () => {
    const { handler } = arm()
    const { rec, res } = recorder()
    await handler(req(), res)
    expect(rec.headers['cache-control']).toBe('no-store')
    expect(rec.headers['referrer-policy']).toBe('no-referrer')
  })

  it('delegates the navigation that follows the token exchange', async () => {
    // Regression: the host mints its cookie on the `?token=` hop, then the
    // browser navigates to the clean URL. Intercepting that second request
    // showed the token page again, so the link could never actually get in.
    const { handler } = arm()
    const authority = '192.168.2.2:3080'
    const { rec, res } = recorder()
    await handler(
      req({ headers: { host: authority, accept: 'text/html', cookie: `${hostCookieName(authority)}=v1.a.b` } }),
      res,
    )
    expect(rec.status).toBe(0)
  })

  it('does not mistake another authority cookie for its own', async () => {
    const { handler } = arm()
    const foreign = hostCookieName('elsewhere:9999')
    const { rec, res } = recorder()
    await handler(
      req({ headers: { host: '192.168.2.2:3080', accept: 'text/html', cookie: `${foreign}=v1.a.b` } }),
      res,
    )
    expect(rec.status).toBe(401)
  })

  it('recognizes the host cookie across authority spellings', async () => {
    // The name is derived from the canonical authority, so a default port, a
    // differently-cased host, and an IPv6 literal must all resolve.
    const cases: Array<[string, string]> = [
      ['example.com:80', 'example.com'],
      ['Example.COM:3080', 'example.com:3080'],
      ['[::1]:3080', '[::1]:3080'],
      ['192.168.2.2:3080', '192.168.2.2:3080'],
    ]
    for (const [requested, canonical] of cases) {
      const { handler } = arm()
      const { rec, res } = recorder()
      await handler(
        req({ headers: { host: requested, accept: 'text/html', cookie: `${hostCookieName(canonical)}=v1.a.b` } }),
        res,
      )
      expect(rec.status, `Host: ${requested}`).toBe(0)
    }
  })

  it('treats an array-valued Host as no host at all', async () => {
    const { handler } = arm()
    const { rec, res } = recorder()
    await handler(req({ headers: { host: ['a:1', 'b:2'], accept: 'text/html' } }), res)
    expect(rec.status).toBe(0)
  })

  it('shows the untrusted-authority page when the fence refuses the host', async () => {
    // A hostname the deployment never declared: the token link would load a
    // shell whose every /api call is 403, so the gate must say so instead.
    const { handler } = arm('existing', {
      rejection: 403,
      trustedHosts: ['192.168.2.2', '10.0.0.5:3080'],
    })
    const { rec, res } = recorder()
    await handler(req({ headers: { host: 'box.local:3080', accept: 'text/html' } }), res)
    expect(rec.status).toBe(401)
    expect(rec.body).toContain('该地址不可用')
    expect(rec.body).toContain('box.local:3080')
    expect(rec.body).toContain('--trusted-host')
    // And it offers the authorities that actually work, with the bound port.
    expect(rec.body).toContain('http://192.168.2.2:3080/?token=LAUNCH')
    expect(rec.body).toContain('http://10.0.0.5:3080/?token=LAUNCH')
  })

  it('still shows the token link when the fence only wants a cookie', async () => {
    const { handler } = arm('existing', { rejection: 401, trustedHosts: ['192.168.2.2'] })
    const { rec, res } = recorder()
    await handler(req({ headers: { host: '192.168.2.2:3080', accept: 'text/html' } }), res)
    expect(rec.status).toBe(401)
    expect(rec.body).toContain('需要访问令牌')
    expect(rec.body).not.toContain('该地址不可用')
  })

  it('falls back to the token page when the fence cannot be consulted', async () => {
    const server: Record<string, unknown> = {
      registerFallback: (): void => {},
      fallback: (): void => {},
      port: 3080,
    }
    const ctx = {
      webServer: server,
      connection: {
        authenticatedUrl: (base: string) => `${base}/?token=LAUNCH`,
        requestRejection: () => {
          throw new Error('fence unavailable')
        },
      },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      provide: vi.fn(),
      on: vi.fn(),
      effect: (fn: () => (() => void) | void) => fn(),
    } as never
    armGate(ctx)
    const { rec, res } = recorder()
    await (server.fallback as RouteHandler)(req(), res)
    expect(rec.status).toBe(401)
    expect(rec.body).toContain('?token=LAUNCH')
  })

  it('omits alternative links when the fence exposes none', async () => {
    const { handler } = arm('existing', { rejection: 403 })
    const { rec, res } = recorder()
    await handler(req({ headers: { host: 'box.local:3080', accept: 'text/html' } }), res)
    expect(rec.status).toBe(401)
    expect(rec.body).toContain('该地址不可用')
    expect(rec.body).not.toContain('href=')
  })

  it('falls back to the host when there is no usable Host', async () => {
    // The token page is a courtesy: it must never become a new failure mode.
    const { handler } = arm()
    const { rec, res } = recorder()
    await handler(req({ headers: { accept: 'text/html' } }), res)
    expect(rec.status).toBe(0)
  })

  it('falls back to the host when the Host cannot form a URL', async () => {
    const { handler } = arm()
    const { rec, res } = recorder()
    // A bare space is rejected by WHATWG parsing, so the gate cannot build a
    // token URL for it and must not invent one.
    await handler(req({ headers: { host: 'not a host', accept: 'text/html' } }), res)
    expect(rec.status).toBe(0)
  })

  it('still serves the token page for a host that merely looks unusual', async () => {
    const { handler } = arm()
    const { rec, res } = recorder()
    await handler(req({ headers: { host: 'x"y', accept: 'text/html' } }), res)
    expect(rec.status).toBe(401)
    expect(rec.body).toContain('?token=LAUNCH')
    expect(rec.body).not.toContain('<script>')
  })

  it('wraps a fallback that registers after the gate armed', async () => {
    const { handler } = arm('later')
    const { rec, res } = recorder()
    await handler(req(), res)
    expect(rec.status).toBe(401)
  })

  it('restores the patched method when the fiber is disposed', () => {
    const original = (): void => {}
    const server: Record<string, unknown> = {
      registerFallback: original,
      fallback: (): void => {},
      port: 3080,
    }
    let disposer: (() => void) | undefined
    const ctx = {
      webServer: server,
      connection: { authenticatedUrl: (b: string) => b },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      provide: vi.fn(),
      on: vi.fn(),
      effect: (fn: () => (() => void) | void) => {
        disposer = fn() ?? undefined
      },
    } as never
    armGate(ctx)
    expect(server.registerFallback).not.toBe(original)
    disposer?.()
    expect(server.registerFallback).toBe(original)
  })

  it('does not stack a second wrapper across a plugin reload', () => {
    // A reload builds a fresh `apply` closure, so a per-apply guard would wrap
    // the wrapper the previous instance left behind and grow the chain on every
    // reload. The mark has to be process-wide.
    const server: Record<string, unknown> = {
      registerFallback: (): void => {},
      fallback: (): void => {},
    }
    armGate(fakeCtx(server))
    const afterFirst = server.fallback as RouteHandler
    armGate(fakeCtx(server))
    expect(server.fallback).toBe(afterFirst)
  })

  it('still serves the token page after a reload', async () => {
    const server: Record<string, unknown> = {
      registerFallback: (): void => {},
      fallback: (): void => {},
      port: 3080,
    }
    armGate(fakeCtx(server))
    armGate(fakeCtx(server))
    const { rec, res } = recorder()
    await (server.fallback as RouteHandler)(req(), res)
    expect(rec.status).toBe(401)
    expect(rec.body).toContain('?token=LAUNCH')
  })
})
