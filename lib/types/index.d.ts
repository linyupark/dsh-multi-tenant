/**
 * dsh-multi-tenant-projects — host plugin.
 *
 * Project-scoped one-shot users on a single DSH instance:
 *  - project workspace  <root>/<projectSlug>          (the real source)
 *  - user workspace     <root>/<projectSlug>-<user>   (real dir, entries are
 *    symlinks back into the project, plus a per-user AGENTS.md that DSH
 *    auto-injects as the soft constraint)
 *  - cwd session bucketing (filterSessions kind:'cwd') and per-user session
 *    listing through the same mechanism
 *  - token auth (scrypt + sha256 fingerprints) with a JSON API under
 *    /projects/api; the browser half (src/client/) mounts the login gate on
 *    `shell.overlay` and the admin console on `settings.section`
 *
 * Threat model: 防君子不防小人 (best effort). The hard boundary stays at the
 * tunnel/reverse-proxy layer in front of dsh; nothing inside this plugin is
 * a hard security boundary.
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Plugin id (matches the cordis.patch.yml row). */
export declare const name = "projects";
/** The webserver carries all our routes; settings carries the config UI. */
export declare const inject: string[];
/**
 * Profile entry id (the `cordis.patch.yml` row id). 0.2.0 removed the
 * `settingsNamespace` helper: the Settings service keys each form by the
 * plugin's profile entry id, so this is the id, not a namespace object.
 */
export declare const PROJECTS_SETTINGS_NAMESPACE = "projects";
/**
 * Storage-domain unit name for the projects/users tables. The harness's
 * `UNIT_NAME_RE` (`/^[a-z][a-z0-9_]*$/`) rejects hyphens, so this is an
 * underscore name; a hyphen made `defineDomain` throw and quietly degraded
 * the store to the JSON fallback.
 */
export declare const PROJECTS_DOMAIN_NAME = "projects_users";
/**
 * Plugin configuration.
 *
 * In 0.2.0 the schema below *is* the settings schema — there is nothing to
 * register. Ordinary fields are deployment configuration and changing one
 * remounts this plugin (the Loader's ordinary update path), so they take
 * effect on re-apply. `guardEnabled` is the one live-tunable field: it is
 * `.volatile()`, read per request, and exposed to configuration clients as a
 * stable reference.
 */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    /** Root holding every project/user workspace. */
    workspaceRoot: z<string, string, "defined">;
    /** Bootstrap admin password, applied only when the user store is empty. */
    adminPassword: z<string, string, "defined">;
    /** Bearer token lifetime in hours. */
    tokenTtlHours: z<number, number, "defined">;
    /** Redirect unauthenticated browsers to the login card; read live. */
    guardEnabled: z<boolean, boolean, "volatile-defined">;
    /** Extra AGENTS.md rules appended for every user workspace. */
    agentsRules: z<string[], string[], "plain">;
}>>, Schemastery.ObjectT<NoInfer<{
    /** Root holding every project/user workspace. */
    workspaceRoot: z<string, string, "defined">;
    /** Bootstrap admin password, applied only when the user store is empty. */
    adminPassword: z<string, string, "defined">;
    /** Bearer token lifetime in hours. */
    tokenTtlHours: z<number, number, "defined">;
    /** Redirect unauthenticated browsers to the login card; read live. */
    guardEnabled: z<boolean, boolean, "volatile-defined">;
    /** Extra AGENTS.md rules appended for every user workspace. */
    agentsRules: z<string[], string[], "plain">;
}>>, "plain">;
/** The validated configuration {@link Config} produces. */
export type Config = ReturnType<typeof Config>;
/**
 * The projects/users domain spec, built through the harness's own
 * `defineDomain`/`domainTable` so an invalid unit name, version or table set
 * fails here (and in the test) instead of silently degrading the store.
 */
export declare function buildProjectsDomainSpec(): Promise<unknown>;
/** Wire the plugin: repo, service, routes, guard tap and settings page. */
export declare function apply(ctx: Context, config?: Config): void;
