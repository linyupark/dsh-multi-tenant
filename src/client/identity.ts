/**
 * The client identity controller: one shared resolution of "who is at this
 * browser" (guard-status probe + stored bearer token + /whoami) that drives
 * every restricted seat. Normal users ('user' role) get the restricted UI;
 * admins, anonymous visitors, and guard-off deployments keep the stock UI.
 *
 * Fail-open by design (same policy as the auth gate): a broken plugin API
 * never degrades the stock client. Re-resolves on authEvents 'changed'
 * (login/logout) so shadow registrations follow the active identity.
 */
import { authEvents, readStoredToken, type ClientDeps, type WhoAmI } from './api.ts'

/** One identity resolution. */
export type IdentityState =
  | { kind: 'resolving' }
  | { kind: 'user'; user: WhoAmI }
  | { kind: 'admin'; user: WhoAmI }
  | { kind: 'anonymous' }
  | { kind: 'guard-off' }

/** Resolve once: guard probe → token presence → whoami role. */
export async function resolveIdentity(deps: ClientDeps): Promise<IdentityState> {
  let guardEnabled = false
  try {
    const res = await deps.fetch('/projects/api/guard-status', { method: 'GET' })
    const json = (await res.json().catch(() => ({}))) as { guardEnabled?: boolean }
    guardEnabled = res.ok && json.guardEnabled === true
  } catch {
    return { kind: 'guard-off' } // probe failed: fail-open
  }
  if (!guardEnabled) return { kind: 'guard-off' }
  if (readStoredToken(deps.storage) === null) return { kind: 'anonymous' }
  try {
    const res = await deps.fetch('/projects/api/whoami', {
      method: 'GET',
      headers: { authorization: `Bearer ${readStoredToken(deps.storage)}` },
    })
    if (!res.ok) return { kind: 'anonymous' } // stale/revoked token: fail-open
    const json = (await res.json()) as { user?: WhoAmI }
    const user = json.user
    if (!user || (user.role !== 'user' && user.role !== 'admin')) return { kind: 'anonymous' }
    return user.role === 'admin' ? { kind: 'admin', user } : { kind: 'user', user }
  } catch {
    return { kind: 'anonymous' }
  }
}

/** Only normal users get the restricted (shadowed) UI. */
export function shouldRestrictUi(state: IdentityState): boolean {
  return state.kind === 'user'
}

/**
 * Watch identity across auth changes. Publishes every resolved state (and
 * 'resolving' immediately); re-resolves whenever authEvents fires. The
 * returned disposer stops listening and freezes publications.
 */
export function watchIdentity(
  deps: ClientDeps,
  publish: (state: IdentityState) => void,
): () => void {
  let disposed = false
  publish({ kind: 'resolving' })
  const rerun = (): void => {
    void resolveIdentity(deps).then((state) => {
      if (!disposed) publish(state)
    })
  }
  rerun()
  const off = authEvents.on('changed', rerun)
  return () => {
    disposed = true
    off()
  }
}
