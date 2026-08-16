/** Table names of the projects domain. */
export type RepoTable = 'projects' | 'users' | 'tokens' | 'roles';
/** Storage port used by the service. */
export interface Repo {
    get(table: RepoTable, key: string): Promise<unknown | undefined>;
    put(table: RepoTable, key: string, value: unknown): Promise<void>;
    delete(table: RepoTable, key: string): Promise<boolean>;
    list(table: RepoTable): Promise<Array<[string, unknown]>>;
    close?(): Promise<void>;
}
/** In-memory adapter for tests. */
export declare class MemoryRepo implements Repo {
    private tables;
    private table;
    get(table: RepoTable, key: string): Promise<unknown>;
    put(table: RepoTable, key: string, value: unknown): Promise<void>;
    delete(table: RepoTable, key: string): Promise<boolean>;
    list(table: RepoTable): Promise<[string, unknown][]>;
}
/** JSON-file adapter with atomic tmp+rename writes. */
export declare class JsonFileRepo implements Repo {
    private readonly file;
    private data;
    private loaded;
    private writing;
    constructor(file: string);
    private load;
    private persist;
    get(table: RepoTable, key: string): Promise<unknown>;
    put(table: RepoTable, key: string, value: unknown): Promise<void>;
    delete(table: RepoTable, key: string): Promise<boolean>;
    list(table: RepoTable): Promise<[string, unknown][]>;
}
/** Structural type of a storage-domain table handle we rely on. */
interface DomainTableLike {
    get(key: string): unknown;
    entries(): IterableIterator<[string, unknown]>;
    put(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<boolean>;
}
/** Structural type of the domain handle returned by `storageDomain.open`. */
export interface DomainHandleLike {
    table(name: string): DomainTableLike;
    close(): Promise<void>;
}
/** Adapter over a `ctx.storageDomain` handle (the official typed storage). */
export declare class StorageDomainRepo implements Repo {
    private readonly domain;
    constructor(domain: DomainHandleLike);
    private table;
    get(table: RepoTable, key: string): Promise<unknown>;
    put(table: RepoTable, key: string, value: unknown): Promise<void>;
    delete(table: RepoTable, key: string): Promise<boolean>;
    list(table: RepoTable): Promise<[string, unknown][]>;
    close(): Promise<void>;
}
export {};
