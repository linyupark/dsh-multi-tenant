/**
 * Transport-agnostic API dispatcher. The webserver route handler adapts
 * node req/res onto ApiRequest/ApiResponse; everything here is pure and
 * unit-tested.
 */
import type { ProjectsService } from './service.ts';
/** A request already normalized off the wire. */
export interface ApiRequest {
    method: string;
    /** Path below the mount point, always starts with `/`. */
    path: string;
    /** Parsed JSON body (POST). */
    body?: Record<string, unknown>;
    /** Bearer token when the client presented one. */
    token?: string;
}
/** A response ready to be written back. */
export interface ApiResponse {
    status: number;
    json?: unknown;
}
/** Optional bridge to ctx.sessionQuery.filterSessions (cwd bucketing). */
export type SessionLister = (cwd: string) => Promise<Array<Record<string, unknown>>>;
/** Dispatcher dependencies. */
export interface ApiDeps {
    service: ProjectsService;
    sessionLister?: SessionLister;
}
/** Build the pure API dispatcher. */
export declare function createProjectsApi(deps: ApiDeps): (req: ApiRequest) => Promise<ApiResponse>;
