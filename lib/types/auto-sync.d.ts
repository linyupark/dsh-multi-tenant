/**
 * Automatic user-workspace sync.
 *
 * A user workspace's symlinks are a snapshot taken when the user was created,
 * so a project entry added afterwards stays invisible to that user until the
 * plan is re-run. Two moments matter, and both are idempotent:
 *
 *  - session creation, which is when a stale view would actually be noticed;
 *  - startup, which refreshes every user once instead of waiting for each of
 *    them to open a session.
 *
 * Kept separate from the cordis wiring so the scheduling and error handling are
 * testable without a live context.
 */
import type { ProjectsService } from './service.ts';
/** The session facts this wiring reads. */
export interface SessionLike {
    header?: {
        cwd?: string;
    };
}
/** The logger face the wiring uses (satisfied by a cordis child logger). */
export interface SyncLogger {
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
}
/** What the wiring needs from the host. */
export interface AutoSyncDeps {
    /** The live service, or undefined while it is still booting. */
    service(): ProjectsService | undefined;
    /** Subscribe to session creation (a cordis `ctx.on`). */
    onSession(listener: (session: SessionLike) => void): void;
    logger: SyncLogger;
    /** How long to wait between checks for the booted service. */
    pollMs?: number;
    /** Injectable scheduler, so a test drives the boot pass synchronously. */
    setInterval?: typeof setInterval;
    clearInterval?: typeof clearInterval;
}
/**
 * Sync the workspace of whichever user owns this session's cwd.
 *
 * Fire-and-forget by design: session creation is a synchronous boundary and a
 * sync failure must never veto a session. The report is only logged when it
 * actually linked something, so an idle session stays quiet.
 *
 * @param svc - the live service, if booted.
 * @param session - the session just created.
 * @param logger - failure sink.
 */
export declare function syncSessionWorkspace(svc: ProjectsService | undefined, session: SessionLike, logger: SyncLogger): void;
/**
 * Arm the session hook and the one boot-time pass.
 *
 * @param deps - service accessor, session subscription, logger and scheduler.
 * @returns a disposer that releases the pending boot timer.
 */
export declare function armAutoSync(deps: AutoSyncDeps): () => void;
