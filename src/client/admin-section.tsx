/**
 * The settings.section page carrying the project/user console. Admins manage
 * projects, one-shot users, one-time tokens and workspace sync here; signed-in
 * non-admins see their identity plus a denial note; anonymous visitors are
 * pointed at the login gate. All forms are uncontrolled (FormData on submit).
 */
import { useEffect, useState, type FormEvent } from 'react'
import {
  ApiError,
  callApi,
  logout,
  readStoredToken,
  whoAmI,
  type ClientDeps,
  type WhoAmI,
} from './api.ts'
import type { ProjectsLocaleKey } from './locales.ts'
import css from './admin-section.module.css'

/** Translate function for the projects namespace. */
export type TranslateProjects = (key: ProjectsLocaleKey) => string

/** A public project row from /admin/overview. */
interface ProjectRow { slug: string; name: string; workspacePath?: string }
/** A public user row from /admin/overview. */
interface UserRow {
  slug: string
  name: string
  projectSlug: string | null
  role: 'admin' | 'user'
  status: 'active' | 'disabled'
  workspacePath: string | null
}

/** Props of the testable inner view. */
export interface AdminSectionViewProps {
  /** Locale reader (zh/en dictionaries in locales.ts). */
  t: TranslateProjects
  /** Close the settings panel (the shell owns the open state). */
  close: () => void
  /** Environment (fetch/storage), injectable for tests. */
  deps: ClientDeps
  /**
   * Host directory picker (the same wire primitive the stock workspace
   * picker drives): resolves the picked absolute path, null on cancel.
   * Absent on hosts without the capability — the browse button hides.
   */
  picker?: { pick(): Promise<string | null> }
}

/** One console message: an error (alert) or a success note (status). */
interface Message { kind: 'error' | 'ok'; text: string }

/** The unambiguous user identifier for admin actions: `project/name` for project users. */
function userRefOf(u: UserRow): string {
  return u.projectSlug ? `${u.projectSlug}/${u.name}` : u.name
}

