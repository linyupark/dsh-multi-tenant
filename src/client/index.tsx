/**
 * dsh-multi-tenant — browser half.
 *
 * Seats contributed into the official Web Client:
 *  - `shell.overlay` (list): the auth gate — a full-frame login card while
 *    the host guard is armed and no valid token is stored.
 *  - `settings.section` (list): the "Projects & Users" admin console.
 *  - `sidebar.footer.action` (list): the normal-user identity badge with the
 *    one-way sign-out (clear token + reload; hidden for admins/anonymous).
 *
 * Restricted mode for normal users ('user' role + valid token) — the official
 * slot shadowing semantics (single-kind seats render the LOWEST priority
 * entry; a different-priority registration shadows, disposal restores):
 *  - `sidebar.workspaces` shadow: the project browser listing ONLY the
 *    sessions cwd-bucketed into the user's workspace (per-user isolation);
 *  - `sidebar.settings` shadow: renders nothing — the settings trigger
 *    disappears (normal users must not touch global settings);
 *  - `sidebar.right.tab.guide.entry` + `sidebar.right.pane.tab(.title)
 *    shadows: the stock right-sidebar terminal is blanked — its host side
 *    hands out a shell without sandbox or approval restrictions;
 *  - `conversation.hero.workspace` shadow: the picker offering ONLY the
 *    user's own workspace (no workspace switching).
 *  - `conversation.session.header.actions` (list, session scope): the tenant
 *    guard for the session on screen — renders nothing and navigates a normal
 *    user away from a session whose cwd bucket is not theirs.
 *  - composer access-mode chip lock: while a normal user is signed in a body
 *    role flag + injected stylesheet freeze the permission-mode chip at its
 *    pinned value (workspace-write; the host half re-asserts it anyway) —
 *    no menu, no chevron; admins/anonymous see the stock chip untouched.
 *
 * Navigation lives on `ctx.uiWorkspace` in 0.2.0: `ctx.sessions` is data-only
 * and `ctx.workspaces` is registry-only, so opening a session, connecting a
 * workspace and picking a directory all go through that one service.
 *
 * Shadows register/unregister dynamically as the resolved identity flips
 * (login → user, logout → reload), each inside its slot's declaration
 * lifecycle via `slots.inject` (declaration-bound teardown runs them).
 */
import { useEffect, useSyncExternalStore } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
// Type-only: pulls the ctx.locale Context merge.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ctx.slots (SlotRegistry) Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the ctx.uiWorkspace Context merge (session/workspace
// navigation and the host directory picker).
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
// Type-only: pulls the ctx.workspaces (IWorkspaces) Context merge, plus the
// `useSessions` / `sessionId` standard-kit shares on slot props.
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// Type-only: load the SlotMap declaration merges — ui-layout declares
// 'shell.overlay', ui-settings declares 'settings.section' (with `close`),
// ui-sidebar declares 'sidebar.workspaces' / 'sidebar.settings' /
// 'sidebar.footer.action', ui-conversation declares
// 'conversation.hero.workspace' and 'conversation.session.header.actions'.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { AuthGateView, type AuthGateMode } from './auth-gate.tsx'
import { AdminSectionView } from './admin-section.tsx'
import {
  RestrictedPickerView,
  RestrictedSettingsView,
  RestrictedWorkspacesView,
  UserBadgeView,
  useColdSessionTitles,
} from './restricted.tsx'
import { browserDeps, type WhoAmI } from './api.ts'
import { watchIdentity, type IdentityState } from './identity.ts'
import { applyBodyRole, mountPermissionLockStyle } from './perm-lock.ts'
import { mountRestrictedSurfaceStyle, PLUGINS_PANEL_ID } from './restricted-surface.ts'
import { zh, en } from './locales.ts'

/** Services required by this plugin (slots registry, locale, workspaces feed, navigation). */
export const inject = ['slots', 'locale', 'workspaces', 'uiWorkspace']

/** Locale-namespace 'projects' dictionary key type re-export for consumers. */
export type { ProjectsLocaleKey } from './locales.ts'

/**
 * A uSES-compatible identity source: one shared resolution of "who is at
 * this browser" republished on auth changes. Entries subscribe through
 * {@link useIdentity}; the shadow controllers poll it imperatively.
 */
