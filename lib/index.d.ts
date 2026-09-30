import z from "@deepseek-ai/schemastery";
import { Context } from "@deepseek-ai/cordis";
//#region src/index.d.ts
/** Plugin id (matches the cordis.patch.yml row). */
declare const name = "projects";
/** The webserver carries all our routes; settings carries the config UI. */
declare const inject: string[];
/**
 * Profile entry id (the `cordis.patch.yml` row id). 0.2.0 removed the
 * `settingsNamespace` helper: the Settings service keys each form by the
 * plugin's profile entry id, so this is the id, not a namespace object.
 */
declare const PROJECTS_SETTINGS_NAMESPACE = "projects";
/**
 * Storage-domain unit name for the projects/users tables. The harness's
 * `UNIT_NAME_RE` (`/^[a-z][a-z0-9_]*$/`) rejects hyphens, so this is an
 * underscore name; a hyphen made `defineDomain` throw and quietly degraded
 * the store to the JSON fallback.
 */
declare const PROJECTS_DOMAIN_NAME = "projects_users";
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
declare const Config: z<Schemastery.ObjectS<NoInfer<{
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
type Config = ReturnType<typeof Config>;
/**
 * The projects/users domain spec, built through the harness's own
 * `defineDomain`/`domainTable` so an invalid unit name, version or table set
 * fails here (and in the test) instead of silently degrading the store.
 */
declare function buildProjectsDomainSpec(): Promise<unknown>;
/** Wire the plugin: repo, service, routes, guard tap and settings page. */
declare function apply(ctx: Context, config?: Config): void;
//#endregion
export { Config, PROJECTS_DOMAIN_NAME, PROJECTS_SETTINGS_NAMESPACE, apply, buildProjectsDomainSpec, inject, name };