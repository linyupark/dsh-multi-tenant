/**
 * Workspace layout for the project/user dual-workspace scheme:
 *
 *   <beside the project dir>/<projectSlug>-<userSlug>/  user workspace (the
 *   "avatar" directory: a real dir whose entries are symlinks back into the
 *   project directory). For auto-created projects the project dir lives at
 *   <root>/<projectSlug>, so the avatar lands at <root>/<slug>-<user>; for a
 *   project BOUND to an existing directory the avatar lands right BESIDE
 *   that bound directory.
 */
import { resolve, relative, isAbsolute, dirname, basename } from 'node:path'
import { slug } from './slug.ts'

/** Absolute path of an auto-created project workspace. */
export function projectWorkspacePath(root: string, projectName: string): string {
  return resolve(root, slug(projectName))
}

/** The user workspace ("avatar") directory beside a project directory. */
export function userWorkspacePath(root: string, projectName: string, userName: string): string {
  return avatarPathBeside(projectWorkspacePath(root, projectName), userName)
}

/**
 * Derive the avatar path for a user beside the project's ACTUAL directory
 * (auto-created or bound): dirname(<projectWs>)/<basename(<projectWs>)-<userSlug>.
 */
export function avatarPathBeside(projectWs: string, userName: string): string {
  return resolve(dirname(resolve(projectWs)), `${basename(resolve(projectWs))}-${slug(userName)}`)
}

/** True when `p` resolves inside `base` (inclusive), defeating `..` traversal. */
export function isInside(base: string, p: string): boolean {
  const rp = resolve(p)
  const rb = resolve(base)
  const rel = relative(rb, rp)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** A single symlink a user workspace should expose. */
export interface SymlinkPlanEntry {
  /** Entry name inside the project workspace (a safe single segment). */
  name: string
  /** Where the symlink lives (inside the user workspace). */
  linkPath: string
  /** What it points at (inside the project workspace). */
  targetPath: string
}

/** Inputs for planning a user workspace. */
export interface PlanUserWorkspaceInput {
  root: string
  projectName: string
  userName: string
  /**
   * The project's actual workspace path. Defaults to the auto-created
   * `<root>/<projectSlug>`; pass the recorded path for projects bound to an
   * existing directory (their symlinks must target the bound location).
   */
  projectWorkspacePath?: string
  /** Top-level entry names currently present in the project workspace. */
  projectEntries: readonly string[]
  /** Entry names the user workspace owns itself (never symlinked). */
  reserved: readonly string[]
}

/** Result of planning: where the user workspace lives and what it links. */
export interface UserWorkspacePlan {
  projectWorkspacePath: string
  userWorkspacePath: string
  symlinks: SymlinkPlanEntry[]
}

function isSafeSegment(name: string): boolean {
  return name.length > 0 && name !== '.' && name !== '..' && !name.includes('/')
}

/** Compute the user workspace path and its full symlink set. */
export function planUserWorkspace(input: PlanUserWorkspaceInput): UserWorkspacePlan {
  const projectWs = input.projectWorkspacePath ?? projectWorkspacePath(input.root, input.projectName)
  const userWs = avatarPathBeside(projectWs, input.userName)
  const reserved = new Set(input.reserved)
  const symlinks: SymlinkPlanEntry[] = []
  for (const name of input.projectEntries) {
    if (!isSafeSegment(name)) continue
    if (reserved.has(name)) continue
    symlinks.push({ name, linkPath: resolve(userWs, name), targetPath: resolve(projectWs, name) })
  }
  return { projectWorkspacePath: projectWs, userWorkspacePath: userWs, symlinks }
}
