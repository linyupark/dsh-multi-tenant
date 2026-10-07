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
import type { RefObject } from 'react'
import { useEffect, useLayoutEffect, useState } from 'react'
import { callApi, logout, readStoredToken, type ClientDeps, type WhoAmI } from './api.ts'
import type { ProjectsLocaleKey } from './locales.ts'
import css from './restricted.module.css'

/** Translate function for the projects namespace. */
export type TranslateProjects = (key: ProjectsLocaleKey) => string

/** The subset of SessionListState the browser reads. */
interface SessionsState {
  ids: readonly string[]
  byId: Record<string, SessionRow | undefined>
  current?: string
}

/** The subset of SessionSummary the browser reads. */
interface SessionRow {
  id: string
  displayTitle: string
  /** The stock feed's title — present only while the object layer is hot. */
  title?: string
  cwd?: string
  running?: boolean
  blank?: boolean
  origin?: 'subagent'
}

/** The subset of WorkspaceListState the picker reads. */
interface WorkspacesState {
  items: readonly WorkspaceItem[]
}

/** The subset of WorkspaceView the picker reads. */
interface WorkspaceItem {
  workspaceId: string
  path: string
  title: string
}

/** A useSessions-style selector hook (injected for tests). */
export type SessionsHook = <T>(selector: (state: SessionsState) => T) => T

/** A useWorkspaces-style selector hook (injected for tests). */
export type WorkspacesHook = <T>(selector: (state: WorkspacesState) => T) => T

/** Props of the sidebar.workspaces shadow. */
export interface RestrictedWorkspacesViewProps {
  t: TranslateProjects
  /** Wide sidebar vs the collapsed rail. */
  wide: boolean
  /** The framework's global sessions feed (standard kit). */
  useSessions: SessionsHook
  /** Open one of the listed sessions. */
  openSession: (sessionId: string) => void
  /** The signed-in normal user. */
  user: WhoAmI
  /**
   * Durable-log titles keyed by session id (from /projects/api/my/sessions).
   * The stock feed only titles sessions whose object layer is hot; these
   * fill the cold ones so rows never fall back to the directory name.
   */
  titles?: Readonly<Record<string, string>>
  /** Session ids the workspaces feed reports as archived. */
  archivedIds: readonly string[]
  /** Archive a session; `stopActivity` retries over the host's active refusal. */
  archiveSession: (sessionId: string, stopActivity?: boolean) => Promise<void>
  /** Take a session back out of the archive. */
  unarchiveSession: (sessionId: string) => Promise<void>
  /** Confirmation for the stop-and-archive retry (the browser's own by default). */
  confirm?: (message: string) => boolean
}

/** The host's "this session still has work" archive refusal, matched by RPC code. */
function activeRefusal(reason: unknown): boolean {
  return (reason as { rpcError?: { code?: string } } | undefined)?.rpcError?.code === 'workspace/session-active'
}

