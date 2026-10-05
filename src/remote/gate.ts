/**
 * The remote-access gate.
 *
 * DSH refuses `--host 0.0.0.0` because every interface means remote code
 * execution on the network, and the host's launch-token URL is the only thing
 * standing in front of it. This gate accepts that bind and answers a caller who
 * arrives without the token with a page that shows the token URL instead of
 * leaving them at a bare `401`.
 *
 * The gate never mints a credential of its own and never reads the host's
 * signing secret. It renders the URL the host itself published
 * (`connection.authenticatedUrl`), so the host remains the only issuer and the
 * only thing that has to be understood on upgrade.
 *
 * Two requests have to pass the host's own fences for this to work at all: the
 * `/api` Host fence (which needs the LAN address in `trustedHosts`, wired in
 * `cordis.patch.yml`) and the browser cookie the token exchange mints. This
 * module only shapes what an unauthenticated caller sees — it cannot widen
 * either fence, and it is deliberately not on the accept path.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { createHash } from 'node:crypto'

/** Stable Cordis plugin name (matches the nested plugin in src/index.ts). */
export const name = 'projects-remote-gate'

/** Services the gate needs. */
export const inject = ['webServer', 'connection']

/**
 * The request facts these helpers read.
 *
 * Narrower than node's `IncomingMessage` on purpose: the classifiers are pure,
 * so a caller (and a test) can hand them just the three fields actually
 * consulted instead of a full request.
 */
export interface RequestFacts {
  headers: Record<string, string | string[] | undefined>
  method?: string
  url?: string
}

/** Marks a handler this gate has already wrapped, across plugin reloads. */
const GATE_WRAPPED = Symbol.for('dsh-multi-tenant.remote-gate.wrapped')

type RouteHandler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>

/** The narrower face of the host's connection service the gate reads. */
interface ConnectionLike {
  /** The host's own tokenized URL for a clean browser URL. */
  authenticatedUrl(baseUrl: string): string
  /**
   * The host's own Host/Origin fence for a request. `403` means this authority
   * is not one the deployment serves, and no token will change that; `401`
   * means the authority is fine and only the session cookie is missing.
   */
  requestRejection(request: { headers: RequestFacts['headers'] }): 401 | 403 | undefined
  /** Authorities the fence admits beyond loopback (port-less or `host:port`). */
  trustedHosts?: readonly string[]
}

interface WebServerLike {
  registerFallback(handler: RouteHandler): () => void
  fallback?: RouteHandler
  /** The bound port, for building links to derived authorities. */
  port?: number
}

/**
 * Whether a request is a page navigation rather than a fetch: navigations get
 * the token page, everything else the host's own bare 401 (a JSON client has
 * no use for an HTML document).
 * @param req - the incoming request.
 * @returns true for a top-level or nested navigation.
 */
export function isPageNavigation(req: RequestFacts): boolean {
  const mode = req.headers['sec-fetch-mode']
  const asString = Array.isArray(mode) ? mode[0] : mode
  if (typeof asString === 'string') return asString === 'navigate' || asString === 'nested-navigate'
  const accept = req.headers.accept
  const acceptString = Array.isArray(accept) ? accept[0] : accept
  return typeof acceptString === 'string' && acceptString.includes('text/html')
}

/**
 * Whether the request is the SPA shell — the one page worth intercepting.
 * @param req - the incoming request.
 * @returns true for `/` and `/index.html`.
 */
export function isIndexRequest(req: RequestFacts): boolean {
  let pathname: string
  try {
    pathname = new URL(req.url ?? '/', 'http://dsh.invalid').pathname
  } catch {
    return false
  }
  return pathname === '/' || pathname === '/index.html'
}

/**
 * The scheme the caller actually reached this server by.
 *
 * DSH's own listener is plain HTTP, so a request that arrives over TLS is one a
 * reverse proxy terminated; `X-Forwarded-Proto` is where such a proxy states the
 * scheme it served, and without it a deployment behind a TLS edge would hand out
 * `http://` links to a port that may not answer at all. The default is HTTP,
 * because that is what the listener underneath really speaks.
 *
 * The value is whitelisted rather than merely parsed: it is spliced into an
 * `href`, so passing an arbitrary protocol through would not be a wrong link but
 * an injection (`x-forwarded-proto: javascript:` plus a crafted `Host`).
 * @param req - the incoming request.
 * @returns `'https'` behind a TLS-terminating proxy, else `'http'`.
 */
