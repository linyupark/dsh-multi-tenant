/**
 * dsh-multi-tenant-projects — browser half.
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
 *  - `conversation.hero.workspace` shadow: the picker offering ONLY the
 *    user's own workspace (no workspace switching).
 *  - composer access-mode chip lock: while a normal user is signed in a body
 *    role flag + injected stylesheet freeze the permission-mode chip at its
 *    pinned value (workspace-write; the host half rejects switches anyway) —
 *    no menu, no chevron; admins/anonymous see the stock chip untouched.
 *
 * Shadows register/unregister dynamically as the resolved identity flips
 * (login → user, logout → reload), each inside its slot's declaration
 * lifecycle via `slots.inject` (declaration-bound teardown runs them).
 */
import { useSyncExternalStore } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the ctx.locale Context merge.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: load the SlotMap declaration merges — ui-layout declares
// 'shell.overlay', ui-settings declares 'settings.section' (with `close`),
// ui-sidebar declares 'sidebar.workspaces' / 'sidebar.settings' /
// 'sidebar.footer.action', ui-conversation declares
// 'conversation.hero.workspace'.
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
  guardCurrentSession,
  useColdSessionTitles,
} from './restricted.tsx'
import { browserDeps, type WhoAmI } from './api.ts'
import { watchIdentity, type IdentityState } from './identity.ts'
import { applyBodyRole, mountPermissionLockStyle } from './perm-lock.ts'
import { zh, en } from './locales.ts'