/** The inner view: identity, denial, or the full admin console. */
export function AdminSectionView(props: AdminSectionViewProps): React.ReactElement | null {
  const t = props.t
  const [user, setUser] = useState<WhoAmI | null>()
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [message, setMessage] = useState<Message | null>(null)
  const [oneTimeToken, setOneTimeToken] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [projectPath, setProjectPath] = useState('')
  const [picking, setPicking] = useState(false)

  useEffect(() => {
    let alive = true
    void whoAmI(props.deps).then(async (identity) => {
      if (!alive) return
      setUser(identity)
      if (identity?.role === 'admin') {
        const overview = await callApi(props.deps.fetch, '/projects/api/admin/overview', {
          token: readStoredToken(props.deps.storage) ?? '',
        }) as { projects?: ProjectRow[]; users?: UserRow[] }
        if (!alive) return
        setProjects(overview.projects ?? [])
        setUsers(overview.users ?? [])
      }
      setLoaded(true)
    })
    return () => { alive = false }
  }, [props.deps])

  if (user === undefined) return null
  if (user === null) {
    return <p className={css.note} role="status">{t('admin.notSignedIn')}</p>
  }

  const token = readStoredToken(props.deps.storage) ?? ''
  const api = (path: string, body: Record<string, unknown>): Promise<unknown> =>
    callApi(props.deps.fetch, path, { method: 'POST', body, token })

  const refresh = async (): Promise<void> => {
    const overview = await callApi(props.deps.fetch, '/projects/api/admin/overview', { token }) as { projects?: ProjectRow[]; users?: UserRow[] }
    setProjects(overview.projects ?? [])
    setUsers(overview.users ?? [])
  }

  const run = (action: () => Promise<void>, okText?: string): void => {
    setMessage(null)
    setOneTimeToken('')
    void action()
      .then(async () => {
        if (okText) setMessage({ kind: 'ok', text: okText })
        await refresh()
      })
      .catch((err: unknown) => {
        setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : String(err) })
      })
  }

  const onCreateProject = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const name = String(new FormData(event.currentTarget).get('project-name') ?? '')
    if (!name) return
    const trimmed = projectPath.trim()
    const body: Record<string, unknown> = { name }
    if (trimmed) body.workspacePath = trimmed
    void (async () => { await api('/projects/api/admin/projects', body) })()
      .then(refresh)
      .catch((err: unknown) => {
        setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : String(err) })
      })
  }

  const onBrowse = (): void => {
    if (!props.picker || picking) return
    setPicking(true)
    setMessage(null)
    void props.picker.pick()
      .then((path) => {
        if (path) setProjectPath(path)
      })
      .catch(() => {
        setMessage({ kind: 'error', text: t('admin.pickFailed') })
      })
      .finally(() => { setPicking(false) })
  }

  const onCreateUser = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const body = {
      project: String(data.get('project') ?? ''),
      username: String(data.get('username') ?? ''),
      password: String(data.get('password') ?? ''),
    }
    if (!body.project || !body.username || !body.password) return
    run(async () => { await api('/projects/api/admin/users', body) })
  }

  const onLogout = (): void => {
    logout(props.deps)
    props.close()
  }

  const header = (
    <header className={css.header}>
      <div>
        <h2 className={css.title}>{t('section.title')}</h2>
        <p className={css.identity}>
          {t('admin.identity')}：<span className={css.slug}>{user.slug}</span>
          （{t(user.role === 'admin' ? 'admin.role.admin' : 'admin.role.user')}）
        </p>
      </div>
      <button type="button" className={css.secondary} onClick={onLogout}>{t('admin.logout')}</button>
    </header>
  )

  if (user.role !== 'admin') {
    return (
      <div className={css.section}>
        {header}
        <p className={css.note} role="status">{t('admin.denied')}</p>
      </div>
    )
  }

  return (
    <div className={css.section}>
      {header}
      {message
        ? <p className={message.kind === 'error' ? css.error : css.ok} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>
        : null}
      {oneTimeToken
        ? <p className={css.ok} role="status">{t('admin.tokenIssued')} <code className={css.token}>{oneTimeToken}</code></p>
        : null}

      <section className={css.block}>
        <h3 className={css.blockTitle}>{t('admin.projects')}</h3>
        {loaded ? (
          <ul className={css.list}>
            {projects.map((p) => (
              <li key={p.slug} className={css.row}>
                <span>{p.name}</span>
                <code className={css.slug}>{p.workspacePath ?? p.slug}</code>
              </li>
            ))}
          </ul>
        ) : <p className={css.note}>{t('admin.loading')}</p>}
        <form className={css.form} onSubmit={onCreateProject}>
          <label className={css.label} htmlFor="projects-admin-project-name">{t('admin.projectName')}</label>
          <input id="projects-admin-project-name" name="project-name" className={css.input} type="text" />
          <label className={css.label} htmlFor="projects-admin-project-path">{t('admin.projectPath')}</label>
          <span className={css.pathRow}>
            <input
              id="projects-admin-project-path"
              name="project-path"
              className={css.input}
              type="text"
              placeholder="/absolute/path"
              value={projectPath}
              onChange={(e) => { setProjectPath(e.target.value) }}
            />
            {props.picker ? (
              <button type="button" className={css.secondary} onClick={onBrowse} disabled={picking}>
                {t('admin.browse')}
              </button>
            ) : null}
          </span>
          <button type="submit" className={css.primary}>{t('admin.createProject')}</button>
        </form>
      </section>

      <section className={css.block}>
        <h3 className={css.blockTitle}>{t('admin.users')}</h3>
        <form className={css.form} onSubmit={onCreateUser}>
          <label className={css.label} htmlFor="projects-admin-user-project">{t('admin.userProject')}</label>
          <select id="projects-admin-user-project" name="project" className={css.input}>
            {projects.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
          </select>
          <label className={css.label} htmlFor="projects-admin-user-name">{t('admin.username')}</label>
          <input id="projects-admin-user-name" name="username" className={css.input} type="text" />
          <label className={css.label} htmlFor="projects-admin-user-password">{t('admin.password')}</label>
          <input id="projects-admin-user-password" name="password" className={css.input} type="password" />
          <button type="submit" className={css.primary}>{t('admin.createUser')}</button>
        </form>
        {loaded ? (
          <ul className={css.list}>
            {users.filter((u) => u.role === 'user').map((u) => (
              <li key={u.slug} className={css.row}>
                <span className={css.userMeta}>
                  {u.name}
                  <span className={css.dim}> · {u.projectSlug ?? '—'} · {t(u.status === 'active' ? 'admin.status.active' : 'admin.status.disabled')}</span>
                </span>
                <span className={css.rowActions}>
                  <button
                    type="button"
                    className={css.secondary}
                    onClick={() => {
                      setMessage(null)
                      setOneTimeToken('')
                      void api('/projects/api/admin/tokens', { username: userRefOf(u) })
                        .then((res) => { setOneTimeToken((res as { token: string }).token) })
                        .catch((err: unknown) => {
                          setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : String(err) })
                        })
                    }}
                  >{t('admin.issueToken')}</button>
                  <button type="button" className={css.secondary} onClick={() => { void run(async () => { await api('/projects/api/admin/disable', { username: userRefOf(u) }) }) }}>{t('admin.disable')}</button>
                  <button type="button" className={css.secondary} onClick={() => { run(async () => { await api('/projects/api/admin/sync', { project: u.projectSlug ?? '', username: u.name }) }, t('admin.syncDone')) }}>{t('admin.sync')}</button>
                </span>
              </li>
            ))}
          </ul>
        ) : <p className={css.note}>{t('admin.loading')}</p>}
      </section>
    </div>
  )
}
