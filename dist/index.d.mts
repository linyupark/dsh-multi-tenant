import { z } from "schemastery";
import { Context } from "@deepseek-ai/cordis";
//#region src/index.d.ts
/** Plugin id (matches the cordis.patch.yml row). */
declare const name = "projects";
/** The webserver carries all our routes; settings carries the config UI. */
declare const inject: string[];
/** Settings namespace shown in the Web Settings UI. */
declare const PROJECTS_SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
/** Plugin configuration — edited in DSH Settings → dsh-plugin-projects. */
interface Config {
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
declare const Config: z<Config>;
/** Wire the plugin: repo, service, routes, guard tap and settings section. */
declare function apply(ctx: Context, config?: Config): void;
//#endregion
export { Config, PROJECTS_SETTINGS_NAMESPACE, apply, inject, name };