/** Services required by this plugin (slots registry, locale, sessions.open, workspaces.pickDirectory). */
export const inject = ['slots', 'locale', 'sessions', 'workspaces']

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
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('projects', { zh, en }), 'projects: dictionaries')

  const identity = createIdentitySource()
  ctx.effect(() => identity.stop, 'projects: identity watcher')
  const source = identity.source

  // Access-mode chip lock (normal users): the stylesheet pins the composer
  // chip to its pinned value (host already rejects switches); the body role
  // flag scopes it to the signed-in user only — admins keep the full menu.
  ctx.effect(() => mountPermissionLockStyle(document), 'projects: permission lock style')
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
      pick: (): Promise<string | null> => ctx.workspaces.pickDirectory(),
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
  ctx.slots.inject('settings.section', () => ctx.slots.register(
    {
      name: 'settings.section',
      id: 'projects-admin',
      order: 200,
      locale: 'projects',
      label: () => ctx.locale.bind('projects')('section.title'),
    },
    AdminSectionEntry,
  ))

  // Identity badge beside Settings (renders for signed-in users AND admins —
  // admins otherwise have to dig through Settings for a sign-out).
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
    { name: 'sidebar.footer.action', id: 'projects-user-badge', order: 0, locale: 'projects' },
    UserBadgeEntry,
  ))

  // ---- normal-user shadows (dynamic: register while user, dispose otherwise)

  // The client sessions face. Narrowed explicitly: this monorepo program also
  // loads host-side type declarations that merge a different `sessions`
  // service into the shared cordis Context; the browser runtime's face is the
  // one the loader actually provides.
  const sessionsFace = (ctx as unknown as { sessions: { open(id: string): void } }).sessions

  /** Read-side view of the runtime sessions store (ObservableSnapshot shape). */
  interface SessionsListFace {
    getSnapshot?(): { byId: Record<string, { cwd?: string } | undefined>; current?: string }
    subscribe?(fn: () => void): () => void
  }
  const sessionsList = (sessionsFace as unknown as { list?: SessionsListFace }).list

  /** Clear a current session that is foreign to the signed-in user (once). */
  function guardForeignCurrentSession(user: WhoAmI): void {
    if (!user.cwd) return
    const snapshot = typeof sessionsList?.getSnapshot === 'function' ? sessionsList.getSnapshot() : undefined
    if (!snapshot) return
    guardCurrentSession(
      snapshot,
      user.cwd,
      () => { (sessionsFace as unknown as { clear?(): void }).clear?.() },
    )
  }

  /**
   * Keep guarding while the store mutates: the runtime may restore or set a
   * current session at any tick (wire resync, list refresh) — every change
   * re-checks and clears foreign selections for this user.
   */
  function subscribeForeignGuard(user: WhoAmI): () => void {
    if (typeof sessionsList?.subscribe !== 'function') return () => {}
    return sessionsList.subscribe(() => guardForeignCurrentSession(user))
  }

  // The client workspaces face: the picker feed plus the wire primitives the
  // stock hero uses (connectWorkspace + sessions.open = the official
  // selectWorkspace flow, draft migration aside).
  const workspacesFace = (ctx as unknown as {
    workspaces?: {
      list?: { getSnapshot?(): { items?: Array<{ workspaceId: string; path: string; title: string }> } }
      connectWorkspace?(workspaceId: string): Promise<string>
    }
  }).workspaces

  /** Which user the auto-connect already armed for (one shot per identity). */
  let autoConnectedFor: string | undefined

  /**
   * A project user has exactly one legal workspace — select it for them as
   * soon as their identity resolves, so the hero lands pre-picked instead of
   * offering a one-entry menu. Mirrors the stock hero's onPick flow
   * (connectWorkspace + open) minus the draft migration (nothing is staged
   * yet at identity time).
   */
  function autoConnectWorkspace(user: WhoAmI): void {
    if (!user.cwd) return
    if (autoConnectedFor === user.slug) return
    autoConnectedFor = user.slug
    void (async () => {
      try {
        const snapshot = workspacesFace?.list?.getSnapshot?.()
        const mine = snapshot?.items?.find((w) => w.path === user.cwd)
        if (!mine) return
        // Already sitting in our own bucket (a live session of ours is
        // current) — nothing to connect.
        const currentId = sessionsList?.getSnapshot?.()?.current
        const currentCwd = currentId !== undefined ? sessionsList?.getSnapshot?.()?.byId?.[currentId]?.cwd : undefined
        if (currentCwd === user.cwd) return
        const sessionId = await workspacesFace?.connectWorkspace?.(mine.workspaceId)
        if (sessionId !== undefined) sessionsFace.open(sessionId)
      } catch {
        // Best effort: the restricted picker still offers the one entry.
      }
    })()
  }

  type WorkspacesProps = PropsRuntime<'sidebar.workspaces'> & PropsLocale<'projects'>
  function RestrictedWorkspacesEntry(props: WorkspacesProps): React.ReactElement | null {
    const state = useIdentity(source)
    // Durable-log titles for cold sessions (stock feed only titles hot ones).
    // Hook order: always called, even when the identity is not a user yet.
    const titles = useColdSessionTitles(state.kind === 'user' ? state.user : undefined, browserDeps)
    if (state.kind !== 'user') return null
    return (
      <RestrictedWorkspacesView
        t={props.t}
        wide={props.wide}
        useSessions={(selector) => props.useSessions(selector as never) as never}
        openSession={(sessionId) => sessionsFace.open(sessionId)}
        user={state.user}
        titles={titles}
      />
    )
  }

  type SettingsProps = PropsRuntime<'sidebar.settings'> & PropsLocale<'projects'>
  function RestrictedSettingsEntry(_props: SettingsProps): React.ReactElement | null {
    return <RestrictedSettingsView />
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
   * Register the shadow while the resolved identity is a normal user; dispose
   * otherwise. `onUser` performs the actual register call (typing stays at the
   * call site where the slot key literal drives inference) and returns its
   * disposer.
   */
  function shadowWhenUser(seat: keyof import('@deepseek-ai/dsh-client-ui-slots').SlotMap & string, onUser: () => () => void): void {
    ctx.slots.inject(seat, () => {
      let disposeShadow: (() => void) | undefined
      let disposeGuard: (() => void) | undefined
      const sync = (state: IdentityState): void => {
        if (state.kind === 'user') {
          guardForeignCurrentSession(state.user)
          autoConnectWorkspace(state.user)
          disposeGuard ??= subscribeForeignGuard(state.user)
          disposeShadow ??= onUser()
        } else {
          disposeShadow?.()
          disposeShadow = undefined
          disposeGuard?.()
          disposeGuard = undefined
        }
      }
      sync(source.get())
      const off = source.subscribe(() => sync(source.get()))
      return () => {
        off()
        disposeShadow?.()
        disposeShadow = undefined
        disposeGuard?.()
        disposeGuard = undefined
      }
    })
  }

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
}
