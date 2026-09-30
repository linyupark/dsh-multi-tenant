/**
 * End-to-end verification against a live `dsh web`.
 *
 *   node scripts/verify-live.mjs [origin]
 *
 * Exercises the whole tenant boundary through the real HTTP API: the guard
 * flag, the admin bootstrap, project and user creation (with real workspace
 * paths), one-shot tokens, tenant login, the per-tenant cwd projection, the
 * tenant session list, and the admin-route refusal. Each run creates its own
 * uniquely named project and user, so it is safe to repeat; it never deletes
 * anything. Exits non-zero on the first failed check.
 */
const base = `${process.argv[2] ?? 'http://127.0.0.1:3080'}/projects/api`
let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures += 1
}
const post = async (p, body, token) => {
  const r = await fetch(base + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body ?? {}),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}
const get = async (p, token) => {
  const r = await fetch(base + p, { headers: token ? { authorization: 'Bearer ' + token } : {} })
  return { status: r.status, body: await r.json().catch(() => null) }
}

const guard = await get('/guard-status')
check('guard-status reachable (plugin loaded)', guard.status === 200, JSON.stringify(guard.body))
check('guard is OFF (safe install)', guard.body?.guardEnabled === false)

const anon = await get('/whoami')
check('unauthenticated whoami is rejected', anon.status === 401, 'HTTP ' + anon.status)

const login = await post('/login', { username: 'admin', password: 'admin' })
check('admin bootstrap login', login.status === 200 && login.body?.user?.role === 'admin', 'HTTP ' + login.status)
const admin = login.body?.token

// Unique tenant per run so the checks are idempotent across invocations.
const runId = Date.now().toString(36)
const created = await post('/admin/projects', { name: `Verify ${runId}` }, admin)
check('create project', created.status === 201, JSON.stringify(created.body?.project ?? created.body))
const slug = created.body?.project?.slug ?? `verify-${runId}`
const username = `bob-${runId}`

const user = await post('/admin/users', { project: slug, username, password: 'pw12345' }, admin)
check('create user + workspace', user.status === 201, JSON.stringify(user.body?.user ?? user.body))
check('user workspace is a real path', typeof user.body?.user?.workspacePath === 'string', user.body?.user?.workspacePath)

const overview = await get('/admin/overview', admin)
check('overview lists the project', overview.status === 200 && (overview.body?.projects ?? []).some((p) => p.slug === slug))

const issued = await post('/admin/tokens', { username: `${slug}/${username}` }, admin)
check('issue one-shot token', issued.status === 200 && typeof issued.body?.token === 'string')

const bob = await post('/login', { username: `${slug}/${username}`, password: 'pw12345' })
check('tenant user login', bob.status === 200 && bob.body?.user?.role === 'user', 'HTTP ' + bob.status)

if (bob.body?.token) {
  // The browser half resolves identity from /whoami (the login payload only
  // hands back the token), so that is the projection the cwd guard reads.
  const who = await get('/whoami', bob.body.token)
  check('whoami carries the tenant cwd', typeof who.body?.user?.cwd === 'string', who.body?.user?.cwd)
  check('tenant cwd is their own workspace', who.body?.user?.cwd === bob.body?.user?.workspacePath,
    `${who.body?.user?.cwd} vs ${bob.body?.user?.workspacePath}`)

  const sessions = await get('/my/sessions', bob.body.token)
  check('tenant session list works (no 500)', sessions.status === 200, 'HTTP ' + sessions.status + ' ' + JSON.stringify(sessions.body).slice(0, 120))
  const denied = await get('/admin/overview', bob.body.token)
  check('tenant user is denied admin routes', denied.status === 403, 'HTTP ' + denied.status)
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)