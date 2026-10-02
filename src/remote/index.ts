/**
 * Remote-access entry: the host half that arms the gate.
 *
 * Registered as a nested plugin of `dsh-multi-tenant` so it mounts with the
 * webserver and the connection service whose token URL it renders.
 */
import type { Context } from '@deepseek-ai/cordis'
import { apply as armGate } from './gate.ts'

/** Stable Cordis plugin name (matches the nested plugin in src/index.ts). */
export const name = 'projects-remote'

/** Services the gate arms against. */
export const inject = ['webServer', 'connection']

/**
 * Arm the gate.
 * @param ctx - host context carrying `webServer` and `connection`.
 */
export function apply(ctx: Context): void {
  armGate(ctx)
}
