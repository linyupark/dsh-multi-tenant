import type { Repo } from './repo.ts';
import type { FsPort } from './fs-port.ts';
import type { ProjectRecord, UserRecord } from './records.ts';
/** Ports and knobs injected at construction. */
export interface ServiceDeps {
    repo: Repo;
    fs: FsPort;
    now(): number;
    /** Absolute root holding all project/user workspaces. */
    root: string;
    tokenTtlMs: number;
    /** Bootstrap admin password, applied only when the user store is empty. */
    adminPassword?: string;
    /** Extra AGENTS.md rules. */
    agentsRules?: readonly string[];
}
/** A login session handed to the client (token shown once). */
export interface LoginSession {
    token: string;
    user: PublicUser;
}
/** User projection safe to return to clients. */
export interface PublicUser {
    slug: string;
    name: string;
    projectSlug: string | null;
    role: 'admin' | 'user';
    status: 'active' | 'disabled';
    workspacePath: string | null;
}
/** Result of syncing a user workspace against the project dir. */
export interface SyncReport {
    linked: Array<{
        name: string;
    }>;
    skippedExisting: Array<{
        name: string;
    }>;
}
/** The domain core. */
export declare class ProjectsService {
    private readonly deps;
    constructor(deps: ServiceDeps);
    /** Seed roles and the optional bootstrap admin. Idempotent. */
    init(): Promise<void>;
    /** Create a project; auto-creates its workspace, or binds an existing directory. */
    createProject(name: string, workspacePath?: string): Promise<ProjectRecord>;
    /** Create a one-shot user with a symlinked workspace + AGENTS.md. */
    createUser(projectName: string, userName: string, password: string): Promise<UserRecord>;
    /** Resolve a user by `project/name` or a bare unique name (same names across projects). */
    private resolveUser;
    /** Verify credentials and mint a bearer token. */
    login(username: string, password: string): Promise<LoginSession>;
    /** Mint an extra token for a user (admin handoff). */
    issueToken(username: string): Promise<string>;
    private mint;
    /** Resolve a bearer token to its active user. Throws on any failure. */
    authenticate(token: string): Promise<UserRecord>;
    /** Disable a user; their tokens die with them. */
    disableUser(username: string): Promise<void>;
    /** List projects (public projections). */
    listProjects(): Promise<Array<{
        slug: string;
        name: string;
        workspacePath: string;
    }>>;
    /** List users of one project (or all when projectSlug is null). */
    listUsers(projectSlug: string | null): Promise<PublicUser[]>;
    /** Link project entries created after the user workspace was set up. */
    syncUserWorkspace(projectName: string, userName: string): Promise<SyncReport>;
}
