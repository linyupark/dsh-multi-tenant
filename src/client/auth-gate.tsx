/**
 * The shell.overlay auth gate, CONTROLLED by the shared identity source:
 * the parent decides the phase, the gate only renders it.
 *
 *  - 'checking': a full-frame veil while the identity resolves. This is what
 *    keeps the stock UI (workspace list, sessions) from flashing through on
 *    first paint — the veil covers everything until the resolved identity
 *    says otherwise, and shadows register synchronously before the veil
 *    lifts for a signed-in normal user.
 *  - 'form': the login card. A successful submit stores the token and fires
 *    authEvents; the identity source re-resolves and the parent flips the
 *    mode (the gate never self-unmounts).
 *  - 'hidden': nothing (signed-in or guard-off).
 *
 * Uncontrolled form — values are read through FormData at submit time.
 */
import { useState, type FormEvent } from 'react'
import { ApiError, login, type ClientDeps } from './api.ts'
import type { ProjectsLocaleKey } from './locales.ts'
import css from './auth-gate.module.css'

/** Translate function for the projects namespace. */
export type TranslateProjects = (key: ProjectsLocaleKey) => string

/** The phase the parent (identity source) currently shows. */
export type AuthGateMode = 'checking' | 'form' | 'hidden'

/** Props of the testable inner view. */
export interface AuthGateViewProps {
  /** Locale reader (zh/en dictionaries in locales.ts). */
  t: TranslateProjects
  /** Environment (fetch/storage), injectable for tests. */
  deps: ClientDeps
  /** Which phase to render (owned by the identity source). */
  mode: AuthGateMode
}

/** The inner view: render the phase the parent chose. */
export function AuthGateView(props: AuthGateViewProps): React.ReactElement | null {
  const t = props.t
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (props.mode === 'hidden') return null

  if (props.mode === 'checking') {
    return (
      <div className={css.veil}>
        <p className={css.checking} role="status" aria-label={t('gate.checking')}>{t('gate.checking')}</p>
      </div>
    )
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (busy) return
    const data = new FormData(event.currentTarget)
    const username = String(data.get('username') ?? '')
    const password = String(data.get('password') ?? '')
    setBusy(true)
    setError('')
    void login(props.deps, username, password)
      .then(() => {
        // Token stored + authEvents fired; the identity source flips the mode.
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : String(err))
      })
      .finally(() => { setBusy(false) })
  }

  return (
    <div className={css.veil}>
      <form
        className={css.card}
        aria-label={t('gate.title')}
        onSubmit={onSubmit}
      >
        <h1 className={css.title}>{t('gate.title')}</h1>
        <p className={css.subtitle}>{t('gate.subtitle')}</p>
        <label className={css.label} htmlFor="projects-gate-username">{t('gate.username')}</label>
        <input
          id="projects-gate-username"
          name="username"
          className={css.input}
          type="text"
          autoComplete="username"
        />
        <label className={css.label} htmlFor="projects-gate-password">{t('gate.password')}</label>
        <input
          id="projects-gate-password"
          name="password"
          className={css.input}
          type="password"
          autoComplete="current-password"
        />
        {error ? <p className={css.error} role="status">{error}</p> : null}
        <button className={css.submit} type="submit" disabled={busy}>
          {t(busy ? 'gate.signingIn' : 'gate.submit')}
        </button>
      </form>
    </div>
  )
}
