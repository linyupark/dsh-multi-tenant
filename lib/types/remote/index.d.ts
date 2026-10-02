/**
 * Remote-access entry: the host half that arms the gate.
 *
 * Registered as a nested plugin of `dsh-multi-tenant` so it mounts with the
 * webserver and the connection service whose token URL it renders.
 */
import type { Context } from '@deepseek-ai/cordis';
/** Stable Cordis plugin name (matches the nested plugin in src/index.ts). */
export declare const name = "projects-remote";
/** Services the gate arms against. */
export declare const inject: string[];
/**
 * Arm the gate.
 * @param ctx - host context carrying `webServer` and `connection`.
 */
export declare function apply(ctx: Context): void;
