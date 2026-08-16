/**
 * Host-side workspace registration glue: pushes every user workspace into the
 * official `ctx.workspaceRegistry` so the stock Web Client can open sessions
 * there (and the restricted sidebar/picker find their rows). Pure logic —
 * the cordis wiring lives in src/index.ts.
 */
/** The registry surface this glue needs (see @deepseek-ai/dsh-workspace). */
export interface WorkspaceRegistryLike {
    create(path: string, title?: string): Promise<unknown>;
}
/** A user row as listProjects/listUsers public projections shape it. */
export interface WorkspaceUserRow {
    slug: string;
    workspacePath: string | null;
}
/**
 * Register every user workspace (admins have none). One failing row is
 * logged and skipped — a broken directory must not block the others.
 *
 * @param listUsers - resolves the current public user rows.
 * @param registry - the workspace registry face.
 * @param onError - optional failure sink (defaults to ignore).
 * @returns how many workspaces registered successfully.
 */
export declare function syncUserWorkspaces(listUsers: () => Promise<readonly WorkspaceUserRow[]>, registry: WorkspaceRegistryLike, onError?: (error: unknown) => void): Promise<number>;
