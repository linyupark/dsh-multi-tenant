# dsh-multi-tenant

**[简体中文](README.zh-CN.md)** | English

Multi-tenant "Projects & Users" for a single [DeepSeek Harness (DSH)](https://github.com/topics/dsh-plugin) instance: bind real workspace directories to *projects*, hand out per-user symlinked workspaces inside each project, and gate the Web UI behind password login — so several people can share one DSH deployment without seeing each other's sessions or files.

> **Threat model — read this first.** This plugin is a *soft* boundary, not a hard security perimeter. The cwd filter is a query projection, browser tokens can be forged by a technical user, and the agent-layer isolation is prompt-level. For anything exposed to the public internet, put a real boundary (reverse-proxy auth, ngrok basic auth, VPN…) in front of DSH and treat this plugin as convenience isolation between *trusted-ish* teammates.

## Features

- **Projects** bound to real directories (auto-created, or bind an existing workspace path via the host-native directory picker).
- **One-shot users** per project with password login; Bearer tokens with sha256 fingerprints, TTL, and instant invalidation when a user is disabled.
- **Same-name users across projects** — storage key is `<project>/<user>`; log in as `project/user` when a bare name is ambiguous.
- **Per-user workspace**: a real directory whose entries are symlinks to the project's files. The link set is refreshed automatically — at startup and whenever a user opens a session — so a project entry added later shows up without anyone clicking anything.
- **Login gate**: a full-frame login card while the guard is armed and no valid token is stored (fails open if the plugin API itself is broken).
- **LAN serving**: `dsh web --host 0.0.0.0` works (stock DSH hard-refuses it). Authentication stays the host's own launch token — but a caller who opens the page without it is *shown* it, as a clickable link built from the address they actually used.
- **Restricted UI for normal users**: sidebar shows only their own cwd-bucketed sessions (with durable titles — cold sessions no longer fall back to the directory name), settings entry and workspace switcher are shadowed away, the hero picker offers only their own workspace, auto-connected on login. The sidebar's **Plugins** panel button is hidden too — it installs bundles and could disable this plugin — and that panel's `main` cell renders nothing.
- **Permission lock**: every normal-user session is pinned to **workspace-write** and `/permission` switching is refused; the composer access-mode chip is frozen at *Workspace Write* (admins keep the full menu).
- **System-prompt guard, two layers**: a host-injected `受限会话守则` section in the system prompt itself (never disclose anything outside the user's workspace, never run boundary-probing commands, refuse cross-boundary requests even when asked) plus a per-workspace `AGENTS.md` baseline that is auto-refreshed on sync.
- **Admin console** in Settings → *Projects & Users*: create/list projects and users, disable users, bind a project to an existing directory, sync links on demand, and **physically delete** a disabled user or a fully-disabled project (records, tokens and directories).
- **Sign-out badge** in the sidebar footer for both admins and users.

## Install

**Current version: `0.3.0`** — see [CHANGELOG.md](./CHANGELOG.md) for what changed,
and install a specific release by tag:

```bash
dsh plugin --profile web add github:linyupark/dsh-multi-tenant#v0.3.0
```

Without a tag, GitHub installs the tip of `main`, so the version you get is
whatever `package.json` reports at that moment; pinning a tag makes the install
reproducible and tells you exactly what you are running.

**Compatibility.** This tree is ported to **DSH `0.2.0-rc.2`**. It declares its
`@deepseek-ai/dsh*` peers at `^0.2.0-rc.2`, so the plugin manager's admission gate refuses
any other runtime line instead of loading code written against a different API.

The repo ships pre-built artifacts (`lib/`), so installing needs no build:

```bash
dsh plugin --profile web add github:linyupark/dsh-multi-tenant
```

<details>
<summary>From a local checkout (development)</summary>

```bash
dsh plugin --profile web add /absolute/path/to/dsh-multi-tenant
```
</details>

`dsh` links the dependency and appends the bundle to `dsh.profile.bundles`. The host half is
a Node module and loads on the next `dsh web` start; the client half's `lib/client.js` is
hot-swapped by `dsh-client-hmr` (500 ms stat-poll) without a restart.

Confirm the layer composed, then probe the API:

```bash
dsh --profile web --dump-config | grep -A4 'dsh-multi-tenant'
curl http://127.0.0.1:3080/projects/api/guard-status   # {"guardEnabled":false}
```

> Changing the **package name** (as opposed to its version) needs a `dsh web` restart:
> `dsh-client-modules` caches package metadata per Loader specifier for the process
> lifetime, so the boot graph keeps the old row id until then and the client half cannot
> mount.

<details>
<summary>Building from source</summary>

```bash
npm install && npm run build && npm test
```
</details>

### Configuration

0.2.0 derives the Settings form from the plugin's own `Config` schema, so there is no
settings-section registration any more. Exactly one field is `.volatile()` — live-tunable
and read per request. The rest are ordinary deployment configuration; changing one remounts
the plugin, so it takes effect on re-apply.

| Key | Kind | Default | Meaning |
|---|---|---|---|
| `guardEnabled` | volatile (live) | `true` | Arm the login gate; `/projects/api/guard-status` reads it per request |
| `workspaceRoot` | ordinary | `~/.dsh/projects-ws` | Root holding every project/user workspace |
| `adminPassword` | ordinary | `admin` | Bootstrap admin password, seeded only while the user store is empty |
| `tokenTtlHours` | ordinary | `72` | Bearer-token lifetime |
| `agentsRules` | ordinary | `[]` | Extra rules appended to every user workspace's `AGENTS.md` |

Set the ordinary fields in the profile patch (`~/.dsh/profiles/web/cordis.patch.yml`). A patch
**replaces the whole `config`**, so restate every key you keep:

```yaml
- id: projects
  name: "dsh-multi-tenant"
  config:
    guardEnabled: true
    workspaceRoot: /srv/dsh-workspaces
    adminPassword: change-me-first
```

> **Install the gate off, arm it deliberately.** A live GUI whose `guardEnabled` flips to
> `true` shows the login card on its next load. Change `adminPassword` first — the bootstrap
> admin is `admin` / `admin` otherwise.

## Quick start

### 1. Sign in as admin

Open the DSH Web UI. The login gate asks for credentials — the bootstrap admin is `admin` / the `adminPassword` you configured (default `admin`; change it).

### 2. Create a project and bind a workspace

Settings → **Projects & Users**:

- **Project name** — slugified (`My App` → `my-app`).
- **Workspace path** (optional) — leave empty to auto-create `<DSH home>/projects-ws/<project>`, or click **Browse…** to bind an existing directory with the host-native picker (manual absolute-path input works on browse-only hosts).

### 3. Create users under the project

Still in the console: pick the project, choose a **user name** and a **password**, submit. Behind the scenes each user gets:

- a real workspace `…/projects-ws/<project>-<user>/` whose entries are symlinks to the project workspace's files;
- a freshly rendered `AGENTS.md` with the workspace guard rules;
- credentials usable at the login gate (`project/user` or the bare name).

### 4. Same-name users across projects

Usernames are unique *within* a project, so `alpha/alice` and `beta/alice` can coexist. Login resolution:

- A **bare name** works while it is unique across all projects.
- As soon as two projects own the same name, use the **`project/user`** form (`alpha/alice`); the bare name is rejected with a disambiguation hint. The admin console's user actions always carry the composite key.

### 5. Admin vs normal user — what's different

| Surface | Admin | Normal user |
|---|---|---|
| Login | `admin` (bootstrap) or Settings sign-in | `project/user` + password |
| Sidebar | All workspaces & sessions | **Only their own workspace's sessions** (cwd-bucketed), durable titles |
| Workspace switcher / hero picker | Full stock picker | Shadowed — the one legal workspace is **auto-selected** on login |
| Settings | Full stock settings + *Projects & Users* console | Settings entry hidden |
| Permission mode | Full menu (`/permission`, composer chip) | **Pinned to workspace-write**; chip frozen at *Workspace Write*; switching refused |
| Agent instructions | Stock | System-prompt guard section + per-workspace `AGENTS.md` boundary rules |
| Sidebar footer | Sign-out badge | Identity badge + sign-out (clears token, hard reload) |
| API surface | `/projects/api/admin/*` | `/projects/api/my/sessions` etc. (token-scoped) |

### Removing things for good

Disabling stays the reversible stage; deletion is the irreversible one, and it is
only reachable from the disabled state:

| Action | Gate | Removes |
|---|---|---|
| Delete user | the user must be **disabled** | their tokens, their workspace directory, the record |
| Delete project | **every** user under it must be disabled | those users (as above), then the project directory and record |

Two things it deliberately will not do:

- **A bound project directory is never deleted.** If you pointed a project at an
existing path, deleting the project removes the records and the users' workspaces but
leaves that directory alone; the result says so in `keptDirectory`. That directory is
your repository, not something this plugin created.
- **The admin account is never deletable**, disabled or not.

Removal never follows symlinks, so deleting a user workspace cannot take the project
with it. That property only exists on a real filesystem, so it is asserted there:
`test/delete-real-fs.test.ts` uses a real temp directory and the real `NodeFsPort`.

## Serving on the LAN — `--host 0.0.0.0`

Stock DSH hard-refuses `--host 0.0.0.0`: every interface means remote code execution
on the network, and it declines to serve it at all. This plugin replaces that startup
(`cordis.patch.yml` disables the stock `web-startup` row) and accepts the flag.

```bash
dsh web --host 0.0.0.0 --port 3080 --no-open
```

Authentication is **unchanged and still entirely the host's** — the launch token
printed at startup. What this plugin adds is the missing half of the experience: a
caller who opens the page without that token is *shown* it.

| Caller | What happens |
|---|---|
| Any browser opening `/` with no token | A page showing the token URL as a clickable link (a `401` body) |
| Clicking that link | The host exchanges the token for its session cookie, as usual — the SPA loads |
| Anyone using the URL printed at startup | Unchanged |
| A browser on an authority the deployment does not serve | A page saying so, with links to the authorities that *do* work |

The link is built from **the authority the visitor actually used**, so someone
reaching `http://192.168.1.50:3080/` is handed a link on that host, not the loopback
one from the terminal.

### Hostnames need `--trusted-host`

DSH's `/api` fence accepts loopback and the authorities the deployment *declares*.
Under `--host 0.0.0.0` it derives the machine's **LAN IP literals** automatically —
but never a DNS name. So reaching the instance as `http://dsh-box.local:3080/` would
load the shell and then `403` every single API call, with nothing on screen to explain
it. Rather than hand out a token link that leads there, the gate detects that refusal
and says so, offering the addresses that work:

```
dsh web --host 0.0.0.0 --trusted-host dsh-box.local
```

Add one `--trusted-host` per name you reach it by (repeatable; a bare name matches any
port). This is the host's own fence, unchanged — the plugin only reports it honestly.

Why this shape:

- **Nothing is issued or signed here.** The page renders the host's own
  `connection.authenticatedUrl`, so DSH stays the only issuer of the credential and
  the only thing that has to be understood on upgrade.
- **The gate is not on the accept path.** It only decides what an *unauthenticated*
  caller sees. Requests carrying a token, or already holding the host's cookie, are
  delegated untouched so the host's own fences still make every access decision.
- **Static assets are never intercepted** — they are public bundles, and refusing
  them would break the very page an authorized caller is loading.

> **This is a LAN trust decision, not an auth system.** The token is printed to the
> terminal and is now also served to anyone who opens the page, so treat the bind as
> "everyone on this network may use this instance". Put a real boundary (VPN,
> reverse-proxy auth) in front for anything beyond a trusted LAN. The tenant boundary
> described at the top of this file is separate, and unchanged: once you are in, the
> normal-user restrictions still apply.
>
> **Reverse proxy.** Forward the real `Host` header, and list the public name in
> `--trusted-host`. If the proxy rewrites `Host` to `127.0.0.1`, the host's own fence
> will not recognize the request.
>
> **Path-mounted deployments.** The link is an origin, so a deployment served under a
> path prefix (`https://host/dsh/`) is not supported by this link.


## Development

```bash
npm test        # vitest, 251 tests (node + jsdom)
npm run build   # tsdown + tsc build outputs
node scripts/verify-live.mjs   # end-to-end checks against a running `dsh web`
```

Layout: `src/` host half (service, HTTP API, nested plugins), `src/remote/` (LAN bind
gate + startup replacement), client half (`src/client/`, React slots).

## Port notes — DSH 0.2.0-rc.2

This tree was ported from the `0.1.0-rc.6` line. What actually changed:

**Manifest.** `peerDependencies` raised to `^0.2.0-rc.2`; the dead
`@deepseek-ai/dsh-client-runtime` peer and `dsh.client.inject` entry dropped (`dsh.client.inject`
is prefetch metadata only — a name that never registers is silently ignored). The client build's
externals list was corrected to the platform's real nine-entry module baseline.

**Host half.** `installSettingsSection` / `settingsNamespace` no longer exist in
`@deepseek-ai/dsh-settings`; the plugin's own Schemastery `Config` is now the settings schema, and
`ctx.settings.configure({ auto: false })` records that this plugin ships its own page. `schemastery`
became `@deepseek-ai/schemastery` (the fork that has `.volatile()`).

**Client half.** Navigation moved out of the data services: `ctx.sessions.open` / `ctx.sessions.clear`
/ `ctx.workspaces.connectWorkspace` / `ctx.workspaces.pickDirectory` are gone, replaced by the single
`ctx.uiWorkspace` service. `ClientContext` from `dsh-client-runtime/client` became `@deepseek-ai/cordis`'s
`Context`. The slot layer needed no changes — every key and owner prop shape is unchanged.

**Three bugs the live run exposed**, all fixed here:

1. **Storage silently degraded to the JSON fallback.** The storage-domain unit was named
   `projects-users`, but the harness validates a domain name against `/^[a-z][a-z0-9_]*$/` — hyphens
   are rejected, so `defineDomain` threw and the boot path swallowed it into `JsonFileRepo`. Renamed to
   `projects_users`; `test/domain-spec.test.ts` now builds the spec through the real `defineDomain` so
   an invalid name fails the suite instead of the store.
2. **The `/projects/api` route leaked across every recomposition.** `webServer.register` returns a plain
   remover and binds nothing to the calling fiber; the disposer was discarded, so a reloaded plugin hit
   `duplicate prefix route` and the old handler (whose child context was already disposed) kept serving
   requests. Now registered through `ctx.effect`, like the command shadow and the prompt section.
3. **A long-lived closure read a disposable child context.** The session lister called
   `sctx.sessionQuery` per request through the `projects.sessions` child fiber, which throws
   `cannot get required service "sessionQuery" in inactive context` once that child is torn down. It now
   captures the service once and fails closed to an empty list.

## Known limitations

- cwd filtering is a projection, not an enforcement point — a determined user can bypass the front-end guard;
- the Plugins panel is *hidden* from normal users, not closed to them: the browser carries the
  operator's session, so a technical user can still call the plugin-manager Remote methods directly.
  Restricting a surface is not authorizing it — the real boundary stays in front of DSH;
- prompt-level agent isolation is a soft constraint;
- single-admin model; no per-token revocation UI (disabling a user invalidates all their tokens at once);
- project deletion refuses a directory the operator bound to an existing path (by design — see above);
- 0.2.0 has no veto for a permission-mode switch, so the lock is re-assertion plus a shadowed
  `/permission` command, not an interceptor — `/permission` refuses, but a switch made through another
  path is only pinned back at `session/created`;
- host-half edits need a `dsh web` restart; client-half rebuilds hot-swap without one.

## License

MIT
