/**
 * Stock surfaces a normal user must not reach.
 *
 * The sidebar builds its global panel buttons from the `sidebar.panellist`
 * ledger: one button per registered panel id, with the glyph filled by the
 * lowest-priority entry for that cell. That projection cannot drop a button —
 * shadowing the entry only blanks its glyph and falls the label back to the
 * raw id — so the Plugins panel is hidden by stylesheet instead, scoped to the
 * signed-in normal user.
 *
 * The Plugins panel is the surface that matters here: it installs and enables
 * bundles, and can disable this plugin itself. The stock client ships exactly
 * zh/en, so the button is anchored by its localized label the same way the
 * permission chip is anchored by its prefix. The panel's keyed `main` cell is
 * shadowed as well, so reaching it by another route renders nothing.
 *
 * Do NOT shadow the `sidebar.panellist` cell with the same id. The sidebar
 * resolves a button's label as `resolveSlotLabel(options.label) ?? id`, so a
 * shadow without a label would rename the button to the raw id `plugins` —
 * and these selectors would stop matching it.
 */
/** The Plugins panel's label across the stock client locales. */
export declare const PLUGINS_PANEL_LABELS: readonly string[];
/**
 * The Plugins panel's id: the `sidebar.panellist` list id and the `main`
 * keyed cell the plugin manager occupies.
 */
export declare const PLUGINS_PANEL_ID = "plugins";
/** id of the injected <style> element (idempotent mounting). */
export declare const RESTRICTED_SURFACE_STYLE_ID = "projects-restricted-surface";
/**
 * The hiding stylesheet. One COMPLETE rule per locale label — a comma-joined
 * selector would drop the body scope from every segment but the first — and
 * `!important` so the hide wins regardless of stock style injection order.
 */
export declare function restrictedSurfaceCss(): string;
/** Inject the stylesheet once per document; the disposer removes it. */
export declare function mountRestrictedSurfaceStyle(doc: Pick<Document, 'head' | 'querySelector' | 'createElement'>): () => void;