export function schemeOf(req: RequestFacts): 'http' | 'https' {
  const forwarded = req.headers['x-forwarded-proto']
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded
  // A proxy chain appends its hops, so the leftmost is the client's own: an
  // `https, http` request is an HTTPS visitor this deployment must answer in kind.
  const first = typeof raw === 'string' ? (raw.split(',')[0] ?? '').trim().toLowerCase() : ''
  return first === 'https' ? 'https' : 'http'
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Render the page shown to a browser that arrived without the token.
 *
 * The URL is the host's own `authenticatedUrl` for *this* request's authority,
 * so it is correct on a LAN address, a hostname, or loopback alike. Every
 * colour carries a literal fallback because this is served before the SPA (and
 * therefore any stylesheet) has loaded.
 * @param authenticatedUrl - the host's tokenized URL.
 * @param requestedHost - the authority the caller actually used.
 * @returns a complete HTML document.
 */
export function tokenPage(authenticatedUrl: string, requestedHost: string | undefined): string {
  const href = escapeHtml(authenticatedUrl)
  const requested = requestedHost ?? 'this server'
  const host = escapeHtml(requested)
  const origin = (() => {
    try {
      return new URL(authenticatedUrl).host
    } catch {
      return requestedHost ?? ''
    }
  })()
  // Escaped like every other interpolation: WHATWG host parsing keeps `"` and
  // `&` verbatim, so a hostile `Host` would otherwise reach the document.
  const shownOrigin = escapeHtml(origin)
  const mismatch = origin !== '' && requestedHost !== undefined && origin !== requestedHost
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>DSH · 需要访问令牌</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #ffffff; --fg: #16181d; --muted: #6b7280; --border: #d8dbe0;
    --accent: #1f6feb; --accent-fg: #ffffff; --warn-bg: #fff8e6; --warn-fg: #7a5b00;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #14161a; --fg: #e8eaed; --muted: #9aa1ab; --border: #2b2f36;
      --accent: #4c8dff; --accent-fg: #0b0d10; --warn-bg: #2a2313; --warn-fg: #e8c66a;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
    background: var(--bg); color: var(--fg);
    font: 14px/1.6 system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  main { width: min(560px, 100%); }
  h1 { margin: 0 0 6px; font-size: 20px; font-weight: 600; }
  p { margin: 0 0 16px; color: var(--muted); }
  a.link {
    display: block; padding: 12px 14px; border: 1px solid var(--border); border-radius: 8px;
    background: var(--accent); color: var(--accent-fg); text-decoration: none;
    font-weight: 500; word-break: break-all;
  }
  a.link:hover { filter: brightness(1.08); }
  p.warn {
    margin: 16px 0 0; padding: 10px 12px; border-radius: 8px;
    background: var(--warn-bg); color: var(--warn-fg); font-size: 13px;
  }
  code {
    display: block; margin-top: 10px; padding: 10px 12px; border: 1px solid var(--border);
    border-radius: 8px; word-break: break-all; font-size: 12px; color: var(--muted);
  }
</style>
</head>
<body>
<main>
  <h1>需要访问令牌</h1>
  <p>此实例已在网络上开放，请通过下面的链接进入。令牌由 dsh 在启动时打印，也可从服务端终端日志中复制。</p>
  <a class="link" href="${href}">${href}</a>
  ${mismatch ? `<p class="warn">注意：链接使用的是 <b>${shownOrigin}</b>，与你访问的 <b>${host}</b> 不同。如果打不开，请改用上面的地址手动访问。</p>` : ''}
  <code>如果你通过反向代理访问，请确认代理转发了真实的 Host 头，并用 X-Forwarded-Proto 告知它对外是 http 还是 https。</code>
</main>
</body>
</html>`
}

/**
 * The page shown when the caller's authority is one the `/api` fence refuses.
 *
 * Reporting a token link here would be a lie: the link would mint a cookie and
 * load the shell, and then every `/api` call would answer `403` forever, with
 * nothing on screen to explain why. The fence admits loopback and the
 * deployment's own authorities (the LAN IP literals derived from an
 * all-interfaces bind, plus any `--trusted-host`) — so this page names the real
 * problem and links the authorities that actually work.
 *
 * @param requestedHost - the authority the caller used.
 * @param alternatives - tokenized URLs for authorities the fence admits.
 * @returns a complete HTML document.
 */
export function untrustedAuthorityPage(requestedHost: string | undefined, alternatives: readonly string[]): string {
  const host = escapeHtml(requestedHost ?? 'this address')
  const links = alternatives
    .map((url) => {
      const href = escapeHtml(url)
      return `<a class="link" href="${href}">${href}</a>`
    })
    .join('\n  ')
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>DSH · 该地址不可用</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #ffffff; --fg: #16181d; --muted: #6b7280; --border: #d8dbe0;
    --accent: #1f6feb; --accent-fg: #ffffff; --warn-bg: #fff8e6; --warn-fg: #7a5b00;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #14161a; --fg: #e8eaed; --muted: #9aa1ab; --border: #2b2f36;
      --accent: #4c8dff; --accent-fg: #0b0d10; --warn-bg: #2a2313; --warn-fg: #e8c66a;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
    background: var(--bg); color: var(--fg);
    font: 14px/1.6 system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  main { width: min(560px, 100%); }
  h1 { margin: 0 0 6px; font-size: 20px; font-weight: 600; }
  p { margin: 0 0 16px; color: var(--muted); }
  a.link {
    display: block; margin-bottom: 10px; padding: 12px 14px; border: 1px solid var(--border);
    border-radius: 8px; background: var(--accent); color: var(--accent-fg);
    text-decoration: none; font-weight: 500; word-break: break-all;
  }
  a.link:hover { filter: brightness(1.08); }
  p.warn {
    margin: 16px 0 0; padding: 10px 12px; border-radius: 8px;
    background: var(--warn-bg); color: var(--warn-fg); font-size: 13px;
  }
  code {
    display: block; margin-top: 10px; padding: 10px 12px; border: 1px solid var(--border);
    border-radius: 8px; word-break: break-all; font-size: 12px; color: var(--muted);
  }
</style>
</head>
<body>
<main>
  <h1>该地址不可用</h1>
  <p>你是通过 <b>${host}</b> 访问的，但这个地址不在本实例的信任列表里：<code>/api</code> 会对它返回 403，界面即使加载出来也无法使用。</p>
  ${links === '' ? '' : `<p>请改用下面这些地址之一：</p>\n  ${links}`}
  <p class="warn">
    如果要让这个域名可用，请在启动时把它加入信任列表，例如
    <code style="margin-top:6px">dsh web --host 0.0.0.0 --trusted-host ${host}</code>
  </p>
</main>
</body>
</html>`
}

/**
 * Arm the gate over the active webserver.
 *
 * Only the SPA shell is intercepted: static assets are public bundles, and
 * refusing them would break the very page an authorized caller is loading.
 * A request that already carries a token, or any other request, is delegated
 * untouched so the host's own fence decides.
 *
 * @param ctx - host context carrying `webServer` and `connection`.
 */
export function apply(ctx: Context): void {
  const webServer = (ctx as unknown as { webServer: WebServerLike }).webServer
  const connection = (ctx as unknown as { connection: ConnectionLike }).connection

  /**
   * The host's token URL for the authority this request actually used, so a
   * caller that arrived by LAN address is handed a LAN-address link rather than
   * the loopback one printed at startup. The scheme is the caller's own, so a
   * visitor who reached this deployment through a TLS-terminating proxy keeps
   * HTTPS instead of being sent to a plain-HTTP port that may not answer at all.
   */
  const urlFor = (req: IncomingMessage): string => {
    const host = req.headers.host
    if (typeof host !== 'string' || host.length === 0) {
      throw new Error('projects: remote gate has no Host to build a token URL from')
    }
    const base = new URL(`${schemeOf(req)}://${host}`).origin
    return connection.authenticatedUrl(base)
  }

  /**
   * The authorities the deployment actually serves, as tokenized URLs.
   *
   * These are the fence's own `trustedHosts`: LAN IP literals derived from an
   * all-interfaces bind, plus any `--trusted-host` extras. A port-less entry
   * matches any port, so an entry without one is completed with the bound port.
   * The caller's scheme is reused: a visitor on HTTPS got there through a TLS
   * proxy (so a trusted hostname stays on HTTPS), and a LAN visitor — the usual
   * one to see this page — arrives on plain HTTP, where the bind really is.
   */
  const alternativeUrls = (scheme: 'http' | 'https'): string[] => {
    const hosts = connection.trustedHosts
    if (!Array.isArray(hosts)) return []
    const urls: string[] = []
    for (const entry of hosts.slice(0, 4)) {
      if (typeof entry !== 'string' || entry.length === 0) continue
      try {
        const url = new URL(`${scheme}://${entry}`)
        if (url.port === '' && typeof webServer.port === 'number') url.port = String(webServer.port)
        urls.push(connection.authenticatedUrl(url.origin))
      } catch {
        // A malformed entry is the host's problem, already reported at load by
        // `assertTrustedAuthority`; it just does not become a link here.
      }
    }
    return urls
  }

  /**
   * Ask the host's own fence what it thinks of this request's authority.
   *
   * `403` is the case worth distinguishing: the authority is not one the
   * deployment serves, so handing out a token link would produce a shell that
   * loads and then fails every API call. A throw is treated as "unknown", which
   * falls back to the token page — the pre-existing courtesy.
   */
  const fenceRejection = (req: IncomingMessage): 401 | 403 | undefined => {
    try {
      return connection.requestRejection({ headers: req.headers })
    } catch {
      return undefined
    }
  }

  const wrapFallback = (handler: RouteHandler): RouteHandler =>
    async (req, res) => {
      if (
        !isIndexRequest(req)
        || isPageNavigation(req) === false
        || (req.method !== 'GET' && req.method !== 'HEAD')
      ) {
        await handler(req, res)
        return
      }
      // Two cases belong to the host, not to us:
      //
      //  - the request carries a token, which the host exchanges for its cookie
      //    inside the very handler we wrap — answering it would shadow that;
      //  - the request already holds that cookie, which is the state every
      //    browser reaches on the navigation following the exchange. Delegating
      //    lets the host serve the SPA.
      if (hasLaunchToken(req) || holdsHostCookie(req)) {
        await handler(req, res)
        return
      }
      // A `Host` this gate cannot build a URL from leaves the caller with the
      // host's own bare 401 rather than a crash: the token page is a courtesy,
      // and nothing here may become a new way to fail a request.
      let authenticatedUrl: string
      try {
        authenticatedUrl = urlFor(req)
      } catch {
        await handler(req, res)
        return
      }
      // An authority the fence refuses gets the truth instead of a link that
      // would load a shell that cannot talk to its own API.
      const body = req.method === 'HEAD'
        ? undefined
        : fenceRejection(req) === 403
          ? untrustedAuthorityPage(req.headers.host, alternativeUrls(schemeOf(req)))
          : tokenPage(authenticatedUrl, req.headers.host)
      res.writeHead(401, {
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'content-type': 'text/html; charset=utf-8',
      })
      res.end(body)
    }

  // Wrapped once per handler, so neither a reload of this plugin nor a second
  // arm of the same fiber stacks gates into a chain. The marker is a global
  // symbol rather than a per-apply WeakSet because a reload builds a fresh
  // `apply` closure: only a process-wide mark lets the new instance recognize
  // the wrapper the old one left on the seat.
  const mark = (handler: RouteHandler): RouteHandler => {
    const wrapped = wrapFallback(handler)
    Object.defineProperty(wrapped, GATE_WRAPPED, { value: true })
    return wrapped
  }
  const once = (handler: RouteHandler): RouteHandler =>
    (handler as unknown as Record<symbol, unknown>)[GATE_WRAPPED] === true ? handler : mark(handler)
  if (webServer.fallback !== undefined) webServer.fallback = once(webServer.fallback)
  // Captured unbound so disposal restores the exact original reference, not a
  // bound copy of it.
  const originalRegisterFallback = webServer.registerFallback
  ctx.effect(() => {
    webServer.registerFallback = (handler: RouteHandler) =>
      originalRegisterFallback.call(webServer, once(handler))
    return () => {
      webServer.registerFallback = originalRegisterFallback
    }
  }, 'projects: remote gate fallback wrap')

  ctx.logger.info('projects: 远程访问闸门已布防（host 0.0.0.0 已放开，未带令牌时展示令牌链接）')
}

/** Whether the request names a launch token, which the host will exchange. */
function hasLaunchToken(req: RequestFacts): boolean {
  try {
    return new URL(req.url ?? '/', 'http://dsh.invalid').searchParams.has('token')
  } catch {
    return false
  }
}

/**
 * Whether the request already carries the host's browser-session cookie.
 *
 * The cookie name is `dsh-auth-` plus base64url(sha256(authority)), where the
 * authority is this request's own `Host`. Reproducing the name is enough here:
 * a name match only decides whether to *delegate*, and the host then performs
 * the real signature and expiry check. No secret is read and no cookie is
 * minted. A wrong guess costs the caller the token page, never access.
 *
 * @param req - the incoming request.
 * @returns true when a cookie for this authority is present.
 */
function holdsHostCookie(req: RequestFacts): boolean {
  const host = req.headers.host
  const raw = req.headers.cookie
  if (typeof host !== 'string' || typeof raw !== 'string') return false
  let authority: string
  try {
    authority = new URL(`http://${host}`).host
  } catch {
    return false
  }
  const name = 'dsh-auth-' + createHash('sha256').update(authority).digest('base64url')
  return raw.split(';').some((segment) => {
    const at = segment.indexOf('=')
    return at !== -1 && segment.slice(0, at).trim() === name
  })
}
