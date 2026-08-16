import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import zRuntime from "schemastery";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import * as nodeFs from "node:fs/promises";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { z as z$1 } from "zod";
//#region src/crypto.ts
/**
* Password hashing (scrypt, random salt) and token minting.
*
* Envelope format: `scrypt$<saltHex>$<hashHex>`. Verification never throws —
* malformed envelopes simply fail closed. Tokens are random 32-byte hex
* strings; only their sha256 fingerprint is persisted.
*/
const KEYLEN = 32;
/** Hash a password into a self-describing scrypt envelope. */
function hashPassword(password) {
	const salt = randomBytes(16);
	const hash = scryptSync(password, salt, KEYLEN);
	return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}
/** Verify a password against an envelope; false for anything malformed. */
function verifyPassword(password, envelope) {
	const parts = envelope.split("$");
	if (parts.length !== 3 || parts[0] !== "scrypt") return false;
	const salt = Buffer.from(parts[1], "hex");
	const expected = Buffer.from(parts[2], "hex");
	if (salt.length === 0 || expected.length !== KEYLEN) return false;
	const actual = scryptSync(password, salt, KEYLEN);
	return timingSafeEqual(actual, expected);
}
/** Mint a fresh 64-hex-char bearer token. */
function newToken() {
	return randomBytes(32).toString("hex");
}
/** sha256 fingerprint of a token — the only form persisted at rest. */
function tokenFingerprint(token) {
	return createHash("sha256").update(token).digest("hex");
}
//#endregion
//#region src/slug.ts
/**
* Deterministic, path-safe slugs for project and user names.
*
* ASCII letters/digits survive lowercased; any other ASCII run collapses to a
* single `-`; non-ASCII codepoints are hex-encoded so CJK names map to a
* stable slug without leaking raw characters into directory names.
*/
const HEX = (cp) => cp.toString(16);
/** Convert an arbitrary display name to a slug usable as a path segment. */
function slug(name) {
	let out = "";
	let dash = false;
	for (const ch of name) {
		const cp = ch.codePointAt(0);
		if (cp >= 97 && cp <= 122 || cp >= 48 && cp <= 57) {
			out += dash ? "-" + ch : ch;
			dash = false;
		} else if (cp >= 65 && cp <= 90) {
			const lower = ch.toLowerCase();
			out += dash ? "-" + lower : lower;
			dash = false;
		} else if (cp > 127) {
			out += dash ? "-" + HEX(cp) : HEX(cp);
			dash = false;
		} else dash = out.length > 0;
	}
	return out.length > 0 ? out : "x";
}
//#endregion
//#region src/paths.ts
/**
* Workspace layout for the project/user dual-workspace scheme:
*
*   <root>/<projectSlug>/            project workspace (the real source)
*   <root>/<projectSlug>-<userSlug>/ user workspace (real dir, entries are
*                                     symlinks back into the project dir)
*/
/** Absolute path of a project workspace. */
function projectWorkspacePath(root, projectName) {
	return resolve(root, slug(projectName));
}
/** Absolute path of a user workspace. */
function userWorkspacePath(root, projectName, userName) {
	return resolve(root, `${slug(projectName)}-${slug(userName)}`);
}
function isSafeSegment(name) {
	return name.length > 0 && name !== "." && name !== ".." && !name.includes("/");
}
/** Compute the user workspace path and its full symlink set. */
function planUserWorkspace(input) {
	const projectWs = projectWorkspacePath(input.root, input.projectName);
	const userWs = userWorkspacePath(input.root, input.projectName, input.userName);
	const reserved = new Set(input.reserved);
	const symlinks = [];
	for (const name of input.projectEntries) {
		if (!isSafeSegment(name)) continue;
		if (reserved.has(name)) continue;
		symlinks.push({
			name,
			linkPath: resolve(userWs, name),
			targetPath: resolve(projectWs, name)
		});
	}
	return {
		projectWorkspacePath: projectWs,
		userWorkspacePath: userWs,
		symlinks
	};
}
//#endregion
//#region src/agents-md.ts
/** Render the per-user AGENTS.md content. */
function renderAgentsMd(input) {
	const rules = [
		"- 只在本目录（current working directory）内工作，不要离开当前目录去读写其他路径。",
		"- 目录中的软链接就是项目文件本身：通过链接修改即修改项目，请像编辑普通文件一样编辑它们。",
		"- 不要使用绝对路径访问本目录之外的任何位置；不要读取或修改同级的其他用户目录。",
		"- 创建新文件时直接在本目录内创建。",
		...input.customRules ?? []
	];
	return [
		`# 工作区守则（项目 ${input.projectName} / 用户 ${input.userName}）`,
		"",
		`你正在为项目「${input.projectName}」的用户「${input.userName}」工作。`,
		"本目录是你的全部工作范围：",
		"",
		...rules,
		""
	].join("\n");
}
//#endregion
//#region src/service.ts
/**
* ProjectsService: the domain core. Pure orchestration over injected ports
* (Repo, FsPort, clock) — no dsh imports, fully unit-testable.
*
* Threat model: 防君子不防小人 (best-effort). Nothing here is a hard boundary;
* the hard outer boundary is the tunnel-level auth in front of dsh.
*/
function publicUser(u) {
	return {
		slug: u.slug,
		name: u.name,
		projectSlug: u.projectSlug,
		role: u.role,
		status: u.status,
		workspacePath: u.workspacePath
	};
}
/** The domain core. */
var ProjectsService = class {
	deps;
	constructor(deps) {
		this.deps = deps;
	}
	/** Seed roles and the optional bootstrap admin. Idempotent. */
	async init() {
		if ((await this.deps.repo.list("roles")).length === 0) {
			await this.deps.repo.put("roles", "admin", {
				code: "admin",
				description: "管理员：可管理项目与用户"
			});
			await this.deps.repo.put("roles", "user", {
				code: "user",
				description: "普通用户：一次性账号，工作区受限（软约束）"
			});
		}
		if ((await this.deps.repo.list("users")).length === 0 && this.deps.adminPassword) await this.deps.repo.put("users", "admin", {
			slug: "admin",
			name: "admin",
			projectSlug: null,
			role: "admin",
			passwordHash: hashPassword(this.deps.adminPassword),
			status: "active",
			workspacePath: null,
			createdAt: this.deps.now()
		});
	}
	/** Create a project and its workspace directory. */
	async createProject(name) {
		const s = slug(name);
		if (await this.deps.repo.get("projects", s)) throw new Error(`项目 ${s} 已存在`);
		const record = {
			slug: s,
			name,
			workspacePath: projectWorkspacePath(this.deps.root, name),
			createdAt: this.deps.now()
		};
		await this.deps.fs.mkdir(record.workspacePath);
		await this.deps.repo.put("projects", s, record);
		return record;
	}
	/** Create a one-shot user with a symlinked workspace + AGENTS.md. */
	async createUser(projectName, userName, password) {
		const projectSlug = slug(projectName);
		const project = await this.deps.repo.get("projects", projectSlug);
		if (!project) throw new Error(`项目 ${projectSlug} 不存在`);
		const userSlug = slug(userName);
		if (await this.deps.repo.get("users", userSlug)) throw new Error(`用户 ${userSlug} 已存在`);
		const entries = await this.deps.fs.readdir(project.workspacePath).catch(() => []);
		const plan = planUserWorkspace({
			root: this.deps.root,
			projectName,
			userName,
			projectEntries: entries,
			reserved: ["AGENTS.md"]
		});
		await this.deps.fs.mkdir(plan.userWorkspacePath);
		for (const link of plan.symlinks) await this.deps.fs.symlink(link.targetPath, link.linkPath);
		await this.deps.fs.writeFile(`${plan.userWorkspacePath}/AGENTS.md`, renderAgentsMd({
			userName,
			projectName,
			customRules: this.deps.agentsRules
		}));
		const record = {
			slug: userSlug,
			name: userName,
			projectSlug,
			role: "user",
			passwordHash: hashPassword(password),
			status: "active",
			workspacePath: plan.userWorkspacePath,
			createdAt: this.deps.now()
		};
		await this.deps.repo.put("users", userSlug, record);
		return record;
	}
	/** Verify credentials and mint a bearer token. */
	async login(username, password) {
		const user = await this.deps.repo.get("users", slug(username));
		if (!user || !verifyPassword(password, user.passwordHash)) throw new Error("用户名或密码错误");
		if (user.status === "disabled") throw new Error("用户已被禁用");
		const token = newToken();
		await this.mint(user.slug, token);
		return {
			token,
			user: publicUser(user)
		};
	}
	/** Mint an extra token for a user (admin handoff). */
	async issueToken(username) {
		const user = await this.deps.repo.get("users", slug(username));
		if (!user) throw new Error(`用户 ${slug(username)} 不存在`);
		const token = newToken();
		await this.mint(user.slug, token);
		return token;
	}
	async mint(userSlug, token) {
		const record = {
			fingerprint: tokenFingerprint(token),
			userSlug,
			createdAt: this.deps.now(),
			expiresAt: this.deps.now() + this.deps.tokenTtlMs,
			revoked: false
		};
		await this.deps.repo.put("tokens", record.fingerprint, record);
	}
	/** Resolve a bearer token to its active user. Throws on any failure. */
	async authenticate(token) {
		const record = await this.deps.repo.get("tokens", tokenFingerprint(token));
		if (!record || record.revoked) throw new Error("token 无效");
		if (record.expiresAt <= this.deps.now()) throw new Error("token 已过期");
		const user = await this.deps.repo.get("users", record.userSlug);
		if (!user) throw new Error("token 指向的用户不存在");
		if (user.status === "disabled") throw new Error("用户已被禁用");
		return user;
	}
	/** Disable a user; their tokens die with them. */
	async disableUser(username) {
		const s = slug(username);
		const user = await this.deps.repo.get("users", s);
		if (!user) throw new Error(`用户 ${s} 不存在`);
		user.status = "disabled";
		await this.deps.repo.put("users", s, user);
	}
	/** List projects (public projections). */
	async listProjects() {
		return (await this.deps.repo.list("projects")).map(([, v]) => {
			const p = v;
			return {
				slug: p.slug,
				name: p.name
			};
		});
	}
	/** List users of one project (or all when projectSlug is null). */
	async listUsers(projectSlug) {
		return (await this.deps.repo.list("users")).map(([, v]) => v).filter((u) => projectSlug === null ? true : u.projectSlug === projectSlug).map(publicUser);
	}
	/** Link project entries created after the user workspace was set up. */
	async syncUserWorkspace(projectName, userName) {
		const project = await this.deps.repo.get("projects", slug(projectName));
		const user = await this.deps.repo.get("users", slug(userName));
		if (!project || !user || !user.workspacePath) throw new Error("项目或用户不存在");
		const entries = await this.deps.fs.readdir(project.workspacePath).catch(() => []);
		const plan = planUserWorkspace({
			root: this.deps.root,
			projectName,
			userName,
			projectEntries: entries,
			reserved: ["AGENTS.md"]
		});
		const linked = [];
		const skippedExisting = [];
		for (const link of plan.symlinks) {
			if (await this.deps.fs.exists(link.linkPath)) {
				skippedExisting.push({ name: link.name });
				continue;
			}
			await this.deps.fs.symlink(link.targetPath, link.linkPath);
			linked.push({ name: link.name });
		}
		return {
			linked,
			skippedExisting
		};
	}
};
//#endregion
//#region src/repo.ts
/**
* Repository port over four logical tables: projects / users / tokens / roles.
*
* Three adapters share the interface: MemoryRepo (tests), JsonFileRepo
* (dependency-free fallback persisted under the harness home) and
* StorageDomainRepo (preferred — wraps a `ctx.storageDomain` handle so the
* records land in the official typed domain storage when the composition
* provides it).
*/
/** JSON-file adapter with atomic tmp+rename writes. */
var JsonFileRepo = class {
	file;
	data = {};
	loaded = false;
	writing = Promise.resolve();
	constructor(file) {
		this.file = file;
	}
	async load() {
		if (this.loaded) return;
		this.loaded = true;
		try {
			const raw = await readFile(this.file, "utf8");
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === "object") this.data = parsed;
		} catch {
			this.data = {};
		}
	}
	persist() {
		this.writing = this.writing.then(async () => {
			await mkdir(dirname(this.file), { recursive: true });
			const tmp = this.file + ".tmp";
			await writeFile(tmp, JSON.stringify(this.data), "utf8");
			await rename(tmp, this.file);
		});
		return this.writing;
	}
	async get(table, key) {
		await this.load();
		return this.data[table]?.[key];
	}
	async put(table, key, value) {
		await this.load();
		const t = this.data[table] ??= {};
		t[key] = value;
		await this.persist();
	}
	async delete(table, key) {
		await this.load();
		const t = this.data[table];
		if (!t || !(key in t)) return false;
		delete t[key];
		await this.persist();
		return true;
	}
	async list(table) {
		await this.load();
		return Object.entries(this.data[table] ?? {});
	}
};
/** Adapter over a `ctx.storageDomain` handle (the official typed storage). */
var StorageDomainRepo = class {
	domain;
	constructor(domain) {
		this.domain = domain;
	}
	table(name) {
		return this.domain.table(name);
	}
	async get(table, key) {
		return this.table(table).get(key);
	}
	async put(table, key, value) {
		await this.table(table).put(key, value);
	}
	async delete(table, key) {
		return this.table(table).delete(key);
	}
	async list(table) {
		return [...this.table(table).entries()];
	}
	close() {
		return this.domain.close();
	}
};
//#endregion
//#region src/fs-port.ts
/**
* Filesystem port: everything the service needs from node:fs, injectable for
* tests. All path arguments are absolute; adapters own safety checks.
*/
/** Real node:fs/promises adapter (mkdir is recursive, exists never throws). */
const NodeFsPort = {
	async mkdir(path) {
		await nodeFs.mkdir(path, { recursive: true });
	},
	readdir(path) {
		return nodeFs.readdir(path);
	},
	symlink(target, path) {
		return nodeFs.symlink(target, path);
	},
	readlink(path) {
		return nodeFs.readlink(path);
	},
	writeFile(path, content) {
		return nodeFs.writeFile(path, content, "utf8");
	},
	readFile(path) {
		return nodeFs.readFile(path, "utf8");
	},
	async exists(path) {
		try {
			await nodeFs.stat(path);
			return true;
		} catch {
			return false;
		}
	}
};
//#endregion
//#region src/http.ts
function json(status, body) {
	return {
		status,
		json: body
	};
}
function fail(status, error) {
	return {
		status,
		json: { error }
	};
}
function str(v) {
	return typeof v === "string" ? v : "";
}
const routes = [
	{
		method: "POST",
		pattern: /^\/login$/,
		async handler(_m, req, deps) {
			const username = str(req.body?.username);
			const password = str(req.body?.password);
			if (!username || !password) return fail(400, "username 与 password 必填");
			try {
				return json(200, await deps.service.login(username, password));
			} catch (e) {
				return fail(401, e.message);
			}
		}
	},
	{
		method: "GET",
		pattern: /^\/whoami$/,
		user: true,
		async handler(_m, _req, _deps, auth) {
			return json(200, { user: {
				slug: auth.slug,
				role: auth.role,
				cwd: auth.cwd
			} });
		}
	},
	{
		method: "GET",
		pattern: /^\/my\/sessions$/,
		user: true,
		async handler(_m, _req, deps, auth) {
			if (!auth.cwd) return fail(400, "管理员没有用户工作区");
			if (!deps.sessionLister) return fail(501, "sessionQuery 不可用");
			return json(200, { sessions: await deps.sessionLister(auth.cwd) });
		}
	},
	{
		method: "GET",
		pattern: /^\/admin\/overview$/,
		admin: true,
		async handler(_m, _req, deps) {
			return json(200, {
				projects: await deps.service.listProjects(),
				users: await deps.service.listUsers(null)
			});
		}
	},
	{
		method: "POST",
		pattern: /^\/admin\/projects$/,
		admin: true,
		async handler(_m, req, deps) {
			const name = str(req.body?.name);
			if (!name) return fail(400, "name 必填");
			try {
				return json(201, { project: await deps.service.createProject(name) });
			} catch (e) {
				return fail(409, e.message);
			}
		}
	},
	{
		method: "POST",
		pattern: /^\/admin\/users$/,
		admin: true,
		async handler(_m, req, deps) {
			const project = str(req.body?.project);
			const username = str(req.body?.username);
			const password = str(req.body?.password);
			if (!project || !username || !password) return fail(400, "project/username/password 必填");
			try {
				const user = await deps.service.createUser(project, username, password);
				return json(201, { user: {
					slug: user.slug,
					name: user.name,
					workspacePath: user.workspacePath
				} });
			} catch (e) {
				return fail(409, e.message);
			}
		}
	},
	{
		method: "POST",
		pattern: /^\/admin\/tokens$/,
		admin: true,
		async handler(_m, req, deps) {
			const username = str(req.body?.username);
			if (!username) return fail(400, "username 必填");
			try {
				return json(200, { token: await deps.service.issueToken(username) });
			} catch (e) {
				return fail(404, e.message);
			}
		}
	},
	{
		method: "POST",
		pattern: /^\/admin\/disable$/,
		admin: true,
		async handler(_m, req, deps) {
			const username = str(req.body?.username);
			if (!username) return fail(400, "username 必填");
			try {
				await deps.service.disableUser(username);
				return json(200, { ok: true });
			} catch (e) {
				return fail(404, e.message);
			}
		}
	},
	{
		method: "POST",
		pattern: /^\/admin\/sync$/,
		admin: true,
		async handler(_m, req, deps) {
			const project = str(req.body?.project);
			const username = str(req.body?.username);
			if (!project || !username) return fail(400, "project/username 必填");
			try {
				return json(200, await deps.service.syncUserWorkspace(project, username));
			} catch (e) {
				return fail(404, e.message);
			}
		}
	}
];
/** Build the pure API dispatcher. */
function createProjectsApi(deps) {
	return async (req) => {
		const route = routes.find((r) => r.pattern.test(req.path));
		if (!route) return fail(404, "not found");
		if (route.method !== req.method) return fail(405, "method not allowed");
		let auth;
		if (route.user || route.admin) {
			if (!req.token) return fail(401, "missing token");
			try {
				const user = await deps.service.authenticate(req.token);
				auth = {
					role: user.role,
					slug: user.slug,
					cwd: user.workspacePath
				};
			} catch (e) {
				return fail(401, e.message);
			}
			if (route.admin && auth.role !== "admin") return fail(403, "需要管理员");
		}
		const m = req.path.match(route.pattern);
		return route.handler(m, req, deps, auth ?? {
			role: "anonymous",
			slug: "",
			cwd: null
		});
	};
}
const GUARD_SNIPPET = "<script src=\"/projects-auth/guard.js\" defer><\/script>";
/** Inject the auth guard script into an index.html body (idempotent). */
function injectGuard(html) {
	if (html.includes(GUARD_SNIPPET)) return html;
	if (html.includes("</head>")) return html.replace("</head>", `${GUARD_SNIPPET}</head>`);
	return GUARD_SNIPPET + html;
}
//#endregion
//#region src/assets.ts
/**
* Static assets served by the plugin: the login page, the admin console and
* the index guard script. Vanilla HTML/JS/CSS, no build step, no deps.
*/
const COMMON_CSS = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; margin: 0; min-height: 100vh;
         display: flex; align-items: center; justify-content: center; background: #0f1117; color: #e6e8ee; }
  .card { background: #171a23; border: 1px solid #262b38; border-radius: 14px; padding: 28px 30px;
          width: min(440px, 92vw); box-shadow: 0 12px 40px rgba(0,0,0,.45); }
  h1 { font-size: 17px; margin: 0 0 4px; }
  p.sub { color: #8b93a7; font-size: 12.5px; margin: 0 0 18px; }
  label { display: block; font-size: 12px; color: #9aa3b8; margin: 12px 0 5px; }
  input, select { width: 100%; padding: 9px 11px; border-radius: 8px; border: 1px solid #2c3242;
          background: #10131b; color: #e6e8ee; font-size: 14px; }
  button { margin-top: 16px; width: 100%; padding: 10px; border: 0; border-radius: 8px; cursor: pointer;
           background: linear-gradient(135deg,#3d7dff,#6a5cff); color: #fff; font-size: 14px; font-weight: 600; }
  button.ghost { background: #22273600; border: 1px solid #333a4d; color: #aab2c7; margin-top: 10px; }
  button:disabled { opacity: .55; cursor: default; }
  .msg { margin-top: 12px; font-size: 12.5px; min-height: 17px; color: #ff7d7d; white-space: pre-wrap; }
  .msg.ok { color: #7ce38b; }
  .row { display: flex; gap: 8px; } .row > * { flex: 1; }
  .pill { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 99px;
          background: #222839; color: #9fb4ff; margin-left: 6px; }
  .wide { width: min(860px, 96vw); }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 8px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #232837; color: #c6ccdc; }
  th { color: #8b93a7; font-weight: 500; }
  .hide { display: none !important; }
  .blk { margin-top: 22px; padding-top: 16px; border-top: 1px dashed #262b38; }
  .token-out { font-family: ui-monospace, monospace; font-size: 11.5px; word-break: break-all;
               background: #10131b; border: 1px solid #2c3242; padding: 8px 10px; border-radius: 8px; margin-top: 8px; }
`;
const API = "/projects/api";
function shell(body, title) {
	return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>${COMMON_CSS}</style></head><body>${body}</body></html>`;
}
/** The verify/login page mounted at /projects-auth. */
const LOGIN_PAGE_HTML = shell(`
<div class="card">
  <h1>DSH Projects <span class="pill">身份验证</span></h1>
  <p class="sub">一次性项目用户登录 · 验证通过后返回工作台</p>
  <label>用户名</label><input id="u" autocomplete="username">
  <label>密码</label><input id="p" type="password" autocomplete="current-password">
  <button id="go">登录</button>
  <div class="msg" id="m"></div>
</div>
<script>
const m = document.getElementById('m')
document.getElementById('go').onclick = async () => {
  m.className = 'msg'; m.textContent = '验证中…'
  try {
    const r = await fetch('${API}/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: u.value.trim(), password: p.value }) })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || '登录失败')
    localStorage.setItem('dshProjToken', j.token)
    localStorage.setItem('dshProjUser', JSON.stringify(j.user))
    m.className = 'msg ok'
    m.textContent = j.user && j.user.workspacePath ? ('欢迎，' + j.user.name + ' · 工作区 ' + j.user.workspacePath) : ('欢迎，' + j.user.name)
    setTimeout(() => location.replace('/'), 700)
  } catch (e) { m.textContent = String(e.message || e) }
}
p.addEventListener('keydown', e => { if (e.key === 'Enter') go.click() })
<\/script>`, "登录 · DSH Projects");
/** The admin console mounted at /projects-admin. */
const ADMIN_PAGE_HTML = shell(`
<div class="card wide">
  <h1>DSH Projects <span class="pill">管理台</span></h1>
  <p class="sub">项目 / 一次性用户 / 令牌管理。配置项在 DSH 设置 → dsh-plugin-projects。</p>

  <div id="loginBlk">
    <label>管理员用户名</label><input id="u" value="admin">
    <label>密码</label><input id="p" type="password">
    <button id="go">进入管理台</button>
    <div class="msg" id="m"></div>
  </div>

  <div id="main" class="hide">
    <div class="blk">
      <b>新建项目</b>（创建 <code>&lt;root&gt;/&lt;slug&gt;</code> 工作区目录）
      <div class="row" style="margin-top:8px">
        <div><label>项目名</label><input id="np" placeholder="例如 app"></div>
        <div style="display:flex;align-items:flex-end"><button id="cp" style="margin-top:0;min-width:110px">创建项目</button></div>
      </div>
    </div>

    <div class="blk">
      <b>新建一次性用户</b>（自动建用户工作区 + 软链接 + AGENTS.md）
      <div class="row" style="margin-top:8px">
        <div><label>所属项目</label><select id="up"></select></div>
        <div><label>用户名</label><input id="un" placeholder="例如 bob"></div>
        <div><label>初始密码</label><input id="pw" placeholder="一次性密码"></div>
      </div>
      <button id="cu">创建用户</button>
    </div>

    <div class="blk">
      <b>令牌 / 禁用 / 同步</b>
      <div class="row" style="margin-top:8px">
        <div><label>用户名</label><input id="tn" placeholder="slug"></div>
        <div style="display:flex;align-items:flex-end;gap:8px">
          <button id="mt" style="margin-top:0">补发令牌</button>
          <button id="du" class="ghost" style="margin-top:0">禁用</button>
        </div>
      </div>
      <div class="row" style="margin-top:8px">
        <div><label>项目</label><input id="sp" placeholder="slug"></div>
        <div><label>用户</label><input id="su" placeholder="slug"></div>
        <div style="display:flex;align-items:flex-end"><button id="sy" class="ghost" style="margin-top:0">同步软链接</button></div>
      </div>
      <div class="token-out hide" id="tok"></div>
    </div>

    <div class="blk"><b>总览</b><div id="ov"></div></div>
    <button class="ghost" id="out">退出</button>
  </div>
</div>
<script>
const $ = id => document.getElementById(id)
const m = $('m')
let T = localStorage.getItem('dshProjAdminToken') || localStorage.getItem('dshProjToken')
async function api(path, body) {
  const r = await fetch('${API}' + path, { method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + T },
    body: body ? JSON.stringify(body) : undefined })
  const j = await r.json().catch(() => ({}))
  if (r.status === 401) throw new Error('未登录或令牌失效')
  if (!r.ok) throw new Error(j.error || r.status)
  return j
}
async function enter() {
  try { const w = await api('/whoami'); if (w.user.role !== 'admin') throw new Error('需要管理员账号'); show() }
  catch (e) { m.className = 'msg'; m.textContent = String(e.message || e) }
}
async function show() {
  $('loginBlk').classList.add('hide'); $('main').classList.remove('hide')
  const ov = await api('/admin/overview')
  $('up').innerHTML = ov.projects.map(p => '<option value="' + p.slug + '">' + p.name + '</option>').join('') || '<option value="">（先创建项目）</option>'
  let h = '<table><tr><th>项目</th><th>slug</th></tr>' + ov.projects.map(p => '<tr><td>' + p.name + '</td><td>' + p.slug + '</td></tr>').join('') + '</table>'
  h += '<table style="margin-top:14px"><tr><th>用户</th><th>slug</th><th>角色</th><th>状态</th><th>工作区</th></tr>'
    + ov.users.map(u => '<tr><td>' + u.name + '</td><td>' + u.slug + '</td><td>' + u.role + '</td><td>' + u.status + '</td><td>' + (u.workspacePath || '—') + '</td></tr>').join('') + '</table>'
  $('ov').innerHTML = h
}
$('go').onclick = async () => {
  try {
    const r = await fetch('${API}/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: $('u').value.trim(), password: $('p').value }) })
    const j = await r.json(); if (!r.ok) throw new Error(j.error || '登录失败')
    T = j.token; localStorage.setItem('dshProjAdminToken', T)
    if (j.user.role !== 'admin') throw new Error('该账号不是管理员')
    show()
  } catch (e) { m.className = 'msg'; m.textContent = String(e.message || e) }
}
const act = async (fn) => { try { await fn(); await show() } catch (e) { m.className = 'msg'; m.textContent = String(e.message || e); setTimeout(() => m.textContent = '', 4000) } }
$('cp').onclick = () => act(async () => { await api('/admin/projects', { name: $('np').value.trim() }); $('np').value = '' })
$('cu').onclick = () => act(async () => { await api('/admin/users', { project: $('up').value, username: $('un').value.trim(), password: $('pw').value }); $('un').value = ''; $('pw').value = '' })
$('mt').onclick = () => act(async () => { const j = await api('/admin/tokens', { username: $('tn').value.trim() }); const t = $('tok'); t.classList.remove('hide'); t.textContent = j.token })
$('du').onclick = () => act(async () => { await api('/admin/disable', { username: $('tn').value.trim() }) })
$('sy').onclick = () => act(async () => { const j = await api('/admin/sync', { project: $('sp').value.trim(), username: $('su').value.trim() }); const t = $('tok'); t.classList.remove('hide'); t.textContent = '新链接: ' + (j.linked || []).map(l => l.name).join(', ') + (j.skippedExisting && j.skippedExisting.length ? '（已存在跳过: ' + j.skippedExisting.map(l => l.name).join(', ') + '）' : '') })
$('out').onclick = () => { localStorage.removeItem('dshProjAdminToken'); location.reload() }
if (T) enter()
<\/script>`, "管理台 · DSH Projects");
/** The guard script injected into the stock index.html (fail-open by design). */
const GUARD_JS = `(function () {
  function redirect() { location.replace('/projects-auth') }
  fetch('/projects/api/guard-status').then(function (r) { return r.json() }).then(function (s) {
    if (!s || !s.guardEnabled) return
    var t = null
    try { t = localStorage.getItem('dshProjToken') || localStorage.getItem('dshProjAdminToken') } catch (e) { return }
    if (!t) return redirect()
    fetch('/projects/api/whoami', { headers: { authorization: 'Bearer ' + t } })
      .then(function (r) { if (r.status === 401) redirect() })
      .catch(function () {})
  }).catch(function () {})
})()
`;
//#endregion
//#region src/records.ts
/**
* Domain record schemas (zod). One source of truth: the same schemas validate
* storage-domain records and give TS types via `z.infer`.
*/
const ProjectRecord = z$1.object({
	slug: z$1.string(),
	name: z$1.string(),
	workspacePath: z$1.string(),
	createdAt: z$1.number()
});
const UserRecord = z$1.object({
	slug: z$1.string(),
	name: z$1.string(),
	/** Owning project slug; null for the bootstrap admin. */
	projectSlug: z$1.string().nullable(),
	role: z$1.enum(["admin", "user"]),
	passwordHash: z$1.string(),
	status: z$1.enum(["active", "disabled"]),
	/** User workspace absolute path; null for admins. */
	workspacePath: z$1.string().nullable(),
	createdAt: z$1.number()
});
const TokenRecord = z$1.object({
	/** sha256 fingerprint of the bearer token — the only persisted form. */
	fingerprint: z$1.string(),
	userSlug: z$1.string(),
	createdAt: z$1.number(),
	expiresAt: z$1.number(),
	revoked: z$1.boolean()
});
const RoleRecord = z$1.object({
	code: z$1.enum(["admin", "user"]),
	description: z$1.string()
});
//#endregion
//#region src/index.ts
/** Plugin id (matches the cordis.patch.yml row). */
const name = "projects";
/** The webserver carries all our routes; settings carries the config UI. */
const inject = ["webServer"];
/** Settings namespace shown in the Web Settings UI. */
const PROJECTS_SETTINGS_NAMESPACE = settingsNamespace("dsh-plugin-projects");
/** Runtime schema for {@link Config}. */
const Config = zRuntime.object({
	workspaceRoot: zRuntime.string().default(join(homedir(), ".dsh", "projects-ws")),
	adminPassword: zRuntime.string().default("admin"),
	tokenTtlHours: zRuntime.number().default(72),
	guardEnabled: zRuntime.boolean().default(true),
	agentsRules: zRuntime.array(zRuntime.string())
});
/** Prefer the official typed domain storage; fall back to a JSON file. */
async function openRepo(ctx) {
	const fallback = () => new JsonFileRepo(join(homedir(), ".dsh", "dsh-plugin-projects", "state.json"));
	try {
		const domainModule = await import("@deepseek-ai/dsh-storage-domain");
		const storageDomain = ctx.storageDomain;
		if (!storageDomain || typeof storageDomain.open !== "function") return fallback();
		const spec = domainModule.defineDomain({
			name: "projects-users",
			version: 1,
			tables: {
				projects: domainModule.domainTable(ProjectRecord),
				users: domainModule.domainTable(UserRecord),
				tokens: domainModule.domainTable(TokenRecord),
				roles: domainModule.domainTable(RoleRecord)
			}
		});
		const domain = await storageDomain.open(spec);
		ctx.effect(() => void domain.close());
		ctx.logger.info("projects: 使用 storageDomain 存储（单元 projects-users）");
		return new StorageDomainRepo(domain);
	} catch (error) {
		ctx.logger.warn("projects: storageDomain 不可用，回退 JSON 存储（%s）", String(error));
		return fallback();
	}
}
/** Wire the plugin: repo, service, routes, guard tap and settings section. */
function apply(ctx, config = Config({})) {
	let current = () => config;
	let service;
	ctx.effect(() => {
		(async () => {
			service = new ProjectsService({
				repo: await openRepo(ctx),
				fs: NodeFsPort,
				now: () => Date.now(),
				root: resolve(current().workspaceRoot),
				tokenTtlMs: current().tokenTtlHours * 36e5,
				adminPassword: current().adminPassword,
				agentsRules: current().agentsRules
			});
			await service.init();
			ctx.logger.info("projects: 就绪（root=%s，guard=%s）", resolve(current().workspaceRoot), current().guardEnabled);
		})();
	});
	const readBody = (req) => new Promise((resolveBody) => {
		const r = req;
		const chunks = [];
		r.on("data", (c) => chunks.push(c));
		r.on("end", () => {
			try {
				const raw = Buffer.concat(chunks).toString("utf8");
				resolveBody(raw ? JSON.parse(raw) : {});
			} catch {
				resolveBody({});
			}
		});
	});
	const writeJson = (res, response) => {
		res.writeHead(response.status, { "content-type": "application/json; charset=utf-8" });
		res.end(JSON.stringify(response.json ?? {}));
	};
	const tokenOf = (header) => {
		if (!header?.startsWith("Bearer ")) return void 0;
		const t = header.slice(7).trim();
		return t.length > 0 ? t : void 0;
	};
	ctx.webServer.register({
		kind: "prefix",
		path: "/projects/api",
		handler: async (req, res) => {
			if (!service) {
				writeJson(res, {
					status: 503,
					json: { error: "初始化中，请稍后重试" }
				});
				return;
			}
			const lister = ctx.sessionQuery;
			const api = createProjectsApi({
				service,
				sessionLister: lister ? async (cwd) => {
					return (await lister.filterSessions([{
						kind: "cwd",
						values: [cwd]
					}])).map((r) => ({
						id: r.id,
						live: r.live,
						persisted: r.persisted,
						title: r.header?.title
					}));
				} : void 0
			});
			const path = new URL(req.url ?? "/", "http://local").pathname.replace(/^\/projects\/api/, "") || "/";
			const request = {
				method: req.method ?? "GET",
				path,
				body: req.method === "POST" ? await readBody(req) : void 0,
				token: tokenOf(req.headers.authorization)
			};
			if (request.path === "/guard-status") {
				writeJson(res, {
					status: 200,
					json: { guardEnabled: current().guardEnabled }
				});
				return;
			}
			writeJson(res, await api(request));
		}
	});
	ctx.webServer.register({
		kind: "prefix",
		path: "/projects-auth",
		handler: (req, res) => {
			if (req.url === "/projects-auth/guard.js") {
				res.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
				res.end(GUARD_JS);
				return;
			}
			res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
			res.end(LOGIN_PAGE_HTML);
		}
	});
	ctx.webServer.register({
		kind: "exact",
		path: "/projects-admin",
		handler: (_req, res) => {
			res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
			res.end(ADMIN_PAGE_HTML);
		}
	});
	ctx.webServer.tapIndex((html) => current().guardEnabled ? injectGuard(html) : html);
	installSettingsSection(ctx, PROJECTS_SETTINGS_NAMESPACE, Config, config, {
		setSource(next) {
			current = next;
		},
		onChange() {}
	});
}
//#endregion
export { Config, PROJECTS_SETTINGS_NAMESPACE, apply, inject, name };
