/** Minimal async fs surface used by the projects service. */
export interface FsPort {
    mkdir(path: string): Promise<void>;
    readdir(path: string): Promise<string[]>;
    symlink(target: string, path: string): Promise<void>;
    readlink(path: string): Promise<string>;
    writeFile(path: string, content: string): Promise<void>;
    readFile(path: string): Promise<string>;
    exists(path: string): Promise<boolean>;
}
/** Real node:fs/promises adapter (mkdir is recursive, exists never throws). */
export declare const NodeFsPort: FsPort;
