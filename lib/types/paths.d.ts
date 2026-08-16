/** Absolute path of an auto-created project workspace. */
export declare function projectWorkspacePath(root: string, projectName: string): string;
/** The user workspace ("avatar") directory beside a project directory. */
export declare function userWorkspacePath(root: string, projectName: string, userName: string): string;
/**
 * Derive the avatar path for a user beside the project's ACTUAL directory
 * (auto-created or bound): dirname(<projectWs>)/<basename(<projectWs>)-<userSlug>.
 */
export declare function avatarPathBeside(projectWs: string, userName: string): string;
/** True when `p` resolves inside `base` (inclusive), defeating `..` traversal. */
export declare function isInside(base: string, p: string): boolean;
/** A single symlink a user workspace should expose. */
export interface SymlinkPlanEntry {
    /** Entry name inside the project workspace (a safe single segment). */
    name: string;
    /** Where the symlink lives (inside the user workspace). */
    linkPath: string;
    /** What it points at (inside the project workspace). */
    targetPath: string;
}
/** Inputs for planning a user workspace. */
export interface PlanUserWorkspaceInput {
    root: string;
    projectName: string;
    userName: string;
    /**
     * The project's actual workspace path. Defaults to the auto-created
     * `<root>/<projectSlug>`; pass the recorded path for projects bound to an
     * existing directory (their symlinks must target the bound location).
     */
    projectWorkspacePath?: string;
    /** Top-level entry names currently present in the project workspace. */
    projectEntries: readonly string[];
    /** Entry names the user workspace owns itself (never symlinked). */
    reserved: readonly string[];
}
/** Result of planning: where the user workspace lives and what it links. */
export interface UserWorkspacePlan {
    projectWorkspacePath: string;
    userWorkspacePath: string;
    symlinks: SymlinkPlanEntry[];
}
/** Compute the user workspace path and its full symlink set. */
export declare function planUserWorkspace(input: PlanUserWorkspaceInput): UserWorkspacePlan;
