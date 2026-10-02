import type { Context } from '@deepseek-ai/cordis';
/** Stable Cordis plugin name (matches the nested plugin in src/index.ts). */
export declare const name = "projects-remote-gate";
/** Services the gate needs. */
export declare const inject: string[];
/**
 * The request facts these helpers read.
 *
 * Narrower than node's `IncomingMessage` on purpose: the classifiers are pure,
 * so a caller (and a test) can hand them just the three fields actually
 * consulted instead of a full request.
 */
export interface RequestFacts {
    headers: Record<string, string | string[] | undefined>;
    method?: string;
    url?: string;
}
/**
 * Whether a request is a page navigation rather than a fetch: navigations get
 * the token page, everything else the host's own bare 401 (a JSON client has
 * no use for an HTML document).
 * @param req - the incoming request.
 * @returns true for a top-level or nested navigation.
 */
export declare function isPageNavigation(req: RequestFacts): boolean;
/**
 * Whether the request is the SPA shell — the one page worth intercepting.
 * @param req - the incoming request.
 * @returns true for `/` and `/index.html`.
 */
export declare function isIndexRequest(req: RequestFacts): boolean;
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
export declare function tokenPage(authenticatedUrl: string, requestedHost: string | undefined): string;
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
export declare function untrustedAuthorityPage(requestedHost: string | undefined, alternatives: readonly string[]): string;
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
export declare function apply(ctx: Context): void;
