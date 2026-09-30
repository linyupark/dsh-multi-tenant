import type { Context } from '@deepseek-ai/cordis';
/** Services required by this plugin (slots registry, locale, workspaces feed, navigation). */
export declare const inject: string[];
/** Locale-namespace 'projects' dictionary key type re-export for consumers. */
export type { ProjectsLocaleKey } from './locales.ts';
/**
 * Mount the plugin's browser surfaces.
 * @param ctx - client root context.
 */
export declare function apply(ctx: Context): void;
