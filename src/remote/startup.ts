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
import { Command } from 'commander'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'
import type { Context } from '@deepseek-ai/cordis'

/** Stable Cordis plugin name. */
export const name = 'remote-web-startup'

/** Services required before the flags can be resolved. */
export const inject = ['cmdlineArgs']

/** Service provided by this ordinary plugin and injected by flag-configured rows. */
export const WEB_STARTUP_SERVICE = 'webStartup'

/** The values the web rows read, mirroring the stock startup's shape. */
export interface WebStartupValues {
  openBrowser: boolean
  host?: string
  port?: number
  trustedHosts: string[]
}

/** Hosts the stock webserver `host` schema accepts. */
const BIND_HOSTS = new Set(['127.0.0.1', '0.0.0.0'])

/**
 * Validate a `--host` value against the hosts the stock webserver schema
 * accepts. Both literals are already in that union, so this adds no new bind
 * capability on its own — it rejects typos that would otherwise surface as a
 * schema error from the webserver row.
 * @param value - the raw `--host` value.
 * @returns the validated host.
 * @throws when the value is not a supported bind host.
 */
export function normalizeBindHost(value: string): string {
  if (!BIND_HOSTS.has(value)) {
    throw new Error(
      `unsupported bind host ${JSON.stringify(value)}; expected ${[...BIND_HOSTS].join(' or ')}`,
    )
  }
  return value
}

/**
 * This app's command: its flags, its description, and its help text.
 * @returns a fresh program, so one process can parse more than once (tests).
 */
export function webCommand(): Command {
  return new Command()
    .name('dsh --profile web')
    .description('Serve the DeepSeek Harness browser UI.')
    .helpOption('-h, --help', 'show this help')
    .option('--host <host>', 'bind host; 0.0.0.0 exposes the UI to the network and requires a tenant login')
    .option('--no-open', 'do not open the Web UI in the default browser')
    .option('--port <port>', 'listen port; pass 0 to let the OS pick a free one')
    .option('--trusted-host <authority...>', 'extra authority the /api browser-trust fence accepts (host or host:port; repeatable)')
    .addHelpText('after', `
Examples:
  dsh --profile web                          serve on the composed host and port
  dsh --profile web --no-open                serve without opening a browser
  dsh --profile web --port 8080              serve on another port
  dsh --profile web --host 0.0.0.0           serve on all IPv4 interfaces (remote clients must sign in)
`)
}

/**
 * Parse and provide the Web invocation as an ordinary Cordis service. The
 * command's action publishes the flags this invocation named; an unsupported
 * `--host` or a non-numeric `--port` is a usage error, so on rejection (and on
 * `--help`) nothing is provided.
 * @param ctx - plugin context carrying the command line.
 */
export function apply(ctx: Context): void {
  const program = webCommand()
  program.action(() => {
    const options = program.opts<{
      host?: string
      port?: string
      open?: boolean
      trustedHost?: string[]
    }>()
    if (options.port !== undefined && !/^\d+$/.test(options.port)) {
      program.error(`error: --port must be a number, got ${JSON.stringify(options.port)}`)
    }
    let host: string | undefined
    if (options.host !== undefined) {
      try {
        host = normalizeBindHost(options.host)
      } catch (error) {
        program.error(`error: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    ctx.provide(WEB_STARTUP_SERVICE, {
      openBrowser: options.open ?? true,
      ...host !== undefined && { host },
      ...options.port !== undefined && { port: Number(options.port) },
      trustedHosts: options.trustedHost ?? [],
    } satisfies WebStartupValues)
  })
  parseCmdline(ctx, program)
}
