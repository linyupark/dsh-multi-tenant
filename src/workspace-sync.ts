/**
 * Host-side workspace registration glue: pushes every user workspace into the
 * official `ctx.workspaceRegistry` so the stock Web Client can open sessions
 * there (and the restricted sidebar/picker find their rows). Pure logic —
 * the cordis wiring lives in src/index.ts.
 */
import { basename, dirname, join } from 'node:path'

/** The registry surface this glue needs (see @deepseek-ai/dsh-workspace). */
export interface WorkspaceRegistryLike {
  create(path: string, title?: string): Promise<unknown>
  list?(): ReadonlyArray<{ id: unknown; path: string }>
  delete?(id: never): Promise<boolean>
}

/** A user row as listProjects/listUsers public projections shape it. */
export interface WorkspaceUserRow {
  slug: string
  workspacePath: string | null
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
export async function syncUserWorkspaces(
  listUsers: () => Promise<readonly WorkspaceUserRow[]>,
  registry: WorkspaceRegistryLike,
  onError?: (error: unknown) => void,
): Promise<number> {
  const users = await listUsers()
  let registered = 0
  for (const user of users) {
    if (!user.workspacePath) continue
    try {
      await registry.create(user.workspacePath, user.slug)
      registered += 1
    } catch (error) {
      onError?.(error)
    }
  }
  return registered
}

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
export async function forgetWorkspace(
  deps: {
    path: string
    realpath(path: string): Promise<string>
    registry: WorkspaceRegistryLike
    onError?: (error: unknown) => void
  },
): Promise<boolean> {
  const { registry } = deps
  if (registry.list === undefined || registry.delete === undefined) return false
  const parent = await (async () => {
    try {
      return await deps.realpath(dirname(deps.path))
    } catch {
      return undefined
    }
  })()
  const candidates = new Set([deps.path])
  if (parent !== undefined) candidates.add(join(parent, basename(deps.path)))
  let removed = false
  for (const entry of registry.list()) {
    if (!candidates.has(entry.path)) continue
    try {
      // Called through the registry, never as a detached reference: `delete` is
      // a prototype method and needs its receiver.
      if (await registry.delete!(entry.id as never)) removed = true
    } catch (error) {
      deps.onError?.(error)
    }
  }
  return removed
}
