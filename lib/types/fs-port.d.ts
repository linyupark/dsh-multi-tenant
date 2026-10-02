/** Minimal async fs surface used by the projects service. */
export interface FsPort {
    mkdir(path: string): Promise<void>;
    readdir(path: string): Promise<string[]>;
    symlink(target: string, path: string): Promise<void>;
    readlink(path: string): Promise<string>;
    writeFile(path: string, content: string): Promise<void>;
    readFile(path: string): Promise<string>;
    exists(path: string): Promise<boolean>;
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
    remove(path: string): Promise<void>;
    /** Canonical absolute path (symlinks resolved); rejects when missing. */
    realpath(path: string): Promise<string>;
}
/** Real node:fs/promises adapter (mkdir is recursive, exists never throws). */
export declare const NodeFsPort: FsPort;
