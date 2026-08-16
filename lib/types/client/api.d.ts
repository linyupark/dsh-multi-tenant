/**
 * Browser-side API helpers for the projects plugin: a tiny fetch wrapper over
 * `/projects/api`, the stored bearer token, the auth-gate decision, and a
 * minimal auth event bus. Everything is dependency-injected (fetchLike /
 * storage) so the whole layer unit-tests without a browser or a running dsh.
 */
/** The fetch surface callApi needs (a subset of globalThis.fetch). */
export interface FetchLike {
    (input: string, init?: {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
    }): Promise<{
        ok: boolean;
        status: number;
        json(): Promise<unknown>;
    }>;
}
/** The storage surface token helpers need (a subset of localStorage). */
export interface TokenStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}
/** Error carrying the HTTP status and the server-provided message. */
export declare class ApiError extends Error {
    readonly status: number;
    constructor(status: number, message: string);
}
/** localStorage key holding the bearer token. */
export declare const TOKEN_KEY = "dsh-projects-token";
/** One API call: JSON in, JSON out, non-2xx throws {@link ApiError}. */
export declare function callApi(fetchLike: FetchLike, path: string, opts?: {
    method?: 'GET' | 'POST';
    body?: unknown;
    token?: string;
}): Promise<unknown>;
/** Read the stored bearer token, or null. */
export declare function readStoredToken(storage: TokenStorage): string | null;
/** Persist the bearer token. */
export declare function writeStoredToken(storage: TokenStorage, token: string): void;
/** Drop the stored bearer token (logout). */
export declare function clearStoredToken(storage: TokenStorage): void;
/** The public user shape returned by /whoami and /login. */
export interface WhoAmI {
    slug: string;
    role: 'admin' | 'user';
    cwd: string | null;
    /** Owning project (slug/name); null for admins and legacy responses. */
    projectSlug: string | null;
    projectName: string | null;
}
/** Everything the UI components need from the environment. */
export interface ClientDeps {
    fetch: FetchLike;
    storage: TokenStorage;
    /** Hard-reset the page after logout so every surface re-probes. */
    reload(): void;
}
/** The browser environment (swappable in tests). */
export declare const browserDeps: ClientDeps;
/**
 * The gate decision: render nothing (open) or demand a login. Fails open when
 * the guard-status probe itself errors — a broken plugin API must never lock
 * the stock UI (same policy the previous tapIndex guard had).
 */
export type GateDecision = {
    phase: 'open';
    user?: WhoAmI;
} | {
    phase: 'login';
};
/** Probe guard-status (and whoami when a token exists) and decide. */
export declare function resolveGate(fetchLike: FetchLike, storage: TokenStorage): Promise<GateDecision>;
/** Resolve the current user through the stored token; null when absent. */
export declare function whoAmI(deps: ClientDeps): Promise<WhoAmI | null>;
/** Login with credentials, persist the minted token, return the user. */
export declare function login(deps: ClientDeps, username: string, password: string): Promise<WhoAmI>;
/** Drop the token, notify listeners, and reload so the gate re-arms. */
export declare function logout(deps: ClientDeps): void;
/** Auth state change notifications shared by the gate, badge and console. */
declare class AuthEventBus {
    private readonly target;
    private readonly handlers;
    /** Subscribe to 'changed'; returns the unsubscribe function. */
    on(event: 'changed', handler: () => void): () => void;
    /** Fire a 'changed' notification. */
    emit(event: 'changed'): void;
}
export declare const authEvents: AuthEventBus;
export {};
