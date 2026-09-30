# dsh-multi-tenant-projects

**[简体中文](README.zh-CN.md)** | English

Multi-tenant "Projects & Users" for a single [DeepSeek Harness (DSH)](https://github.com/topics/dsh-plugin) instance: bind real workspace directories to *projects*, hand out per-user symlinked workspaces inside each project, and gate the Web UI behind password login — so several people can share one DSH deployment without seeing each other's sessions or files.

> **Threat model — read this first.** This plugin is a *soft* boundary, not a hard security perimeter. The cwd filter is a query projection, browser tokens can be forged by a technical user, and the agent-layer isolation is prompt-level. For anything exposed to the public internet, put a real boundary (reverse-proxy auth, ngrok basic auth, VPN…) in front of DSH and treat this plugin as convenience isolation between *trusted-ish* teammates.

## Features

- **Projects** bound to real directories (auto-created, or bind an existing workspace path via the host-native directory picker).
- **One-shot users** per project with password login; Bearer tokens with sha256 fingerprints, TTL, and instant invalidation when a user is disabled.
- **Same-name users across projects** — storage key is `<project>/<user>`; log in as `project/user` when a bare name is ambiguous.
- **Per-user workspace**: a real directory whose entries are symlinks to the project's files; new project entries can be re-synced (`admin/sync`).
- **Login gate**: a full-frame login card while the guard is armed and no valid token is stored (fails open if the plugin API itself is broken).
- **Restricted UI for normal users**: sidebar shows only their own cwd-bucketed sessions (with durable titles — cold sessions no longer fall back to the directory name), settings entry and workspace switcher are shadowed away, the hero picker offers only their own workspace, auto-connected on login.
- **Permission lock**: every normal-user session is pinned to **workspace-write** and `/permission` switching is refused; the composer access-mode chip is frozen at *Workspace Write* (admins keep the full menu).
- **System-prompt guard, two layers**: a host-injected `受限会话守则` section in the system prompt itself (never disclose anything outside the user's workspace, never run boundary-probing commands, refuse cross-boundary requests even when asked) plus a per-workspace `AGENTS.md` baseline that is auto-refreshed on sync.
- **Admin console** in Settings → *Projects & Users*: create/list projects and users, disable users, one-shot token handoff, directory binding, sync links.
- **Sign-out badge** in the sidebar footer for both admins and users.

## Install

**Compatibility.** This tree is ported to **DSH `0.2.0-rc.2`**. It declares its
`@deepseek-ai/dsh*` peers at `^0.2.0-rc.2`, so the plugin manager's admission gate refuses
any other runtime line instead of loading code written against a different API.

The repo ships pre-built artifacts (`lib/`), so a local install needs no build:

```bash
dsh plugin --profile web add /absolute/path/to/dsh-multi-tenant-projects
```

`dsh` links the dependency and appends the bundle to `dsh.profile.bundles`. The host half is
a Node module and loads on the next `dsh web` start; the client half's `lib/client.js` is
hot-swapped by `dsh-client-hmr` (500 ms stat-poll) without a restart.

Confirm the layer composed, then restart and probe the API:

```bash
dsh --profile web --dump-config | grep -A4 'dsh-multi-tenant-projects'
curl http://127.0.0.1:3080/projects/api/guard-status   # {"guardEnabled":false}
```

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
  name: "dsh-multi-tenant-projects"
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

## Development

```bash
npm test        # vitest, 151 tests (node + jsdom)
npm run build   # tsdown + tsc build outputs
node scripts/verify-live.mjs   # end-to-end checks against a running `dsh web`
```

Layout: `src/` host half (service, HTTP API, nested plugins) + client half (`src/client/`, React slots).

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
- prompt-level agent isolation is a soft constraint;
- single-admin model; no token-revocation UI (disabling a user invalidates all their tokens);
- 0.2.0 has no veto for a permission-mode switch, so the lock is re-assertion plus a shadowed
  `/permission` command, not an interceptor — `/permission` refuses, but a switch made through another
  path is only pinned back at `session/created`;
- host-half edits need a `dsh web` restart; client-half rebuilds hot-swap without one.

## License

MIT
