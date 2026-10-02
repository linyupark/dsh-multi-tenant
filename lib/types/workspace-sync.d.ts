/** The registry surface this glue needs (see @deepseek-ai/dsh-workspace). */
export interface WorkspaceRegistryLike {
    create(path: string, title?: string): Promise<unknown>;
    list?(): ReadonlyArray<{
        id: unknown;
        path: string;
    }>;
    delete?(id: never): Promise<boolean>;
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
/**
 * Drop a workspace registration whose directory is gone, so the stock sidebar
 * stops offering a workspace that can no longer be opened.
 *
 * Matching is by canonical path: `create` canonicalizes through `realpath`, so
 * a registration made through a symlinked root does not compare equal to the
 * path we recorded. The directory itself is usually already deleted by the
 * time this runs, so the canonical form is rebuilt from the surviving parent
 * rather than from the target.
 *
 * @param deps - target path, a realpath probe, and the registry face.
 * @returns true when a registration was removed.
 */
export declare function forgetWorkspace(deps: {
    path: string;
    realpath(path: string): Promise<string>;
    registry: WorkspaceRegistryLike;
    onError?: (error: unknown) => void;
}): Promise<boolean>;
