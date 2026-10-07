/**
 * Restricted-UI seats shadowed over the stock Web Client for normal users
 * ('user' role with a valid token). Registered at a LOWER priority than the
 * stock entries on three single-kind seats (lowest renders — the official
 * shadowing semantics of the slot registry):
 *
 *  - `sidebar.workspaces`  → RestrictedWorkspacesView: the project browser
 *    listing ONLY the sessions whose cwd bucket is the user's workspace
 *    (per-user session isolation, mirroring the host-side filterSessions
 *    cwd projection). Subagent rows and blank placeholders stay hidden.
 *    Replacing the stock browser also took its row menu with it, so the view
 *    carries the archive affordance itself: a per-row 归档 action, an
 *    archived/active filter, and 取消归档 to get a session back. The stock
 *    stop-and-archive confirmation and undo toast are not reachable from a
 *    shadow, so the host's `workspace/session-active` refusal is answered with
 *    the browser's own confirm and a `stopActivity` retry.
 *  - `sidebar.settings`    → RestrictedSettingsView: renders nothing — the
 *    settings trigger disappears entirely (normal users must not open the
 *    global settings panel; the privileged surface is also pinned 403
 *    off-loopback by the host itself).
 *  - `conversation.hero.workspace` → RestrictedPickerView: the workspace
 *    picker offering ONLY the user's own workspace (no workspace switching).
 *  - `sidebar.footer.action` (list, additive) → UserBadgeView: identity
 *    badge with the one-way logout (clear token + reload).
 */
import type { RefObject } from 'react';
import { type ClientDeps, type WhoAmI } from './api.ts';
import type { ProjectsLocaleKey } from './locales.ts';
/** Translate function for the projects namespace. */
export type TranslateProjects = (key: ProjectsLocaleKey) => string;
/** The subset of SessionListState the browser reads. */
interface SessionsState {
    ids: readonly string[];
    byId: Record<string, SessionRow | undefined>;
    current?: string;
}
/** The subset of SessionSummary the browser reads. */
interface SessionRow {
    id: string;
    displayTitle: string;
    /** The stock feed's title — present only while the object layer is hot. */
    title?: string;
    cwd?: string;
    running?: boolean;
    blank?: boolean;
    origin?: 'subagent';
}
/** The subset of WorkspaceListState the picker reads. */
interface WorkspacesState {
    items: readonly WorkspaceItem[];
}
/** The subset of WorkspaceView the picker reads. */
interface WorkspaceItem {
    workspaceId: string;
    path: string;
    title: string;
}
/** A useSessions-style selector hook (injected for tests). */
export type SessionsHook = <T>(selector: (state: SessionsState) => T) => T;
/** A useWorkspaces-style selector hook (injected for tests). */
export type WorkspacesHook = <T>(selector: (state: WorkspacesState) => T) => T;
/** Props of the sidebar.workspaces shadow. */
export interface RestrictedWorkspacesViewProps {
    t: TranslateProjects;
    /** Wide sidebar vs the collapsed rail. */
    wide: boolean;
    /** The framework's global sessions feed (standard kit). */
    useSessions: SessionsHook;
    /** Open one of the listed sessions. */
    openSession: (sessionId: string) => void;
    /** The signed-in normal user. */
    user: WhoAmI;
    /**
     * Durable-log titles keyed by session id (from /projects/api/my/sessions).
     * The stock feed only titles sessions whose object layer is hot; these
     * fill the cold ones so rows never fall back to the directory name.
     */
    titles?: Readonly<Record<string, string>>;
    /** Session ids the workspaces feed reports as archived. */
    archivedIds: readonly string[];
    /** Archive a session; `stopActivity` retries over the host's active refusal. */
    archiveSession: (sessionId: string, stopActivity?: boolean) => Promise<void>;
    /** Take a session back out of the archive. */
    unarchiveSession: (sessionId: string) => Promise<void>;
    /** Confirmation for the stop-and-archive retry (the browser's own by default). */
    confirm?: (message: string) => boolean;
}
/** The project browser: only this user's cwd-bucketed sessions. */
export declare function RestrictedWorkspacesView(props: RestrictedWorkspacesViewProps): React.ReactElement;
/**
 * Fetch the durable-log titles for the signed-in user's sessions once per
 * identity (best effort — failures leave the map empty and the feed's own
 * titles/display fallback stay in charge). Feeds
 * {@link RestrictedWorkspacesViewProps.titles}.
 */
export declare function useColdSessionTitles(user: WhoAmI | undefined, deps: Pick<ClientDeps, 'fetch' | 'storage'>): Readonly<Record<string, string>>;
/** Renders nothing — the settings trigger vanishes for normal users. */
export declare function RestrictedSettingsView(): React.ReactElement | null;
/**
 * Props of the conversation.hero.workspace shadow.
 */
export interface RestrictedPickerViewProps {
    t: TranslateProjects;
    /** Menu visibility (owned by the hero). */
    open: boolean;
    /** Anchor element ref (owned by the hero's chip). */
    anchorRef: RefObject<HTMLElement | null> | undefined;
    /** Currently selected workspace id, when any. */
    selectedId: string | undefined;
    /** Pick callback (owned by the hero). */
    onPick: (workspaceId: string) => void;
    /** Close callback (owned by the hero). */
    onClose: () => void;
    /** The framework's global workspaces feed (standard kit). */
    useWorkspaces: WorkspacesHook;
    /** The signed-in normal user. */
    user: WhoAmI;
}
/**
 * Compute the dropdown position for the picker menu: right below the anchor
 * chip, left-aligned with it, at least as wide as the chip; flips above the
 * chip when the drop would overflow the viewport; clamps into the viewport.
 */
export declare function pickerPosition(rect: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'width'>, viewport: {
    height: number;
}): {
    top: number;
    left: number;
    minWidth: number;
};
/** The workspace picker: only the user's own workspace is offered. */
export declare function RestrictedPickerView(props: RestrictedPickerViewProps): React.ReactElement | null;
/** Props of the sidebar.footer.action badge. */
export interface UserBadgeViewProps {
    t: TranslateProjects;
    /** Wide sidebar vs the collapsed rail. */
    wide: boolean;
    /** The signed-in normal user. */
    user: WhoAmI;
    /** Environment (fetch/storage/reload), injectable for tests. */
    deps: ClientDeps;
}
/** Identity badge with the one-way sign-out (clear token + reload). */
export declare function UserBadgeView(props: UserBadgeViewProps): React.ReactElement;
export {};
