/**
 * Remote-capable replacement for `@deepseek-ai/dsh-web-app/startup`.
 *
 * The stock startup hard-rejects `--host 0.0.0.0` because binding all
 * interfaces would expose remote code execution to the network. This
 * replacement accepts it and provides the same `webStartup` service under the
 * same id, so `webserver`, `web-runtime` and `connection` rows resolve
 * unchanged. The safety argument that motivated the rejection is preserved by
 * `src/remote/gate.ts`, which is what actually decides who may in.
 */
import { Command } from 'commander';
import type { Context } from '@deepseek-ai/cordis';
/** Stable Cordis plugin name. */
export declare const name = "remote-web-startup";
/** Services required before the flags can be resolved. */
export declare const inject: string[];
/** Service provided by this ordinary plugin and injected by flag-configured rows. */
export declare const WEB_STARTUP_SERVICE = "webStartup";
/** The values the web rows read, mirroring the stock startup's shape. */
export interface WebStartupValues {
    openBrowser: boolean;
    host?: string;
    port?: number;
    trustedHosts: string[];
}
/**
 * Validate a `--host` value against the hosts the stock webserver schema
 * accepts. Both literals are already in that union, so this adds no new bind
 * capability on its own — it rejects typos that would otherwise surface as a
 * schema error from the webserver row.
 * @param value - the raw `--host` value.
 * @returns the validated host.
 * @throws when the value is not a supported bind host.
 */
export declare function normalizeBindHost(value: string): string;
/**
 * This app's command: its flags, its description, and its help text.
 * @returns a fresh program, so one process can parse more than once (tests).
 */
export declare function webCommand(): Command;
/**
 * Parse and provide the Web invocation as an ordinary Cordis service. The
 * command's action publishes the flags this invocation named; an unsupported
 * `--host` or a non-numeric `--port` is a usage error, so on rejection (and on
 * `--help`) nothing is provided.
 * @param ctx - plugin context carrying the command line.
 */
export declare function apply(ctx: Context): void;
