/**
 * The host-side permission lock for project users (防君子 layer):
 *
 *  - every session whose cwd bucket lands inside a project-user workspace is
 *    pinned to {@link LOCKED_PRESET} at creation (host `session/created`),
 *    and
 *  - a per-agent shadow of the `permission` slash command (registered under
 *    that agent's scoped context — the official per-agent variant mechanism)
 *    answers queries with the locked preset and rejects every switch.
 *
 * Pure helpers only; the wiring lives in src/index.ts.
 */
import { isInside } from './paths.ts'

/** The only preset project users may run with. */
export const LOCKED_PRESET = 'workspace-write'

/**
 * Does this session cwd belong to a project-user workspace (the avatar
 * directories this plugin creates)? Admin/global sessions answer false.
 */
export function isProjectUserWorkspace(
  cwd: string | undefined,
  userWorkspacePaths: readonly string[],
): boolean {
  if (cwd === undefined || cwd === '') return false
  return userWorkspacePaths.some((base) => isInside(base, cwd))
}

/** The CommandResult shape of the dsh-commands registry (narrowed). */
export interface LockResult {
  kind: 'success' | 'error'
  text: string
}

/**
 * The locked `/permission` handler: a bare query reports the locked preset,
 * re-selecting it is an idempotent success, anything else is refused.
 */
export function permissionLockResult(rawInput: string): LockResult {
  const name = rawInput.trim()
  if (name === '' || name === LOCKED_PRESET) {
    return { kind: 'success', text: `preset ${LOCKED_PRESET} (locked for project users)` }
  }
  return { kind: 'error', text: `项目用户权限已锁定为 ${LOCKED_PRESET}，无法切换。` }
}