/** The project browser: only this user's cwd-bucketed sessions. */
export function RestrictedWorkspacesView(props: RestrictedWorkspacesViewProps): React.ReactElement {
  const list = props.useSessions((s) => s)
  const [showArchived, setShowArchived] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const confirmWith = props.confirm ?? ((message: string) => globalThis.confirm(message))
  const archived = new Set(props.archivedIds)
  const mine = list.ids
    .map((id) => list.byId[id])
    .filter((row): row is SessionRow => row !== undefined)
    .filter((row) => row.cwd === props.user.cwd && row.origin !== 'subagent' && row.blank !== true)
  const rows = mine.filter((row) => archived.has(row.id) === showArchived)
  const archivedCount = mine.filter((row) => archived.has(row.id)).length

  /** Run one archive command, surfacing why it failed. */
  const run = (action: () => Promise<void>): void => {
    setError(undefined)
    void action().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  const archive = (sessionId: string): void => {
    run(async () => {
      try {
        await props.archiveSession(sessionId)
      } catch (reason) {
        // The host refuses while the session still has work. The stock browser
        // opens a stop-and-archive confirmation here; ours is the same bargain.
        if (!activeRefusal(reason)) throw reason
        if (!confirmWith(props.t('browser.archiveStop'))) return
        await props.archiveSession(sessionId, true)
      }
    })
  }

  return (
    <div className={css.browser} data-wide={props.wide ? 'true' : undefined}>
      <div className={css.browserHeader}>
        <span className={css.browserProjectLabel}>{props.t('browser.project')}</span>
        <span className={css.browserProjectName}>{props.user.projectName ?? props.user.slug}</span>
        <button
          type="button"
          className={css.browserFilter}
          aria-pressed={showArchived}
          onClick={() => setShowArchived((shown) => !shown)}
        >
          {showArchived ? props.t('browser.showActive') : props.t('browser.showArchived')}
          {archivedCount > 0 ? ` (${archivedCount})` : ''}
        </button>
      </div>
      {error === undefined ? null : (
        <p className={css.browserError} role="alert">
          {error}
        </p>
      )}
      {rows.length === 0 ? (
        <p className={css.empty}>{showArchived ? props.t('browser.emptyArchived') : props.t('browser.empty')}</p>
      ) : (
        <ul className={css.browserList}>
          {rows.map((row) => (
            <li key={row.id}>
              <div className={`${css.browserRow} ${list.current === row.id ? css.browserRowActive : ''}`}>
                <button type="button" className={css.browserOpen} onClick={() => props.openSession(row.id)}>
                  {row.running ? <span className={css.runningDot} aria-hidden="true" /> : null}
                  <span className={css.browserRowTitle}>{row.title ?? props.titles?.[row.id] ?? row.displayTitle}</span>
                </button>
                <button
                  type="button"
                  className={css.rowAction}
                  onClick={() => (showArchived ? run(() => props.unarchiveSession(row.id)) : archive(row.id))}
                >
                  {showArchived ? props.t('browser.unarchive') : props.t('browser.archive')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Fetch the durable-log titles for the signed-in user's sessions once per
 * identity (best effort — failures leave the map empty and the feed's own
 * titles/display fallback stay in charge). Feeds
 * {@link RestrictedWorkspacesViewProps.titles}.
 */
export function useColdSessionTitles(
  user: WhoAmI | undefined,
  deps: Pick<ClientDeps, 'fetch' | 'storage'>,
): Readonly<Record<string, string>> {
  const [titles, setTitles] = useState<Record<string, string>>({})
  useEffect(() => {
    setTitles({})
    if (user === undefined) return
    let cancelled = false
    const token = readStoredToken(deps.storage)
    if (token === null) return
    void callApi(deps.fetch, '/projects/api/my/sessions', { token })
      .then((res) => {
        if (cancelled) return
        const sessions = (res as { sessions?: Array<{ id?: string; title?: string }> }).sessions ?? []
        const map: Record<string, string> = {}
        for (const s of sessions) {
          if (typeof s.id === 'string' && typeof s.title === 'string' && s.title.length > 0) map[s.id] = s.title
        }
        setTitles(map)
      })
      .catch(() => {
        // Best effort: cold rows keep the feed's own title/display fallback.
      })
    return () => {
      cancelled = true
    }
    // deps is the module-constant browserDeps (or a stable test double).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.slug])
  return titles
}

/** Renders nothing — the settings trigger vanishes for normal users. */
export function RestrictedSettingsView(): React.ReactElement | null {
  return null
}

/**
 * Props of the conversation.hero.workspace shadow.
 */
export interface RestrictedPickerViewProps {
  t: TranslateProjects
  /** Menu visibility (owned by the hero). */
  open: boolean
  /** Anchor element ref (owned by the hero's chip). */
  anchorRef: RefObject<HTMLElement | null> | undefined
  /** Currently selected workspace id, when any. */
  selectedId: string | undefined
  /** Pick callback (owned by the hero). */
  onPick: (workspaceId: string) => void
  /** Close callback (owned by the hero). */
  onClose: () => void
  /** The framework's global workspaces feed (standard kit). */
  useWorkspaces: WorkspacesHook
  /** The signed-in normal user. */
  user: WhoAmI
}

/** Vertical gap between the anchor chip and the dropped menu (px). */
const PICKER_GAP = 6
/** Height budget for the flip-above decision (px). */
const PICKER_MAX_HEIGHT = 320
/** Minimum left edge the menu may occupy (px). */
const PICKER_MIN_LEFT = 8

/**
 * Compute the dropdown position for the picker menu: right below the anchor
 * chip, left-aligned with it, at least as wide as the chip; flips above the
 * chip when the drop would overflow the viewport; clamps into the viewport.
 */
export function pickerPosition(
  rect: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'width'>,
  viewport: { height: number },
): { top: number; left: number; minWidth: number } {
  const dropTop = rect.bottom + PICKER_GAP
  const flipUp = dropTop + PICKER_MAX_HEIGHT > viewport.height
  const rawTop = flipUp ? rect.top - PICKER_GAP - PICKER_MAX_HEIGHT : dropTop
  const top = Math.max(rawTop, PICKER_MIN_LEFT)
  const left = Math.max(rect.left, PICKER_MIN_LEFT)
  return { top, left, minWidth: Math.max(Math.round(rect.width), 200) }
}

/** The workspace picker: only the user's own workspace is offered. */
export function RestrictedPickerView(props: RestrictedPickerViewProps): React.ReactElement | null {
  const [anchorBox, setAnchorBox] = useState<{ top: number; left: number; minWidth: number } | undefined>()
  useLayoutEffect(() => {
    if (!props.open) return
    const el = props.anchorRef?.current
    if (!el) {
      setAnchorBox(undefined)
      return
    }
    const rect = el.getBoundingClientRect()
    setAnchorBox(pickerPosition(rect, { height: window.innerHeight }))
  }, [props.open, props.anchorRef])
  // Hooks must run unconditionally (React #310 otherwise when `open` flips):
  // read the feed even while closed, then bail out of rendering.
  const items = props.useWorkspaces((s) => s.items)
  if (!props.open) return null
  const mine = items.find((w) => w.path === props.user.cwd)
  const anchored = anchorBox !== undefined
  return (
    <div
      className={css.picker}
      data-anchored={anchored ? 'true' : undefined}
      role="menu"
      aria-label={props.t('browser.project')}
      style={anchored ? { top: `${anchorBox!.top}px`, left: `${anchorBox!.left}px`, minWidth: `${anchorBox!.minWidth}px` } : undefined}
    >
      {mine ? (
        <button
          type="button"
          className={`${css.pickerRow} ${props.selectedId === mine.workspaceId ? css.browserRowActive : ''}`}
          role="menuitem"
          onClick={() => {
            props.onPick(mine.workspaceId)
            props.onClose()
          }}
        >
          <span className={css.browserRowTitle}>{mine.title}</span>
        </button>
      ) : (
        <p className={css.pickerNote}>{props.t('picker.missing')}</p>
      )}
    </div>
  )
}

/** Props of the sidebar.footer.action badge. */
export interface UserBadgeViewProps {
  t: TranslateProjects
  /** Wide sidebar vs the collapsed rail. */
  wide: boolean
  /** The signed-in normal user. */
  user: WhoAmI
  /** Environment (fetch/storage/reload), injectable for tests. */
  deps: ClientDeps
}

/** Identity badge with the one-way sign-out (clear token + reload). */
export function UserBadgeView(props: UserBadgeViewProps): React.ReactElement {
  const onLogout = (): void => {
    logout(props.deps)
  }
  return (
    <div className={css.badge}>
      <span className={css.badgeIdentity}>
        <span className={css.badgeName}>{props.user.slug}</span>
        {props.wide && props.user.projectName ? (
          <span className={css.badgeProject}>{props.user.projectName}</span>
        ) : null}
      </span>
      <button type="button" className={css.logout} onClick={onLogout}>
        {props.t('badge.logout')}
      </button>
    </div>
  )
}
