# Changelog

Notable changes per release. Versions are git tags; install a specific one with
`dsh plugin --profile web add github:linyupark/dsh-multi-tenant#vX.Y.Z`.

## 0.4.2

Tenants get back an affordance, and lose a dangerous one.

### Added

- **Normal users can archive and restore their own sessions.** The restricted
  sidebar is the plugin's own browser view — replacing the stock one is what
  keeps other tenants' workspaces out of it — so the row now carries the action
  the stock row menu used to: 归档 / 取消归档, plus an archived/active filter.
  A session that still has work running is archived only after the browser
  confirms: the host's `workspace/session-active` refusal is answered with a
  stop-and-archive retry.

### Security

- **The New Terminal entry is hidden for normal users.** The terminal allocates
  a user shell on the host *without* Agent sandbox or approval restrictions, so
  its guide card, its tab pane and the `Ctrl+\`` shortcut are all shadowed away
  for tenant identities (admins keep them). This is the same 防君子 client-side
  boundary as the rest of the restricted UI: a tenant driving the wire RPC from
  devtools still reaches the host service — drop the terminal plugin from the
  composition if that matters for your deployment.

### Notes

- 269 unit tests (5 new ones cover the archive flow, including the
  stop-and-archive retry and the declined confirmation).

## 0.4.1

The login link stops dropping visitors onto a plain-HTTP port.

### Fixed

- **The remote gate built every token link as `http://`.** A deployment behind a
  TLS-terminating reverse proxy therefore answered an HTTPS visitor with an
  `http://` login link: a port that is often not listening at all, and on a proxy
  that does answer, an origin the session cookie does not belong to. The scheme
  now comes from `X-Forwarded-Proto`, whitelisted to the two real schemes because
  the value is spliced into an `href`. The refusal page's alternative authorities
  follow the caller's scheme too, so a trusted hostname stays on HTTPS while a LAN
  caller still gets the address that answers. If your proxy does not forward the
  scheme, add `proxy_set_header X-Forwarded-Proto $scheme;`.

### Notes

- 264 unit tests, plus a live end-to-end script (`scripts/verify-live.mjs`, 35
  checks) that now also probes the gate over a forwarded-HTTPS request.

## 0.4.0

Passwords rotate, and the tenant console wears the person glyph it deserved.

### Added

- **Admin password change.** Settings → *Projects & Users* carries a *Change my
  password* block, rendered only for a signed-in admin: it verifies the current
  password, stores the new one, and revokes that account's other live tokens.
  The caller's own session is deliberately kept, so the page survives the change
  it just made. The route behind it (`POST /projects/api/admin/password`)
  changes the **caller's own** account only; a non-admin is refused by the route
  gate before it is reached.

### Changed

- **The roster entry id is now `dsh-mt`**, and the remote startup row is
  `dsh-mt-remote-startup`. Installs key off the package name, so adding or
  removing the plugin is unaffected, but an existing profile patch must rename
  its override row with it: an id-targeted patch that matches nothing is warned
  about and skipped, so a leftover `- id: projects` would silently drop that
  `config` and fall back to the default admin password.
- The settings nav entry now carries a **person glyph** instead of the settings
  gear, which fits what the page is (a tenant console, not settings at large).
  The shell paints that glyph from the section ID alone and only the shipped
  `account` id maps to it, so the section claims that cell, falling back to its
  own id — gear, but alive — if the cell is already taken.

### Notes

- 258 unit tests, plus a live end-to-end script (`scripts/verify-live.mjs`, 34
  checks) that probes the password route with a wrong current password, so it
  never touches the credential the operator signed in with.

## 0.3.0

Workspace links maintain themselves, and tenants can be removed for good.

### Added

- **`dsh web --host 0.0.0.0`** works. Stock DSH refuses the flag outright; the
  bundle now replaces that startup row. Authentication is unchanged and still
  entirely DSH's own launch token — what is new is that a caller who opens the
  page *without* it is shown it, as a clickable link built from the address they
  actually used, instead of a bare `401` naming a URL they cannot see.
  A browser on an authority the deployment does not serve (a DNS name without
  `--trusted-host`) is now told why, instead of loading a shell that would 403
  every API call.
- **Physical deletion.** A user may be deleted once disabled; a project once
  every user under it is disabled. Deleting a user removes their tokens,
  workspace directory and record; deleting a project does that per user, then
  removes the project directory and record. A project directory the operator
  BOUND to an existing path is never deleted — the response says it was kept.
  Removal never follows symlinks, and a workspace is only removable when its
  path is exactly the one derived from its project and name.
- **Automatic workspace sync.** The link set is refreshed at startup for every
  project user, and again on session creation for the user who owns that
  session. Both passes are idempotent. The manual button remains.

### Changed

- The admin console no longer offers **one-shot token handoff**; accounts sign
  in with their password, which the console has covered since it shipped. The
  `POST /projects/api/admin/tokens` route is gone.

### Notes

- 251 unit tests, plus a live end-to-end script (`scripts/verify-live.mjs`, 32
  checks) that now deletes its own fixtures.
- Still best-effort isolation between trusted-ish teammates, not a hard security
  perimeter. See the threat model in the README.
- Ported to DSH `0.2.0-rc.2`; peers are declared at `^0.2.0-rc.2`.

## 0.2.0

- Ported to DSH `0.2.0-rc.2`.
- Renamed the package to `dsh-multi-tenant`.
- Hid the Plugins panel from normal users (it installs bundles and could disable
  this plugin).
- Added a live end-to-end verification script.
- Kept the CSS region ids package-relative so committed artifacts do not embed
  the build machine's directory layout.

## 0.1.0

- First release: project/user dual workspaces with symlink isolation, cwd
  session bucketing, the login gate, the permission lock and prompt guard, and
  the admin console.