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
}
