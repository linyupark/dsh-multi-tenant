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
import { type ClientDeps, type WhoAmI } from './api.ts';
/** One identity resolution. */
export type IdentityState = {
    kind: 'resolving';
} | {
    kind: 'user';
    user: WhoAmI;
} | {
    kind: 'admin';
    user: WhoAmI;
} | {
    kind: 'anonymous';
} | {
    kind: 'guard-off';
};
/** Resolve once: guard probe → token presence → whoami role. */
export declare function resolveIdentity(deps: ClientDeps): Promise<IdentityState>;
/** Only normal users get the restricted (shadowed) UI. */
export declare function shouldRestrictUi(state: IdentityState): boolean;
/**
 * Watch identity across auth changes. Publishes every resolved state (and
 * 'resolving' immediately); re-resolves whenever authEvents fires. The
 * returned disposer stops listening and freezes publications.
 */
export declare function watchIdentity(deps: ClientDeps, publish: (state: IdentityState) => void): () => void;
