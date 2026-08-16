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
import z from 'schemastery';
/** Plugin id (matches the cordis.patch.yml row). */
export declare const name = "projects";
/** The webserver carries all our routes; settings carries the config UI. */
export declare const inject: string[];
/** Settings namespace shown in the Web Settings UI. */
export declare const PROJECTS_SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
/** Plugin configuration — edited in DSH Settings → dsh-multi-tenant-projects. */
export interface Config {
    /** Root holding every project/user workspace. */
    workspaceRoot: string;
    /** Bootstrap admin password, applied only when the user store is empty. */
    adminPassword: string;
    /** Bearer token lifetime in hours. */
    tokenTtlHours: number;
    /** Redirect unauthenticated browsers from the stock UI to the login page. */
    guardEnabled: boolean;
    /** Extra AGENTS.md rules appended for every user workspace. */
    agentsRules: string[];
}
/** Runtime schema for {@link Config}. */
export declare const Config: z<Config>;
/** Wire the plugin: repo, service, routes, guard tap and settings section. */
export declare function apply(ctx: Context, config?: Config): void;