interface IdentitySource {
  subscribe(fn: () => void): () => void
  get(): IdentityState
}

/** Subscribe a component to the shared identity resolution. */
function useIdentity(source: IdentitySource): IdentityState {
  return useSyncExternalStore(source.subscribe, source.get)
}

/** Build the source + its watcher stopper (one per plugin lifetime). */
function createIdentitySource(): { source: IdentitySource; stop(): void } {
  let state: IdentityState = { kind: 'resolving' }
  const listeners = new Set<() => void>()
  /** The user payload of a state, when it carries one. */
  const userOf = (s: IdentityState): WhoAmI | undefined => (s.kind === 'user' || s.kind === 'admin' ? s.user : undefined)
  const stop = watchIdentity(browserDeps, (next) => {
    const sameUser = (a?: WhoAmI, b?: WhoAmI): boolean =>
      a?.slug === b?.slug && a?.role === b?.role && a?.cwd === b?.cwd
    if (next.kind === state.kind && sameUser(userOf(next), userOf(state))) return
    state = next
    for (const listener of [...listeners]) listener()
  })
  return {
    source: {
      subscribe(fn) {
        listeners.add(fn)
        return () => { listeners.delete(fn) }
      },
      get: () => state,
    },
    stop,
  }
}

/**
 * Mount the plugin's browser surfaces.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('projects', { zh, en }), 'projects: dictionaries')

  const identity = createIdentitySource()
  ctx.effect(() => identity.stop, 'projects: identity watcher')
  const source = identity.source

  // Access-mode chip lock (normal users): the stylesheet pins the composer
  // chip to its pinned value (host already rejects switches); the body role
  // flag scopes it to the signed-in user only — admins keep the full menu.
  ctx.effect(() => mountPermissionLockStyle(document), 'projects: permission lock style')
  // Stock surfaces a normal user must not reach: the sidebar's Plugins panel
  // button, which installs bundles and can disable this plugin.
  ctx.effect(() => mountRestrictedSurfaceStyle(document), 'projects: restricted surface style')
  ctx.effect(() => {
    const sync = () => applyBodyRole(document.body, source.get().kind === 'user' ? 'user' : 'other')
    sync()
    return source.subscribe(sync)
  }, 'projects: body role flag')

  // ---- always-on seats -----------------------------------------------------

  type GateProps = PropsRuntime<'shell.overlay'> & PropsLocale<'projects'>
  function AuthGateEntry(props: GateProps): React.ReactElement | null {
    // Controlled phases: 'checking' covers the whole frame while the shared
    // identity resolves (no stock-UI flash-through), 'form' is the login
    // card, everything else renders nothing. The identity source drives the
    // flip — and for a signed-in user the shadows register synchronously in
    // the same publish, before React lifts this veil.
    const state = useIdentity(source)
    const mode: AuthGateMode =
      state.kind === 'resolving' ? 'checking' : state.kind === 'anonymous' ? 'form' : 'hidden'
    return <AuthGateView t={props.t} deps={browserDeps} mode={mode} />
  }

  type AdminProps = PropsRuntime<'settings.section'> & PropsLocale<'projects'>
  function AdminSectionEntry(props: AdminProps): React.ReactElement {
    // The same host wire primitive the stock workspace picker drives
    // (host native chooser on capable hosts; browse backends reject →
    // the view surfaces a type-it-yourself note).
    const picker = {
      pick: (): Promise<string | null> => ctx.uiWorkspace.pickDirectory(),
    }
    return <AdminSectionView t={props.t} close={props.close} deps={browserDeps} picker={picker} />
  }

  type BadgeProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<'projects'>
  function UserBadgeEntry(props: BadgeProps): React.ReactElement | null {
    // Serves both roles: normal users get their project identity, admins get
    // a quick sign-out without diving into Settings → plugin pages.
    const state = useIdentity(source)
    if (state.kind !== 'user' && state.kind !== 'admin') return null
    return <UserBadgeView t={props.t} wide={props.wide} user={state.user} deps={browserDeps} />
  }

  // Login gate on the frame-wide floating layer (list kind, additive id).
  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    { name: 'shell.overlay', id: 'projects-auth-gate', order: 0, locale: 'projects' },
    AuthGateEntry,
  ))

  // Admin console as a settings page (nav label follows the active locale).
  //
  // The nav glyph is painted by the shell from the section ID alone
  // (dsh-client-ui-settings-general `navIcon`): only the shipped `account` id
  // maps to a person glyph, every other id falls back to the settings gear —
  // there is no per-section icon option. This is a tenant console, so we claim
  // the `account` cell, which the slot catalog documents as "reusing a shipped
  // id puts you in THAT cell". The official account page claims the same cell
  // only while a DeepSeek credential is stored, after boot, from a store
  // listener that swallows the losing registration (logged, not fatal), so the
  // conflict costs that page and nothing else. Our own register CAN throw when
  // the cell is already taken, and a throw here would take the whole client
  // half — login gate included — down with it: hence the gear fallback.
  ctx.slots.inject('settings.section', () => {
    const options = {
      name: 'settings.section' as const,
      order: 200,
      locale: 'projects' as const,
      label: () => ctx.locale.bind('projects')('section.title'),
    }
    try {
      return ctx.slots.register({ ...options, id: 'account' }, AdminSectionEntry)
    } catch {
      return ctx.slots.register({ ...options, id: 'projects-admin' }, AdminSectionEntry)
    }
  })

  // Identity badge beside Settings (renders for signed-in users AND admins —
  // admins otherwise have to dig through Settings for a sign-out).
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
    { name: 'sidebar.footer.action', id: 'projects-user-badge', order: 0, locale: 'projects' },
    UserBadgeEntry,
  ))

  // ---- normal-user shadows (dynamic: register while user, dispose otherwise)

  // ---- navigation and the per-user session guard --------------------------
  //
  // 0.2.0 moved navigation out of the data services and into one service:
  // `ctx.sessions` is data-only (no `open`/`clear`/`current`) and
  // `ctx.workspaces` is registry-only (no `connectWorkspace`/`pickDirectory`).
  // `ctx.uiWorkspace` now owns `connectWorkspace` + `openSession` +
  // `pickDirectory`, so the read side stays on `ctx.workspaces.list` and every
  // write goes through `uiWorkspace`.

  /** Which user the auto-connect already armed for (one shot per identity). */
  let autoConnectedFor: string | undefined

  /**
   * A project user has exactly one legal workspace — navigate them into it as
   * soon as their identity resolves, so the hero lands pre-picked instead of
   * offering a one-entry menu. The tenant guard below re-runs this with
   * `force` when the viewed session belongs to somebody else.
   *
   * Mirrors the stock hero's onPick flow (connectWorkspace + open) minus the
   * draft migration — nothing is staged yet at identity time.
   */
  function autoConnectWorkspace(user: WhoAmI | undefined, force = false): void {
    if (!user?.cwd) return
    if (!force && autoConnectedFor === user.slug) return
    autoConnectedFor = user.slug
    void (async () => {
      try {
        const mine = ctx.workspaces.list.getSnapshot().items.find((w) => w.path === user.cwd)
        if (mine === undefined) return
        const sessionId = await ctx.uiWorkspace.connectWorkspace(mine.workspaceId)
        ctx.uiWorkspace.openSession(sessionId)
      } catch {
        // Best effort: the restricted picker still offers the one entry.
      }
    })()
  }

  /**
   * Tenant guard for the session currently on screen: renders nothing, and
   * navigates a normal user away from a session whose cwd bucket is not
   * theirs.
   *
   * The runtime may restore or re-set the current session at any tick (wire
   * resync, list refresh), and 0.2.0 publishes no readable/clearable
   * selection — `SessionListState` dropped `current`, and `uiWorkspace`
   * exposes neither a read nor a clear. So the guard observes the viewed
   * session through the supported channel: a session-scoped seat receives
   * `sessionId` plus the global sessions feed.
   */
  type SessionGuardProps = PropsRuntime<'conversation.session.header.actions'>
  function ForeignSessionGuard(props: SessionGuardProps): null {
    const state = useIdentity(source)
    const cwd = props.useSessions((list: SessionListState) => list.byId[props.sessionId]?.cwd)
    const user = state.kind === 'user' ? state.user : undefined
    const foreign = user?.cwd !== undefined && cwd !== undefined && cwd !== user.cwd
    useEffect(() => {
      if (foreign) autoConnectWorkspace(user, true)
    }, [foreign, user?.slug, props.sessionId])
    return null
  }

  /**
   * The host-confirmed archive set as a uSES source. The workspace model
   * caches its snapshot, so the selected array keeps its identity between
   * publishes (what `useSyncExternalStore` requires).
   */
  const subscribeArchives = (listener: () => void): (() => void) => ctx.workspaces.list.subscribe(listener)
  const readArchives = (): readonly SessionId[] => ctx.workspaces.list.getSnapshot().archivedSessionIds

  function useArchivedSessionIds(): readonly SessionId[] {
    return useSyncExternalStore(subscribeArchives, readArchives)
  }

  /** Archive one session; `stopActivity` overrides the host's running-work refusal. */
  const archiveSession = (sessionId: string, stopActivity?: boolean): Promise<void> =>
    ctx.workspaces.archiveSession(sessionId as SessionId, stopActivity === true ? { stopActivity: true } : undefined)
  /** Take one session back out of the archive. */
  const unarchiveSession = (sessionId: string): Promise<void> =>
    ctx.workspaces.unarchiveSession(sessionId as SessionId)

  type WorkspacesProps = PropsRuntime<'sidebar.workspaces'> & PropsLocale<'projects'>
  function RestrictedWorkspacesEntry(props: WorkspacesProps): React.ReactElement | null {
    const state = useIdentity(source)
    // Durable-log titles for cold sessions (stock feed only titles hot ones).
    // Hook order: always called, even when the identity is not a user yet.
    const titles = useColdSessionTitles(state.kind === 'user' ? state.user : undefined, browserDeps)
    // Replacing the stock browser also dropped its row menu, so the view gets
    // the archive set and the two calls the stock menu made.
    const archivedIds = useArchivedSessionIds()
    if (state.kind !== 'user') return null
    return (
      <RestrictedWorkspacesView
        t={props.t}
        wide={props.wide}
        useSessions={(selector) => props.useSessions(selector as never) as never}
        openSession={(sessionId) => ctx.uiWorkspace.openSession(sessionId as SessionId)}
        user={state.user}
        titles={titles}
        archivedIds={archivedIds}
        archiveSession={archiveSession}
        unarchiveSession={unarchiveSession}
      />
    )
  }

  type SettingsProps = PropsRuntime<'sidebar.settings'> & PropsLocale<'projects'>
  function RestrictedSettingsEntry(_props: SettingsProps): React.ReactElement | null {
    return <RestrictedSettingsView />
  }

  /** Blank occupant of the Plugins panel's keyed `main` cell for normal users. */
  type PluginsPanelProps = PropsRuntime<'main'>
  function RestrictedPluginsPanel(_props: PluginsPanelProps): null {
    return null
  }

  type PickerProps = PropsRuntime<'conversation.hero.workspace'> & PropsLocale<'projects'>
  function RestrictedPickerEntry(props: PickerProps): React.ReactElement | null {
    const state = useIdentity(source)
    if (state.kind !== 'user') return null
    return (
      <RestrictedPickerView
        t={props.t}
        open={props.open}
        anchorRef={props.anchorRef}
        selectedId={props.selectedId === undefined ? undefined : String(props.selectedId)}
        onPick={(workspaceId) => props.onPick(workspaceId as never)}
        onClose={props.onClose}
        useWorkspaces={(selector) => props.useWorkspaces(selector as never) as never}
        user={state.user}
      />
    )
  }

  /**
   * Run `register` while the resolved identity is a normal user, and dispose
   * its registration otherwise. `armNavigation` arms the one-shot workspace
   * navigation on entering the user identity (the session guard re-arms it
   * whenever a foreign session is viewed); the terminal shadows skip it, since
   * they add nothing to the tenant's landing.
   */
  function whileUser(register: () => () => void, armNavigation: boolean): () => void {
    let disposeShadow: (() => void) | undefined
    const sync = (state: IdentityState): void => {
      if (state.kind === 'user') {
        if (armNavigation) autoConnectWorkspace(state.user)
        disposeShadow ??= register()
      } else {
        disposeShadow?.()
        disposeShadow = undefined
      }
    }
    sync(source.get())
    const off = source.subscribe(() => sync(source.get()))
    return () => {
      off()
      disposeShadow?.()
      disposeShadow = undefined
    }
  }

  /**
   * {@link whileUser} for a seat declared in the local SlotMap. `onUser`
   * performs the actual register call (typing stays at the call site where the
   * slot key literal drives inference) and returns its disposer.
   */
  function shadowWhenUser(seat: keyof import('@deepseek-ai/dsh-client-ui-slots').SlotMap & string, onUser: () => () => void): void {
    ctx.slots.inject(seat, () => whileUser(onUser, true))
  }

  // Tenant guard over the viewed session (renders nothing, navigates only).
  // Registered unconditionally — the component decides from the identity.
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register(
    { name: 'conversation.session.header.actions', id: 'projects-session-guard', order: 0 },
    ForeignSessionGuard,
  ))

  shadowWhenUser('sidebar.workspaces', () => ctx.slots.register(
    { name: 'sidebar.workspaces', priority: -10, locale: 'projects' },
    RestrictedWorkspacesEntry,
  ))
  shadowWhenUser('sidebar.settings', () => ctx.slots.register(
    { name: 'sidebar.settings', priority: -10, locale: 'projects' },
    RestrictedSettingsEntry,
  ))
  shadowWhenUser('conversation.hero.workspace', () => ctx.slots.register(
    { name: 'conversation.hero.workspace', priority: -10, locale: 'projects' },
    RestrictedPickerEntry,
  ))
  // Defence in depth for the hidden Plugins panel: even reached by another
  // route, its keyed `main` cell renders nothing for a normal user.
  shadowWhenUser('main', () => ctx.slots.register(
    { name: 'main', key: PLUGINS_PANEL_ID, priority: -10 },
    RestrictedPluginsPanel,
  ))

  // The stock right-sidebar terminal is not a tenant surface: the harness
  // documents its host side as allocating "a user shell ... without Agent
  // sandbox or approval restrictions", i.e. a full shell as the DSH process
  // user. Two entry points reach it — the guide card (`…guide.entry`) and the
  // stock `terminal.new` shortcut (Ctrl+`), which opens the pane directly
  // without the card. All three seats are keyed on the terminal tab's provider
  // id, so one lower-priority null occupant wins each cell: the card goes, and
  // the pane body — the only thing that allocates a PTY — renders nothing even
  // when the shortcut opens the tab (the title seat goes too, so nothing reads
  // terminal state that was never initialized).
  //
  // Ceiling: the same 防君子 client boundary as the sibling shadows — a tenant
  // driving the wire RPC by hand still reaches the host service; removing the
  // terminal at the composition level is the deployment-level answer.
  const TERMINAL_TAB_ID = '@deepseek-ai/dsh-client-ui-sidebar-terminal'

  /** Blank occupant of one stock terminal seat. */
  function BlankTerminalSeat(): null {
    return null
  }

  /**
   * {@link shadowWhenUser} for a seat whose declaration lives in a harness
   * package this plugin deliberately does not depend on
   * (`@deepseek-ai/dsh-client-ui-sidebar-right` — a runtime peer of the shell),
   * so the seat name is cast past the local SlotMap. Registering into an
   * undeclared slot throws, and a throw during an identity publish would take
   * the whole client half — login gate included — down with it, so a missing
   * seat simply means there is nothing to hide.
   */
  function shadowTerminalSeat(seat: string): void {
    try {
      ctx.slots.inject(
        seat as never,
        () =>
          whileUser(() => {
            try {
              return ctx.slots.register(
                { name: seat, key: TERMINAL_TAB_ID, priority: -10 } as never,
                BlankTerminalSeat as never,
              )
            } catch {
              return () => {}
            }
          }, false),
      )
    } catch {
      // No right sidebar in this composition: nothing to hide.
    }
  }

  shadowTerminalSeat('sidebar.right.tab.guide.entry')
  shadowTerminalSeat('sidebar.right.pane.tab')
  shadowTerminalSeat('sidebar.right.pane.tab.title')
}
