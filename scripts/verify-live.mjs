/**
 * End-to-end verification against a live `dsh web`.
 *
 *   node scripts/verify-live.mjs [origin]
 *
 * Exercises the whole tenant boundary through the real HTTP API: the guard
 * flag, the admin bootstrap, project and user creation (with real workspace
 * paths), one-shot tokens, tenant login, the per-tenant cwd projection, the
 * tenant session list, and the admin-route refusal. It then exercises the
 * remote-access gate the same way a browser meets it: an anonymous navigation
 * must be told the token, an untrusted authority must be told why it cannot
 * work, and neither the gate nor a token page may hand out a cookie.
 *
 * Each run creates its own uniquely named project and user and then physically
 * deletes them again, exercising the delete guards on the way, so it is safe to
 * repeat and leaves no fixtures behind. Exits non-zero on the first failed
 * check.
 */
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { existsSync, lstatSync, readlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const origin = process.argv[2] ?? 'http://127.0.0.1:3080'
const base = `${origin}/projects/api`
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
check('guard flag is a boolean', typeof guard.body?.guardEnabled === 'boolean',
  `guardEnabled=${guard.body?.guardEnabled} (a deployment choice, not asserted)`)

const anon = await get('/whoami')
check('unauthenticated whoami is rejected', anon.status === 401, 'HTTP ' + anon.status)

const ADMIN_USER = process.env.DSH_TENANT_ADMIN_USER ?? 'admin'
const ADMIN_PASSWORD = process.env.DSH_TENANT_ADMIN_PASSWORD ?? 'admin'
const login = await post('/login', { username: ADMIN_USER, password: ADMIN_PASSWORD })
check('admin login', login.status === 200 && login.body?.user?.role === 'admin',
  `HTTP ${login.status} (override with DSH_TENANT_ADMIN_USER / DSH_TENANT_ADMIN_PASSWORD)`)
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

// The password route changes the CALLER's own password, so probing it with a
// wrong current password proves it is wired without touching the live
// credential the operator signed in with.
const passwordGuard = await post('/admin/password', { currentPassword: 'not-the-password', newPassword: 'x' }, admin)
check('admin password route refuses a wrong current password', passwordGuard.status === 403,
  `HTTP ${passwordGuard.status} ${JSON.stringify(passwordGuard.body)}`)

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
  const bobPassword = await post('/admin/password', { currentPassword: 'pw12345', newPassword: 'x' }, bob.body.token)
  check('tenant user cannot reach the password route', bobPassword.status === 403, 'HTTP ' + bobPassword.status)
}

// ---- workspace links and physical deletion ----------------------------------
//
// This script runs on the same host as dsh, so it can touch the real
// directories and assert what the symlink layer actually produced.

const projectWs = created.body?.project?.workspacePath
const userWs = user.body?.user?.workspacePath
writeFileSync(join(projectWs, 'live-check.txt'), 'x')

const synced = await post('/admin/sync', { project: slug, username }, admin)
check('sync links an entry added after user creation',
  Array.isArray(synced.body?.linked) && synced.body.linked.some((l) => l.name === 'live-check.txt'),
  JSON.stringify(synced.body))
check('the link is a symlink into the project',
  lstatSync(join(userWs, 'live-check.txt')).isSymbolicLink()
    && readlinkSync(join(userWs, 'live-check.txt')) === join(projectWs, 'live-check.txt'))

const tooEarly = await post('/admin/delete-user', { username: `${slug}/${username}` }, admin)
check('deleting an active user is refused', tooEarly.status === 409, 'HTTP ' + tooEarly.status)
const projectTooEarly = await post('/admin/delete-project', { project: slug }, admin)
check('deleting a project with an active user is refused', projectTooEarly.status === 409,
  'HTTP ' + projectTooEarly.status)

await post('/admin/disable', { username: `${slug}/${username}` }, admin)

// Delete the USER first, while the project still exists. This is where the
// symlink promise is observable: the workspace is a directory of symlinks into
// the project, so a following removal would empty the project.
const userGone = await post('/admin/delete-user', { username: `${slug}/${username}` }, admin)
check('a disabled user deletes', userGone.status === 200, JSON.stringify(userGone.body))
check('the user workspace is gone', !existsSync(userWs), userWs)
check('deleting the workspace did NOT touch the project it linked into',
  existsSync(join(projectWs, 'live-check.txt')),
  'the project file was removed by following a symlink out of the workspace')
check('the project directory survived the user delete', existsSync(projectWs), projectWs)

const deleted = await post('/admin/delete-project', { project: slug }, admin)
check('the project then deletes with no users left', deleted.status === 200,
  JSON.stringify(deleted.body))
check('the project directory is gone', !existsSync(projectWs), projectWs)

const gone = await post('/login', { username: `${slug}/${username}`, password: 'pw12345' })
check('a deleted user can no longer log in', gone.status === 401, 'HTTP ' + gone.status)

// ---- remote-access gate -----------------------------------------------------
//
// Drive the gate the way a browser does. `Host` is a forbidden Fetch header, so
// these go through node:http where the authority can be set verbatim.
const send = (path, { host, accept = 'text/html', method = 'GET', headers = {} } = {}) =>
  new Promise((resolve, reject) => {
    const url = new URL(origin)
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)
    const req = request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path,
        method,
        headers: { accept, ...(host === undefined ? {} : { host }), ...headers },
      },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => { body += chunk })
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
      },
    )
    req.on('error', reject)
    req.end()
  })

const anonIndex = await send('/')
check('anonymous navigation is refused', anonIndex.status === 401, 'HTTP ' + anonIndex.status)
check('refusal shows the token URL as a link', /href="[^"]*\?token=[A-Za-z0-9_-]+"/.test(anonIndex.body),
  'the gate must render the host token URL, not a bare 401')
check('the token page sets no cookie', anonIndex.headers['set-cookie'] === undefined,
  String(anonIndex.headers['set-cookie'] ?? ''))
check('the token page is not cached', String(anonIndex.headers['cache-control'] ?? '').includes('no-store'),
  String(anonIndex.headers['cache-control'] ?? ''))

// A TLS-terminating proxy states the scheme it served; the link handed back has
// to stay on HTTPS, or the visitor follows it to a port that may not answer.
const proxied = await send('/', { headers: { 'x-forwarded-proto': 'https' } })
check('a proxied HTTPS navigation is answered with an HTTPS link',
  /href="https:\/\/[^"]*\?token=[A-Za-z0-9_-]+"/.test(proxied.body),
  'expected an https token link, got: ' + (proxied.body.match(/href="[^"]*"/) ?? ['no link'])[0])

const anonFetch = await send('/', { accept: 'application/json' })
check('a non-navigation is not given the token page', !anonFetch.body.includes('?token='),
  'a JSON client has no use for an HTML document')

const asset = await send('/assets/definitely-missing.js')
check('static assets are not intercepted by the gate', !asset.body.includes('?token='),
  'assets are public bundles; refusing them would break the page')

// An authority the /api fence refuses must be told so, rather than handed a
// token link that would load a shell whose every API call 403s.
const untrusted = await send('/', { host: `verify-live-not-declared.invalid:${new URL(origin).port || 80}` })
check('an untrusted authority is told why it cannot work',
  untrusted.status === 401 && untrusted.body.includes('该地址不可用'),
  'HTTP ' + untrusted.status + ' — expected the trust-fence diagnostic, not a token link')
check('the diagnostic names the remedy', untrusted.body.includes('--trusted-host'),
  'it must say how to make the authority work')

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)