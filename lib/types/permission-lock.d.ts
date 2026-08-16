/** The only preset project users may run with. */
export declare const LOCKED_PRESET = "workspace-write";
/**
 * Does this session cwd belong to a project-user workspace (the avatar
 * directories this plugin creates)? Admin/global sessions answer false.
 */
export declare function isProjectUserWorkspace(cwd: string | undefined, userWorkspacePaths: readonly string[]): boolean;
/** The CommandResult shape of the dsh-commands registry (narrowed). */
export interface LockResult {
    kind: 'success' | 'error';
    text: string;
}
/**
 * The locked `/permission` handler: a bare query reports the locked preset,
 * re-selecting it is an idempotent success, anything else is refused.
 */
export declare function permissionLockResult(rawInput: string): LockResult;
