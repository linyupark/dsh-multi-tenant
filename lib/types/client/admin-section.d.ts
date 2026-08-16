import { type ClientDeps } from './api.ts';
import type { ProjectsLocaleKey } from './locales.ts';
/** Translate function for the projects namespace. */
export type TranslateProjects = (key: ProjectsLocaleKey) => string;
/** Props of the testable inner view. */
export interface AdminSectionViewProps {
    /** Locale reader (zh/en dictionaries in locales.ts). */
    t: TranslateProjects;
    /** Close the settings panel (the shell owns the open state). */
    close: () => void;
    /** Environment (fetch/storage), injectable for tests. */
    deps: ClientDeps;
    /**
     * Host directory picker (the same wire primitive the stock workspace
     * picker drives): resolves the picked absolute path, null on cancel.
     * Absent on hosts without the capability — the browse button hides.
     */
    picker?: {
        pick(): Promise<string | null>;
    };
}
/** The inner view: identity, denial, or the full admin console. */
export declare function AdminSectionView(props: AdminSectionViewProps): React.ReactElement | null;
