import { type ClientDeps } from './api.ts';
import type { ProjectsLocaleKey } from './locales.ts';
/** Translate function for the projects namespace. */
export type TranslateProjects = (key: ProjectsLocaleKey) => string;
/** The phase the parent (identity source) currently shows. */
export type AuthGateMode = 'checking' | 'form' | 'hidden';
/** Props of the testable inner view. */
export interface AuthGateViewProps {
    /** Locale reader (zh/en dictionaries in locales.ts). */
    t: TranslateProjects;
    /** Environment (fetch/storage), injectable for tests. */
    deps: ClientDeps;
    /** Which phase to render (owned by the identity source). */
    mode: AuthGateMode;
}
/** The inner view: render the phase the parent chose. */
export declare function AuthGateView(props: AuthGateViewProps): React.ReactElement | null;
