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
/** Result of physically deleting one user. */
export interface UserDeletionReport {
    slug: string;
    tokensRemoved: number;
    /**
     * Directory paths ACTUALLY removed — empty when there was nothing to remove
     * or the recorded path was refused. Consumers act on this, never on the
     * record's own `workspacePath`, so a refused removal cannot deregister a
     * live workspace.
     */
    workspacesRemoved: string[];
}
/** Result of physically deleting one project. */
export interface ProjectDeletionReport {
    slug: string;
    usersDeleted: string[];
    /** The user workspace directories that were removed, for registry cleanup. */
    workspacesRemoved: string[];
    /** False when the directory was a bound path and therefore left in place. */
    directoryRemoved: boolean;
    /** Set to the preserved directory when it was a bound path. */
    keptDirectory?: string;
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
    /**
     * Refresh one user's workspace against its project directory. Idempotent, so
     * it is safe to run on every session and at boot.
     */
    syncUserWorkspace(projectName: string, userName: string): Promise<SyncReport>;
    /**
     * Refresh the workspace of whichever user owns this cwd, if any.
     *
     * Session creation is the natural moment: the link set is a snapshot taken
     * when the user was created, so project entries added since then are missing
     * until something re-runs the plan. Returns undefined when the cwd belongs to
     * no project user (an admin session, or an ordinary directory).
     */
    syncWorkspaceForCwd(cwd: string): Promise<SyncReport | undefined>;
    /** Refresh every project user's workspace; returns how many succeeded. */
    syncAllWorkspaces(): Promise<number>;
    /**
     * Link project entries created after the user workspace was set up, and
     * refresh the workspace's AGENTS.md to the current guard rules.
     */
    private syncWorkspace;
    /**
     * Physically delete one DISABLED project user: their tokens, their workspace
     * directory, and the record itself.
     *
     * The disabled gate is the safety design — a live account is never removable
     * in one step, so disabling stays a reversible stage of its own.
     */
    deleteUser(username: string): Promise<UserDeletionReport>;
    /** The one-way gate both deletions share: disabled, and never an admin. */
    private assertDeletable;
    /**
     * Physically delete a project and everything under it, once every one of its
     * users is disabled.
     *
     * A directory the operator BOUND to an existing path is deliberately kept:
     * that is their real repository, not ours to remove. Only a workspace this
     * plugin created is deleted, which is why provenance is recorded at create
     * time rather than inferred from the path.
     */
    deleteProject(projectName: string): Promise<ProjectDeletionReport>;
    /**
     * Whether a project directory is one this plugin created.
     *
     * Provenance is recorded at create time. A record written before that field
     * existed falls back to the lexical check: for those, the path position is
     * the only evidence there is, and it is what they were created under.
     */
    private isManagedProjectPath;
    /**
     * Remove a user workspace directory, but only the one this plugin would have
     * created for that user.
     *
     * The allow-list is the point: the path must be exactly the avatar path
     * derived from the project directory and the user's own name. A corrupted,
     * stale or tampered record pointing at a sibling project, another user's
     * workspace, or an arbitrary directory therefore removes nothing. The
     * containment checks after it are defence in depth for the derivation itself.
     *
     * The removal never descends through symlinks (see {@link FsPort.remove}), so
     * the project's files are safe even though the workspace is full of links
     * into it.
     */
    private removeWorkspace;
}
