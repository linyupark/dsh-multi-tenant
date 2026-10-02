# Changelog

Notable changes per release. Versions are git tags; install a specific one with
`dsh plugin --profile web add github:linyupark/dsh-multi-tenant#vX.Y.Z`.

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