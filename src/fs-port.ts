/**
 * Filesystem port: everything the service needs from node:fs, injectable for
 * tests. All path arguments are absolute; adapters own safety checks.
 */
import * as nodeFs from 'node:fs/promises'

/** Minimal async fs surface used by the projects service. */
export interface FsPort {
  mkdir(path: string): Promise<void>
  readdir(path: string): Promise<string[]>
  symlink(target: string, path: string): Promise<void>
  readlink(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  readFile(path: string): Promise<string>
  exists(path: string): Promise<boolean>
  /**
   * Remove a path recursively.
   *
   * Must remove symlinks themselves and never descend through them: a user
   * workspace is a directory of symlinks into the project, so a following
   * removal would delete the project. `fs.rm` uses lstat semantics, which is
   * exactly that behaviour. Only `test/delete-real-fs.test.ts` can assert it —
   * the in-memory fs in `test/service.test.ts` gives a symlink no content tree
   * to follow, so it passes whatever the real syscall would do.
   */
  remove(path: string): Promise<void>
  /** Canonical absolute path (symlinks resolved); rejects when missing. */
  realpath(path: string): Promise<string>
}

/** Real node:fs/promises adapter (mkdir is recursive, exists never throws). */
export const NodeFsPort: FsPort = {
  async mkdir(path) {
    await nodeFs.mkdir(path, { recursive: true })
  },
  readdir(path) {
    return nodeFs.readdir(path)
  },
  symlink(target, path) {
    return nodeFs.symlink(target, path)
  },
  readlink(path) {
    return nodeFs.readlink(path)
  },
  writeFile(path, content) {
    return nodeFs.writeFile(path, content, 'utf8')
  },
  readFile(path) {
    return nodeFs.readFile(path, 'utf8')
  },
  async exists(path) {
    try {
      await nodeFs.stat(path)
      return true
    } catch {
      return false
    }
  },
  remove(path) {
    return nodeFs.rm(path, { recursive: true, force: true })
  },
  realpath(path) {
    return nodeFs.realpath(path)
  },
}
