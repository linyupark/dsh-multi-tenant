# dsh-plugin-projects

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

**One-liner** (recommended) — the published repo ships pre-built artifacts (`lib/`, `dist/`) and only pure-JS runtime deps, so no local build is needed and your Node version doesn't matter beyond what DSH itself requires:

```bash
dsh plugin --profile web add github:king-bcolor/dsh-plugin-projects
```

Restart DSH (`dsh web`) and look for `projects: 就绪（root=…, guard=true）` in the log. To pin a release, append a tag: `github:king-bcolor/dsh-plugin-projects#v0.1.0`.

Updating later: re-run the same command (or `pnpm update dsh-plugin-projects` in `~/.dsh/profiles/web`), then restart.

<details>
<summary>From a local checkout (development)</summary>

```bash
git clone https://github.com/king-bcolor/dsh-plugin-projects.git
cd dsh-plugin-projects
npm install && npm run build && npm test

# link the working tree into your DSH web profile (edits + rebuild need a dsh restart)
dsh plugin --profile web add link:$(pwd)
```

</details>

The plugin also ships a Settings page (**Settings → dsh-plugin-projects**) with its configuration:

| Key | Default | Meaning |
|---|---|---|
| `adminPassword` | `admin` | Bootstrap admin password, seeded only when the user store is empty |
| `guardEnabled` | `true` | Arm the login gate |
| `agentsRules` | `[]` | Extra rules appended to every user workspace's `AGENTS.md` |

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
npm test        # vitest, 152 tests (node + jsdom)
npm run build   # tsdown + tsc build outputs
```

Layout: `src/` host half (service, HTTP API, nested plugins) + client half (`src/client/`, React slots); `doc/` holds the full Chinese design docs.

## Known limitations

- cwd filtering is a projection, not an enforcement point — a determined user can bypass the front-end guard;
- prompt-level agent isolation is a soft constraint;
- single-admin model; no token-revocation UI (disabling a user invalidates all their tokens);
- changes to the client half need a `dsh web` restart to reach the browser.

## License

MIT
