window.__ModuleLoader__.load({
	id: "dsh-plugin-projects",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/api.ts
		/** Error carrying the HTTP status and the server-provided message. */
		var ApiError = class extends Error {
			status;
			constructor(status, message) {
				super(message);
				this.status = status;
				this.name = "ApiError";
			}
		};
		/** localStorage key holding the bearer token. */
		const TOKEN_KEY = "dsh-projects-token";
		/** One API call: JSON in, JSON out, non-2xx throws {@link ApiError}. */
		async function callApi(fetchLike, path, opts = {}) {
			const headers = {};
			let body;
			if (opts.body !== void 0) {
				headers["content-type"] = "application/json";
				body = JSON.stringify(opts.body);
			}
			if (opts.token) headers.authorization = `Bearer ${opts.token}`;
			const res = await fetchLike(path, {
				method: opts.method ?? "GET",
				headers,
				body
			});
			const json = await res.json().catch(() => ({}));
			if (!res.ok) throw new ApiError(res.status, typeof json.error === "string" ? json.error : `HTTP ${res.status}`);
			return json;
		}
		/** Read the stored bearer token, or null. */
		function readStoredToken(storage) {
			return storage.getItem(TOKEN_KEY);
		}
		/** Persist the bearer token. */
		function writeStoredToken(storage, token) {
			storage.setItem(TOKEN_KEY, token);
		}
		/** Drop the stored bearer token (logout). */
		function clearStoredToken(storage) {
			storage.removeItem(TOKEN_KEY);
		}
		/** The browser environment (swappable in tests). */
		const browserDeps = {
			fetch: (input, init) => globalThis.fetch(input, init),
			storage: globalThis.localStorage,
			reload: () => globalThis.location?.reload()
		};
		/** Fill in absent project fields from older responses (fail-soft nulls). */
		function normalizeWhoAmI(user) {
			if (!user) return null;
			return {
				slug: user.slug,
				role: user.role,
				cwd: user.cwd ?? null,
				projectSlug: user.projectSlug ?? null,
				projectName: user.projectName ?? null
			};
		}
		/** Resolve the current user through the stored token; null when absent. */
		async function whoAmI(deps) {
			const token = readStoredToken(deps.storage);
			if (!token) return null;
			try {
				return normalizeWhoAmI((await callApi(deps.fetch, "/projects/api/whoami", { token })).user);
			} catch {
				return null;
			}
		}
		/** Login with credentials, persist the minted token, return the user. */
		async function login(deps, username, password) {
			const res = await callApi(deps.fetch, "/projects/api/login", {
				method: "POST",
				body: {
					username,
					password
				}
			});
			writeStoredToken(deps.storage, res.token);
			authEvents.emit("changed");
			return res.user;
		}
		/** Drop the token, notify listeners, and reload so the gate re-arms. */
		function logout(deps) {
			clearStoredToken(deps.storage);
			authEvents.emit("changed");
			deps.reload();
		}
		/** Auth state change notifications shared by the gate, badge and console. */
		var AuthEventBus = class {
			target = typeof EventTarget !== "undefined" ? new EventTarget() : void 0;
			handlers = /* @__PURE__ */ new Set();
			/** Subscribe to 'changed'; returns the unsubscribe function. */
			on(event, handler) {
				const target = this.target;
				if (target) {
					target.addEventListener(event, handler);
					return () => target.removeEventListener(event, handler);
				}
				this.handlers.add(handler);
				return () => this.handlers.delete(handler);
			}
			/** Fire a 'changed' notification. */
			emit(event) {
				if (this.target) this.target.dispatchEvent(new Event(event));
				else for (const h of [...this.handlers]) h();
			}
		};
		const authEvents = new AuthEventBus();
		//#endregion
		//#region \0dsh-css:/home/zjh/store/dsh-plugin/dsh-plugin-projects/src/client/auth-gate.module.css.mjs
		const css$2 = "._7C7Hwq_veil{pointer-events:auto;background:var(--dsw-alias-bg-layer-3);justify-content:center;align-items:center;padding:24px;display:flex;position:fixed;inset:0}._7C7Hwq_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);border-radius:10px;flex-direction:column;gap:6px;width:min(320px,100%);padding:24px;display:flex}._7C7Hwq_title{color:var(--dsw-alias-label-primary);margin:0 0 2px;font-size:18px;font-weight:600;line-height:1.4}._7C7Hwq_subtitle{color:var(--dsw-alias-label-tertiary);margin:0 0 10px;font-size:12px;line-height:1.5}._7C7Hwq_label{color:var(--dsw-alias-label-primary);margin-top:8px;font-size:13px;font-weight:500;line-height:1.5}._7C7Hwq_input{border:1px solid var(--dsw-alias-border-l2);font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border-radius:6px;padding:7px 9px;font-size:13px;line-height:1.5;transition:border-color .13s}._7C7Hwq_input:hover{border-color:var(--dsw-alias-label-dimmed)}._7C7Hwq_input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}._7C7Hwq_error{color:var(--dsw-alias-state-error-primary);margin:8px 0 0;font-size:12px;line-height:1.5}._7C7Hwq_checking{color:var(--dsw-alias-label-secondary);margin:0;font-size:14px;line-height:1.6}._7C7Hwq_submit{border:1px solid var(--dsw-alias-button-info-fill);font:inherit;cursor:pointer;color:var(--dsw-alias-label-primary-foreground);background:var(--dsw-alias-button-info-fill);border-radius:6px;margin-top:14px;padding:7px 12px;font-size:13px;line-height:1.5;transition:background-color .13s,border-color .13s}._7C7Hwq_submit:hover:not(:disabled){border-color:var(--dsw-alias-button-info-hover);background:var(--dsw-alias-button-info-hover)}._7C7Hwq_submit:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}._7C7Hwq_submit:disabled{opacity:.5;cursor:default}@media (prefers-reduced-motion:reduce){._7C7Hwq_input,._7C7Hwq_submit{transition:none}}";
		const tagId$2 = "dsh-plugin-projects/auth-gate.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-projects";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var auth_gate_module_css_default = {
			"error": "_7C7Hwq_error",
			"label": "_7C7Hwq_label",
			"checking": "_7C7Hwq_checking",
			"input": "_7C7Hwq_input",
			"title": "_7C7Hwq_title",
			"card": "_7C7Hwq_card",
			"subtitle": "_7C7Hwq_subtitle",
			"submit": "_7C7Hwq_submit",
			"veil": "_7C7Hwq_veil"
		};
		//#endregion
		//#region src/client/auth-gate.tsx
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
		/** The inner view: render the phase the parent chose. */
		function AuthGateView(props) {
			const t = props.t;
			const [error, setError] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			if (props.mode === "hidden") return null;
			if (props.mode === "checking") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: auth_gate_module_css_default.veil,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: auth_gate_module_css_default.checking,
					role: "status",
					"aria-label": t("gate.checking"),
					children: t("gate.checking")
				})
			});
			const onSubmit = (event) => {
				event.preventDefault();
				if (busy) return;
				const data = new FormData(event.currentTarget);
				const username = String(data.get("username") ?? "");
				const password = String(data.get("password") ?? "");
				setBusy(true);
				setError("");
				login(props.deps, username, password).then(() => {}).catch((err) => {
					setError(err instanceof ApiError ? err.message : String(err));
				}).finally(() => {
					setBusy(false);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: auth_gate_module_css_default.veil,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
					className: auth_gate_module_css_default.card,
					"aria-label": t("gate.title"),
					onSubmit,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", {
							className: auth_gate_module_css_default.title,
							children: t("gate.title")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: auth_gate_module_css_default.subtitle,
							children: t("gate.subtitle")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							className: auth_gate_module_css_default.label,
							htmlFor: "projects-gate-username",
							children: t("gate.username")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							id: "projects-gate-username",
							name: "username",
							className: auth_gate_module_css_default.input,
							type: "text",
							autoComplete: "username"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							className: auth_gate_module_css_default.label,
							htmlFor: "projects-gate-password",
							children: t("gate.password")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							id: "projects-gate-password",
							name: "password",
							className: auth_gate_module_css_default.input,
							type: "password",
							autoComplete: "current-password"
						}),
						error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: auth_gate_module_css_default.error,
							role: "status",
							children: error
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: auth_gate_module_css_default.submit,
							type: "submit",
							disabled: busy,
							children: t(busy ? "gate.signingIn" : "gate.submit")
						})
					]
				})
			});
		}
		//#endregion
		//#region \0dsh-css:/home/zjh/store/dsh-plugin/dsh-plugin-projects/src/client/admin-section.module.css.mjs
		const css$1 = "._3Vi1bq_section{flex-direction:column;gap:18px;min-width:0;display:flex}._3Vi1bq_header{justify-content:space-between;align-items:flex-start;gap:12px;display:flex}._3Vi1bq_title{color:var(--dsw-alias-label-primary);margin:0;font-size:16px;font-weight:600;line-height:1.5}._3Vi1bq_identity{color:var(--dsw-alias-label-tertiary);margin:2px 0 0;font-size:12px;line-height:1.5}._3Vi1bq_note{color:var(--dsw-alias-label-secondary);margin:0;font-size:12px;line-height:1.6}._3Vi1bq_error{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px;line-height:1.6}._3Vi1bq_ok{color:var(--dsw-alias-label-secondary);word-break:break-all;margin:0;font-size:12px;line-height:1.6}._3Vi1bq_token{font-family:var(--dsw-alias-font-mono,ui-monospace, monospace);color:var(--dsw-alias-label-primary);user-select:all}._3Vi1bq_block{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:8px;flex-direction:column;gap:10px;padding:14px;display:flex}._3Vi1bq_blockTitle{color:var(--dsw-alias-label-primary);margin:0;font-size:13px;font-weight:600;line-height:1.5}._3Vi1bq_list{flex-direction:column;margin:0;padding:0;list-style:none;display:flex}._3Vi1bq_row{border-bottom:1px solid var(--dsw-alias-border-l2);justify-content:space-between;align-items:center;gap:8px;min-width:0;padding:8px 2px;display:flex}._3Vi1bq_row:last-child{border-bottom:0}._3Vi1bq_userMeta{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5;overflow:hidden}._3Vi1bq_dim{color:var(--dsw-alias-label-tertiary);font-size:12px}._3Vi1bq_slug{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}._3Vi1bq_rowActions{flex:none;gap:6px;display:flex}._3Vi1bq_form{flex-direction:column;gap:4px;max-width:360px;display:flex}._3Vi1bq_pathRow{align-items:center;gap:6px;display:flex}._3Vi1bq_pathRow ._3Vi1bq_input{flex:1;min-width:0}._3Vi1bq_label{color:var(--dsw-alias-label-primary);margin-top:8px;font-size:13px;font-weight:500;line-height:1.5}._3Vi1bq_input{border:1px solid var(--dsw-alias-border-l2);font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border-radius:6px;padding:6px 8px;font-size:13px;line-height:1.5;transition:border-color .13s}._3Vi1bq_input:hover{border-color:var(--dsw-alias-label-dimmed)}._3Vi1bq_input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}._3Vi1bq_primary{border:1px solid var(--dsw-alias-button-info-fill);font:inherit;cursor:pointer;color:var(--dsw-alias-label-primary-foreground);background:var(--dsw-alias-button-info-fill);border-radius:6px;margin-top:12px;padding:6px 12px;font-size:13px;line-height:1.5;transition:background-color .13s,border-color .13s}._3Vi1bq_primary:hover:not(:disabled){border-color:var(--dsw-alias-button-info-hover);background:var(--dsw-alias-button-info-hover)}._3Vi1bq_secondary{border:1px solid var(--dsw-alias-border-l2);font:inherit;cursor:pointer;color:var(--dsw-alias-label-secondary);background:0 0;border-radius:6px;padding:4px 10px;font-size:12px;line-height:1.5;transition:color .13s,border-color .13s,background-color .13s}._3Vi1bq_secondary:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed);background:var(--dsw-alias-interactive-bg-hover)}._3Vi1bq_primary:focus-visible,._3Vi1bq_secondary:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}@media (prefers-reduced-motion:reduce){._3Vi1bq_input,._3Vi1bq_primary,._3Vi1bq_secondary{transition:none}}";
		const tagId$1 = "dsh-plugin-projects/admin-section.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-projects";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var admin_section_module_css_default = {
			"slug": "_3Vi1bq_slug",
			"input": "_3Vi1bq_input",
			"pathRow": "_3Vi1bq_pathRow",
			"header": "_3Vi1bq_header",
			"form": "_3Vi1bq_form",
			"blockTitle": "_3Vi1bq_blockTitle",
			"rowActions": "_3Vi1bq_rowActions",
			"label": "_3Vi1bq_label",
			"primary": "_3Vi1bq_primary",
			"dim": "_3Vi1bq_dim",
			"section": "_3Vi1bq_section",
			"token": "_3Vi1bq_token",
			"identity": "_3Vi1bq_identity",
			"secondary": "_3Vi1bq_secondary",
			"row": "_3Vi1bq_row",
			"userMeta": "_3Vi1bq_userMeta",
			"ok": "_3Vi1bq_ok",
			"error": "_3Vi1bq_error",
			"block": "_3Vi1bq_block",
			"title": "_3Vi1bq_title",
			"list": "_3Vi1bq_list",
			"note": "_3Vi1bq_note"
		};
		//#endregion
		//#region src/client/admin-section.tsx
		/**
		* The settings.section page carrying the project/user console. Admins manage
		* projects, one-shot users, one-time tokens and workspace sync here; signed-in
		* non-admins see their identity plus a denial note; anonymous visitors are
		* pointed at the login gate. All forms are uncontrolled (FormData on submit).
		*/
		/** The unambiguous user identifier for admin actions: `project/name` for project users. */
		function userRefOf(u) {
			return u.projectSlug ? `${u.projectSlug}/${u.name}` : u.name;
		}
		/** The inner view: identity, denial, or the full admin console. */
		function AdminSectionView(props) {
			const t = props.t;
			const [user, setUser] = (0, react.useState)();
			const [projects, setProjects] = (0, react.useState)([]);
			const [users, setUsers] = (0, react.useState)([]);
			const [message, setMessage] = (0, react.useState)(null);
			const [oneTimeToken, setOneTimeToken] = (0, react.useState)("");
			const [loaded, setLoaded] = (0, react.useState)(false);
			const [projectPath, setProjectPath] = (0, react.useState)("");
			const [picking, setPicking] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				let alive = true;
				whoAmI(props.deps).then(async (identity) => {
					if (!alive) return;
					setUser(identity);
					if (identity?.role === "admin") {
						const overview = await callApi(props.deps.fetch, "/projects/api/admin/overview", { token: readStoredToken(props.deps.storage) ?? "" });
						if (!alive) return;
						setProjects(overview.projects ?? []);
						setUsers(overview.users ?? []);
					}
					setLoaded(true);
				});
				return () => {
					alive = false;
				};
			}, [props.deps]);
			if (user === void 0) return null;
			if (user === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: admin_section_module_css_default.note,
				role: "status",
				children: t("admin.notSignedIn")
			});
			const token = readStoredToken(props.deps.storage) ?? "";
			const api = (path, body) => callApi(props.deps.fetch, path, {
				method: "POST",
				body,
				token
			});
			const refresh = async () => {
				const overview = await callApi(props.deps.fetch, "/projects/api/admin/overview", { token });
				setProjects(overview.projects ?? []);
				setUsers(overview.users ?? []);
			};
			const run = (action, okText) => {
				setMessage(null);
				setOneTimeToken("");
				action().then(async () => {
					if (okText) setMessage({
						kind: "ok",
						text: okText
					});
					await refresh();
				}).catch((err) => {
					setMessage({
						kind: "error",
						text: err instanceof ApiError ? err.message : String(err)
					});
				});
			};
			const onCreateProject = (event) => {
				event.preventDefault();
				const name = String(new FormData(event.currentTarget).get("project-name") ?? "");
				if (!name) return;
				const trimmed = projectPath.trim();
				const body = { name };
				if (trimmed) body.workspacePath = trimmed;
				(async () => {
					await api("/projects/api/admin/projects", body);
				})().then(refresh).catch((err) => {
					setMessage({
						kind: "error",
						text: err instanceof ApiError ? err.message : String(err)
					});
				});
			};
			const onBrowse = () => {
				if (!props.picker || picking) return;
				setPicking(true);
				setMessage(null);
				props.picker.pick().then((path) => {
					if (path) setProjectPath(path);
				}).catch(() => {
					setMessage({
						kind: "error",
						text: t("admin.pickFailed")
					});
				}).finally(() => {
					setPicking(false);
				});
			};
			const onCreateUser = (event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				const body = {
					project: String(data.get("project") ?? ""),
					username: String(data.get("username") ?? ""),
					password: String(data.get("password") ?? "")
				};
				if (!body.project || !body.username || !body.password) return;
				run(async () => {
					await api("/projects/api/admin/users", body);
				});
			};
			const onLogout = () => {
				logout(props.deps);
				props.close();
			};
			const header = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
				className: admin_section_module_css_default.header,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
					className: admin_section_module_css_default.title,
					children: t("section.title")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
					className: admin_section_module_css_default.identity,
					children: [
						t("admin.identity"),
						"：",
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: admin_section_module_css_default.slug,
							children: user.slug
						}),
						"（",
						t(user.role === "admin" ? "admin.role.admin" : "admin.role.user"),
						"）"
					]
				})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: admin_section_module_css_default.secondary,
					onClick: onLogout,
					children: t("admin.logout")
				})]
			});
			if (user.role !== "admin") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: admin_section_module_css_default.section,
				children: [header, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: admin_section_module_css_default.note,
					role: "status",
					children: t("admin.denied")
				})]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: admin_section_module_css_default.section,
				children: [
					header,
					message ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: message.kind === "error" ? admin_section_module_css_default.error : admin_section_module_css_default.ok,
						role: message.kind === "error" ? "alert" : "status",
						children: message.text
					}) : null,
					oneTimeToken ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: admin_section_module_css_default.ok,
						role: "status",
						children: [
							t("admin.tokenIssued"),
							" ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
								className: admin_section_module_css_default.token,
								children: oneTimeToken
							})
						]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: admin_section_module_css_default.block,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								className: admin_section_module_css_default.blockTitle,
								children: t("admin.projects")
							}),
							loaded ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
								className: admin_section_module_css_default.list,
								children: projects.map((p) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
									className: admin_section_module_css_default.row,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: p.name }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
										className: admin_section_module_css_default.slug,
										children: p.workspacePath ?? p.slug
									})]
								}, p.slug))
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: admin_section_module_css_default.note,
								children: t("admin.loading")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
								className: admin_section_module_css_default.form,
								onSubmit: onCreateProject,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
										className: admin_section_module_css_default.label,
										htmlFor: "projects-admin-project-name",
										children: t("admin.projectName")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										id: "projects-admin-project-name",
										name: "project-name",
										className: admin_section_module_css_default.input,
										type: "text"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
										className: admin_section_module_css_default.label,
										htmlFor: "projects-admin-project-path",
										children: t("admin.projectPath")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: admin_section_module_css_default.pathRow,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											id: "projects-admin-project-path",
											name: "project-path",
											className: admin_section_module_css_default.input,
											type: "text",
											placeholder: "/absolute/path",
											value: projectPath,
											onChange: (e) => {
												setProjectPath(e.target.value);
											}
										}), props.picker ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: admin_section_module_css_default.secondary,
											onClick: onBrowse,
											disabled: picking,
											children: t("admin.browse")
										}) : null]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "submit",
										className: admin_section_module_css_default.primary,
										children: t("admin.createProject")
									})
								]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: admin_section_module_css_default.block,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								className: admin_section_module_css_default.blockTitle,
								children: t("admin.users")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
								className: admin_section_module_css_default.form,
								onSubmit: onCreateUser,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
										className: admin_section_module_css_default.label,
										htmlFor: "projects-admin-user-project",
										children: t("admin.userProject")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
										id: "projects-admin-user-project",
										name: "project",
										className: admin_section_module_css_default.input,
										children: projects.map((p) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: p.slug,
											children: p.name
										}, p.slug))
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
										className: admin_section_module_css_default.label,
										htmlFor: "projects-admin-user-name",
										children: t("admin.username")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										id: "projects-admin-user-name",
										name: "username",
										className: admin_section_module_css_default.input,
										type: "text"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
										className: admin_section_module_css_default.label,
										htmlFor: "projects-admin-user-password",
										children: t("admin.password")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										id: "projects-admin-user-password",
										name: "password",
										className: admin_section_module_css_default.input,
										type: "password"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "submit",
										className: admin_section_module_css_default.primary,
										children: t("admin.createUser")
									})
								]
							}),
							loaded ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
								className: admin_section_module_css_default.list,
								children: users.filter((u) => u.role === "user").map((u) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
									className: admin_section_module_css_default.row,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: admin_section_module_css_default.userMeta,
										children: [u.name, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: admin_section_module_css_default.dim,
											children: [
												" · ",
												u.projectSlug ?? "—",
												" · ",
												t(u.status === "active" ? "admin.status.active" : "admin.status.disabled")
											]
										})]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: admin_section_module_css_default.rowActions,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: admin_section_module_css_default.secondary,
												onClick: () => {
													setMessage(null);
													setOneTimeToken("");
													api("/projects/api/admin/tokens", { username: userRefOf(u) }).then((res) => {
														setOneTimeToken(res.token);
													}).catch((err) => {
														setMessage({
															kind: "error",
															text: err instanceof ApiError ? err.message : String(err)
														});
													});
												},
												children: t("admin.issueToken")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: admin_section_module_css_default.secondary,
												onClick: () => {
													run(async () => {
														await api("/projects/api/admin/disable", { username: userRefOf(u) });
													});
												},
												children: t("admin.disable")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: admin_section_module_css_default.secondary,
												onClick: () => {
													run(async () => {
														await api("/projects/api/admin/sync", {
															project: u.projectSlug ?? "",
															username: u.name
														});
													}, t("admin.syncDone"));
												},
												children: t("admin.sync")
											})
										]
									})]
								}, u.slug))
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: admin_section_module_css_default.note,
								children: t("admin.loading")
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region \0dsh-css:/home/zjh/store/dsh-plugin/dsh-plugin-projects/src/client/restricted.module.css.mjs
		const css = ".VM2t0W_browser{box-sizing:border-box;flex-direction:column;flex:1;min-height:0;padding:8px 12px 12px;display:flex;overflow-y:auto}.VM2t0W_browserHeader{flex-direction:column;gap:2px;margin-bottom:8px;display:flex}.VM2t0W_browserProjectLabel{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:1.5}.VM2t0W_browserProjectName{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:1.5}.VM2t0W_browserList{flex-direction:column;gap:2px;margin:0;padding:0;list-style:none;display:flex}.VM2t0W_browserRow{width:100%;height:30px;font:inherit;text-align:left;cursor:pointer;color:var(--dsw-alias-label-primary);background:0 0;border:none;border-radius:8px;align-items:center;gap:6px;padding:0 8px;font-size:13px;line-height:1.5;transition:background-color .13s;display:flex}.VM2t0W_browserRow:hover{background:var(--dsw-alias-interactive-bg-hover)}.VM2t0W_browserRow:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}.VM2t0W_browserRowActive{background:var(--dsw-alias-interactive-bg-selected)}.VM2t0W_browserRowTitle{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;overflow:hidden}.VM2t0W_runningDot{background:var(--dsw-alias-state-business-primary);border-radius:50%;flex:none;width:6px;height:6px}.VM2t0W_empty{color:var(--dsw-alias-label-tertiary);padding:12px 8px;font-size:12px;line-height:1.6}.VM2t0W_picker{z-index:30;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);min-width:240px;box-shadow:0 8px 28px var(--dsw-alias-shadow-ambient);border-radius:10px;flex-direction:column;gap:2px;padding:6px;display:flex;position:fixed;top:64px;left:50%;transform:translate(-50%)}.VM2t0W_picker[data-anchored=true]{transform:none}.VM2t0W_pickerRow{width:100%;height:32px;font:inherit;text-align:left;cursor:pointer;color:var(--dsw-alias-label-primary);background:0 0;border:none;border-radius:8px;align-items:center;gap:8px;padding:0 10px;font-size:13px;line-height:1.5;transition:background-color .13s;display:flex}.VM2t0W_pickerRow:hover{background:var(--dsw-alias-interactive-bg-hover)}.VM2t0W_pickerRow:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}.VM2t0W_pickerNote{color:var(--dsw-alias-label-secondary);padding:10px;font-size:12px;line-height:1.6}.VM2t0W_badge{width:100%;height:34px;color:var(--dsw-alias-label-secondary);border-radius:8px;align-items:center;gap:6px;padding:0 8px;display:flex}.VM2t0W_badgeIdentity{flex-direction:column;flex:1;min-width:0;display:flex}.VM2t0W_badgeName{color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600;line-height:1.4;overflow:hidden}.VM2t0W_badgeProject{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:1.4;overflow:hidden}.VM2t0W_logout{border:1px solid var(--dsw-alias-border-l2);height:26px;font:inherit;cursor:pointer;color:var(--dsw-alias-label-secondary);background:0 0;border-radius:7px;flex:none;align-items:center;padding:0 8px;font-size:11px;line-height:1.5;transition:border-color .13s,color .13s;display:inline-flex}.VM2t0W_logout:hover{border-color:var(--dsw-alias-label-dimmed);color:var(--dsw-alias-label-primary)}.VM2t0W_logout:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}@media (prefers-reduced-motion:reduce){.VM2t0W_browserRow,.VM2t0W_pickerRow,.VM2t0W_logout{transition:none}}";
		const tagId = "dsh-plugin-projects/restricted.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-projects";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var restricted_module_css_default = {
			"pickerNote": "VM2t0W_pickerNote",
			"browserProjectName": "VM2t0W_browserProjectName",
			"badge": "VM2t0W_badge",
			"browser": "VM2t0W_browser",
			"browserRowActive": "VM2t0W_browserRowActive",
			"browserRowTitle": "VM2t0W_browserRowTitle",
			"logout": "VM2t0W_logout",
			"browserHeader": "VM2t0W_browserHeader",
			"picker": "VM2t0W_picker",
			"badgeName": "VM2t0W_badgeName",
			"badgeIdentity": "VM2t0W_badgeIdentity",
			"browserRow": "VM2t0W_browserRow",
			"browserProjectLabel": "VM2t0W_browserProjectLabel",
			"browserList": "VM2t0W_browserList",
			"badgeProject": "VM2t0W_badgeProject",
			"pickerRow": "VM2t0W_pickerRow",
			"empty": "VM2t0W_empty",
			"runningDot": "VM2t0W_runningDot"
		};
		//#endregion
		//#region src/client/restricted.tsx
		/** The project browser: only this user's cwd-bucketed sessions. */
		function RestrictedWorkspacesView(props) {
			const list = props.useSessions((s) => s);
			const rows = list.ids.map((id) => list.byId[id]).filter((row) => row !== void 0).filter((row) => row.cwd === props.user.cwd && row.origin !== "subagent" && row.blank !== true);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: restricted_module_css_default.browser,
				"data-wide": props.wide ? "true" : void 0,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: restricted_module_css_default.browserHeader,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: restricted_module_css_default.browserProjectLabel,
						children: props.t("browser.project")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: restricted_module_css_default.browserProjectName,
						children: props.user.projectName ?? props.user.slug
					})]
				}), rows.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: restricted_module_css_default.empty,
					children: props.t("browser.empty")
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
					className: restricted_module_css_default.browserList,
					children: rows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: `${restricted_module_css_default.browserRow} ${list.current === row.id ? restricted_module_css_default.browserRowActive : ""}`,
						onClick: () => props.openSession(row.id),
						children: [row.running ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: restricted_module_css_default.runningDot,
							"aria-hidden": "true"
						}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: restricted_module_css_default.browserRowTitle,
							children: row.title ?? props.titles?.[row.id] ?? row.displayTitle
						})]
					}) }, row.id))
				})]
			});
		}
		/**
		* Fetch the durable-log titles for the signed-in user's sessions once per
		* identity (best effort — failures leave the map empty and the feed's own
		* titles/display fallback stay in charge). Feeds
		* {@link RestrictedWorkspacesViewProps.titles}.
		*/
		function useColdSessionTitles(user, deps) {
			const [titles, setTitles] = (0, react.useState)({});
			(0, react.useEffect)(() => {
				setTitles({});
				if (user === void 0) return;
				let cancelled = false;
				const token = readStoredToken(deps.storage);
				if (token === null) return;
				callApi(deps.fetch, "/projects/api/my/sessions", { token }).then((res) => {
					if (cancelled) return;
					const sessions = res.sessions ?? [];
					const map = {};
					for (const s of sessions) if (typeof s.id === "string" && typeof s.title === "string" && s.title.length > 0) map[s.id] = s.title;
					setTitles(map);
				}).catch(() => {});
				return () => {
					cancelled = true;
				};
			}, [user?.slug]);
			return titles;
		}
		/** Renders nothing — the settings trigger vanishes for normal users. */
		function RestrictedSettingsView() {
			return null;
		}
		/**
		* Guard the stock "restore last session" behavior: when the runtime restored
		* a current session whose cwd bucket is foreign to the signed-in user (or
		* carries no cwd at all), clear the selection into the blank New Session
		* view. Runs imperatively at identity transitions, before shadows mount.
		*
		* @returns true when the selection was cleared.
		*/
		function guardCurrentSession(list, userCwd, clear) {
			if (list.current === void 0) return false;
			const row = list.byId[list.current];
			if (row !== void 0 && row.cwd === userCwd) return false;
			clear();
			return true;
		}
		/** Vertical gap between the anchor chip and the dropped menu (px). */
		const PICKER_GAP = 6;
		/** Height budget for the flip-above decision (px). */
		const PICKER_MAX_HEIGHT = 320;
		/** Minimum left edge the menu may occupy (px). */
		const PICKER_MIN_LEFT = 8;
		/**
		* Compute the dropdown position for the picker menu: right below the anchor
		* chip, left-aligned with it, at least as wide as the chip; flips above the
		* chip when the drop would overflow the viewport; clamps into the viewport.
		*/
		function pickerPosition(rect, viewport) {
			const dropTop = rect.bottom + PICKER_GAP;
			const rawTop = dropTop + PICKER_MAX_HEIGHT > viewport.height ? rect.top - PICKER_GAP - PICKER_MAX_HEIGHT : dropTop;
			return {
				top: Math.max(rawTop, PICKER_MIN_LEFT),
				left: Math.max(rect.left, PICKER_MIN_LEFT),
				minWidth: Math.max(Math.round(rect.width), 200)
			};
		}
		/** The workspace picker: only the user's own workspace is offered. */
		function RestrictedPickerView(props) {
			const [anchorBox, setAnchorBox] = (0, react.useState)();
			(0, react.useLayoutEffect)(() => {
				if (!props.open) return;
				const el = props.anchorRef?.current;
				if (!el) {
					setAnchorBox(void 0);
					return;
				}
				const rect = el.getBoundingClientRect();
				setAnchorBox(pickerPosition(rect, { height: window.innerHeight }));
			}, [props.open, props.anchorRef]);
			const items = props.useWorkspaces((s) => s.items);
			if (!props.open) return null;
			const mine = items.find((w) => w.path === props.user.cwd);
			const anchored = anchorBox !== void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: restricted_module_css_default.picker,
				"data-anchored": anchored ? "true" : void 0,
				role: "menu",
				"aria-label": props.t("browser.project"),
				style: anchored ? {
					top: `${anchorBox.top}px`,
					left: `${anchorBox.left}px`,
					minWidth: `${anchorBox.minWidth}px`
				} : void 0,
				children: mine ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: `${restricted_module_css_default.pickerRow} ${props.selectedId === mine.workspaceId ? restricted_module_css_default.browserRowActive : ""}`,
					role: "menuitem",
					onClick: () => {
						props.onPick(mine.workspaceId);
						props.onClose();
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: restricted_module_css_default.browserRowTitle,
						children: mine.title
					})
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: restricted_module_css_default.pickerNote,
					children: props.t("picker.missing")
				})
			});
		}
		/** Identity badge with the one-way sign-out (clear token + reload). */
		function UserBadgeView(props) {
			const onLogout = () => {
				logout(props.deps);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: restricted_module_css_default.badge,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: restricted_module_css_default.badgeIdentity,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: restricted_module_css_default.badgeName,
						children: props.user.slug
					}), props.wide && props.user.projectName ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: restricted_module_css_default.badgeProject,
						children: props.user.projectName
					}) : null]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: restricted_module_css_default.logout,
					onClick: onLogout,
					children: props.t("badge.logout")
				})]
			});
		}
		//#endregion
		//#region src/client/identity.ts
		/**
		* The client identity controller: one shared resolution of "who is at this
		* browser" (guard-status probe + stored bearer token + /whoami) that drives
		* every restricted seat. Normal users ('user' role) get the restricted UI;
		* admins, anonymous visitors, and guard-off deployments keep the stock UI.
		*
		* Fail-open by design (same policy as the auth gate): a broken plugin API
		* never degrades the stock client. Re-resolves on authEvents 'changed'
		* (login/logout) so shadow registrations follow the active identity.
		*/
		/** Resolve once: guard probe → token presence → whoami role. */
		async function resolveIdentity(deps) {
			let guardEnabled = false;
			try {
				const res = await deps.fetch("/projects/api/guard-status", { method: "GET" });
				const json = await res.json().catch(() => ({}));
				guardEnabled = res.ok && json.guardEnabled === true;
			} catch {
				return { kind: "guard-off" };
			}
			if (!guardEnabled) return { kind: "guard-off" };
			if (readStoredToken(deps.storage) === null) return { kind: "anonymous" };
			try {
				const res = await deps.fetch("/projects/api/whoami", {
					method: "GET",
					headers: { authorization: `Bearer ${readStoredToken(deps.storage)}` }
				});
				if (!res.ok) return { kind: "anonymous" };
				const user = (await res.json()).user;
				if (!user || user.role !== "user" && user.role !== "admin") return { kind: "anonymous" };
				return user.role === "admin" ? {
					kind: "admin",
					user
				} : {
					kind: "user",
					user
				};
			} catch {
				return { kind: "anonymous" };
			}
		}
		/**
		* Watch identity across auth changes. Publishes every resolved state (and
		* 'resolving' immediately); re-resolves whenever authEvents fires. The
		* returned disposer stops listening and freezes publications.
		*/
		function watchIdentity(deps, publish) {
			let disposed = false;
			publish({ kind: "resolving" });
			const rerun = () => {
				resolveIdentity(deps).then((state) => {
					if (!disposed) publish(state);
				});
			};
			rerun();
			const off = authEvents.on("changed", rerun);
			return () => {
				disposed = true;
				off();
			};
		}
		//#endregion
		//#region src/client/perm-lock.ts
		/**
		* The composer access-mode chip lock for normal users.
		*
		* The stock composer renders the permission-mode selector inline (the
		* 'conversation.composer.bar' default entry) with the FULL preset roster the
		* host advertises through the 'permissions' projection — there is no slot,
		* provide-member, or projection-key override a plugin may use to narrow the
		* list (registering a second 'permissions' projection key fails loud, and
		* the preset roster itself is process-wide, so shrinking it would clamp
		* admins too). The host half of this plugin already pins every normal-user
		* session to workspace-write and rejects switches; this module closes the
		* UI half: while the resolved identity is a normal user, the chip keeps
		* showing the pinned "Workspace Write" value but stops opening its menu —
		* functionally "exactly one option, selected".
		*
		* Anchoring stays locale-stable and build-stable: the chip trigger is the
		* only button whose aria-label starts with the localized access-mode prefix
		* (the stock client ships exactly zh/en), and the chevron is matched by its
		* CSS-modules suffix rather than its hash.
		*/
		/**
		* aria-label prefixes of the access-mode trigger across the stock client
		* locales ('访问模式，当前：{name}' / 'Access mode, current: {name}').
		*/
		const ACCESS_MODE_LABEL_PREFIXES = ["访问模式", "Access mode"];
		/** body[data-dsh-projects-role] value while a normal user is signed in. */
		const ROLE_ATTRIBUTE = "data-dsh-projects-role";
		/** id of the injected <style> element (idempotent mounting). */
		const PERMISSION_LOCK_STYLE_ID = "projects-permission-lock";
		/**
		* The lock stylesheet: while the role flag marks a normal user, the trigger
		* keeps rendering the pinned value but no longer opens its menu, and the
		* dropdown chevron is hidden (a fixed mode, not a chooser).
		*
		* One COMPLETE rule per locale prefix — a comma-joined selector would split
		* the rule list and drop the body scope from every segment but the first.
		* Declarations carry !important on purpose: this is an adversarial freeze
		* against stock styles the lock must win regardless of injection order.
		*/
		function permissionLockCss() {
			const scoped = (suffix, decl) => ACCESS_MODE_LABEL_PREFIXES.map((p) => `body[${ROLE_ATTRIBUTE}="user"] button[aria-label^="${p}"]${suffix} { ${decl} }`).join("\n");
			return [scoped("", "pointer-events: none !important; cursor: default !important;"), scoped(" [class$=\"_chevron\"]", "display: none !important;")].join("\n");
		}
		/**
		* Keep the body role flag in step with the resolved identity: 'user' while a
		* normal user is signed in, absent otherwise (admins/anonymous keep the full
		* stock chip).
		*/
		function applyBodyRole(body, role) {
			if (!body) return;
			if (role === "user") body.setAttribute(ROLE_ATTRIBUTE, "user");
			else body.removeAttribute(ROLE_ATTRIBUTE);
		}
		/**
		* Inject the lock stylesheet once per document; the disposer removes it.
		*/
		function mountPermissionLockStyle(doc) {
			const existing = doc.querySelector(`style#${PERMISSION_LOCK_STYLE_ID}`);
			if (existing) return () => existing.remove();
			const tag = doc.createElement("style");
			tag.id = PERMISSION_LOCK_STYLE_ID;
			tag.textContent = permissionLockCss();
			doc.head.append(tag);
			return () => tag.remove();
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* The 'projects' locale namespace: every user-facing string of the browser
		* half, zh first (fallback), en second. Declared into LocaleNamespaceMap so
		* registrations and the framework `t` seat type-check against these keys.
		*/
		const zh = {
			"gate.title": "登录 DSH",
			"gate.subtitle": "项目工作区访问",
			"gate.checking": "正在验证访问身份…",
			"gate.username": "用户名",
			"gate.password": "密码",
			"gate.submit": "登录",
			"gate.signingIn": "登录中…",
			"badge.signedInAs": "当前用户",
			"badge.logout": "退出登录",
			"browser.project": "项目",
			"browser.empty": "还没有会话：点击「新会话」开始。",
			"picker.missing": "你的项目工作区尚未注册，请联系管理员。",
			"section.title": "项目与用户",
			"admin.notSignedIn": "尚未登录：请先通过登录门禁完成认证，再打开本页。",
			"admin.denied": "仅管理员可管理项目与用户；当前账号没有这个权限。",
			"admin.logout": "退出登录",
			"admin.identity": "当前身份",
			"admin.role.admin": "管理员",
			"admin.role.user": "普通用户",
			"admin.projects": "项目",
			"admin.projectName": "项目名称",
			"admin.projectPath": "工作区路径（可选，绝对路径，留空自动创建）",
			"admin.browse": "浏览…",
			"admin.pickFailed": "宿主目录选择不可用，请手动输入路径。",
			"admin.createProject": "创建项目",
			"admin.users": "用户",
			"admin.userProject": "所属项目",
			"admin.username": "用户名",
			"admin.password": "初始密码",
			"admin.createUser": "创建用户",
			"admin.issueToken": "补发令牌",
			"admin.disable": "禁用",
			"admin.sync": "同步软链接",
			"admin.status.active": "启用",
			"admin.status.disabled": "已禁用",
			"admin.tokenIssued": "一次性令牌（仅显示一次）：",
			"admin.syncDone": "已同步",
			"admin.loading": "加载中…"
		};
		const en = {
			"gate.title": "Sign in to DSH",
			"gate.subtitle": "Project workspace access",
			"gate.checking": "Verifying your access…",
			"gate.username": "Username",
			"gate.password": "Password",
			"gate.submit": "Sign in",
			"gate.signingIn": "Signing in…",
			"badge.signedInAs": "Signed in as",
			"badge.logout": "Sign out",
			"browser.project": "Project",
			"browser.empty": "No sessions yet — hit “New Session” to start.",
			"picker.missing": "Your project workspace is not registered yet; ask the admin.",
			"section.title": "Projects & Users",
			"admin.notSignedIn": "Not signed in: pass the login gate first, then reopen this page.",
			"admin.denied": "Only admins manage projects and users; this account lacks that right.",
			"admin.logout": "Sign out",
			"admin.identity": "Current identity",
			"admin.role.admin": "Admin",
			"admin.role.user": "Member",
			"admin.projects": "Projects",
			"admin.projectName": "Project name",
			"admin.projectPath": "Workspace path (optional, absolute; empty auto-creates)",
			"admin.browse": "Browse…",
			"admin.pickFailed": "Host directory picking unavailable — type the path instead.",
			"admin.createProject": "Create project",
			"admin.users": "Users",
			"admin.userProject": "Project",
			"admin.username": "Username",
			"admin.password": "Initial password",
			"admin.createUser": "Create user",
			"admin.issueToken": "Issue token",
			"admin.disable": "Disable",
			"admin.sync": "Sync links",
			"admin.status.active": "Active",
			"admin.status.disabled": "Disabled",
			"admin.tokenIssued": "One-time token (shown once):",
			"admin.syncDone": "Synced",
			"admin.loading": "Loading…"
		};
		//#endregion
		//#region src/client/index.tsx
		/**
		* dsh-plugin-projects — browser half.
		*
		* Seats contributed into the official Web Client:
		*  - `shell.overlay` (list): the auth gate — a full-frame login card while
		*    the host guard is armed and no valid token is stored.
		*  - `settings.section` (list): the "Projects & Users" admin console.
		*  - `sidebar.footer.action` (list): the normal-user identity badge with the
		*    one-way sign-out (clear token + reload; hidden for admins/anonymous).
		*
		* Restricted mode for normal users ('user' role + valid token) — the official
		* slot shadowing semantics (single-kind seats render the LOWEST priority
		* entry; a different-priority registration shadows, disposal restores):
		*  - `sidebar.workspaces` shadow: the project browser listing ONLY the
		*    sessions cwd-bucketed into the user's workspace (per-user isolation);
		*  - `sidebar.settings` shadow: renders nothing — the settings trigger
		*    disappears (normal users must not touch global settings);
		*  - `conversation.hero.workspace` shadow: the picker offering ONLY the
		*    user's own workspace (no workspace switching).
		*  - composer access-mode chip lock: while a normal user is signed in a body
		*    role flag + injected stylesheet freeze the permission-mode chip at its
		*    pinned value (workspace-write; the host half rejects switches anyway) —
		*    no menu, no chevron; admins/anonymous see the stock chip untouched.
		*
		* Shadows register/unregister dynamically as the resolved identity flips
		* (login → user, logout → reload), each inside its slot's declaration
		* lifecycle via `slots.inject` (declaration-bound teardown runs them).
		*/
		/** Services required by this plugin (slots registry, locale, sessions.open, workspaces.pickDirectory). */
		const inject = [
			"slots",
			"locale",
			"sessions",
			"workspaces"
		];
		/** Subscribe a component to the shared identity resolution. */
		function useIdentity(source) {
			return (0, react.useSyncExternalStore)(source.subscribe, source.get);
		}
		/** Build the source + its watcher stopper (one per plugin lifetime). */
		function createIdentitySource() {
			let state = { kind: "resolving" };
			const listeners = /* @__PURE__ */ new Set();
			/** The user payload of a state, when it carries one. */
			const userOf = (s) => s.kind === "user" || s.kind === "admin" ? s.user : void 0;
			return {
				source: {
					subscribe(fn) {
						listeners.add(fn);
						return () => {
							listeners.delete(fn);
						};
					},
					get: () => state
				},
				stop: watchIdentity(browserDeps, (next) => {
					const sameUser = (a, b) => a?.slug === b?.slug && a?.role === b?.role && a?.cwd === b?.cwd;
					if (next.kind === state.kind && sameUser(userOf(next), userOf(state))) return;
					state = next;
					for (const listener of [...listeners]) listener();
				})
			};
		}
		/**
		* Mount the plugin's browser surfaces.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register("projects", {
				zh,
				en
			}), "projects: dictionaries");
			const identity = createIdentitySource();
			ctx.effect(() => identity.stop, "projects: identity watcher");
			const source = identity.source;
			ctx.effect(() => mountPermissionLockStyle(document), "projects: permission lock style");
			ctx.effect(() => {
				const sync = () => applyBodyRole(document.body, source.get().kind === "user" ? "user" : "other");
				sync();
				return source.subscribe(sync);
			}, "projects: body role flag");
			function AuthGateEntry(props) {
				const state = useIdentity(source);
				const mode = state.kind === "resolving" ? "checking" : state.kind === "anonymous" ? "form" : "hidden";
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AuthGateView, {
					t: props.t,
					deps: browserDeps,
					mode
				});
			}
			function AdminSectionEntry(props) {
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AdminSectionView, {
					t: props.t,
					close: props.close,
					deps: browserDeps,
					picker: { pick: () => ctx.workspaces.pickDirectory() }
				});
			}
			function UserBadgeEntry(props) {
				const state = useIdentity(source);
				if (state.kind !== "user" && state.kind !== "admin") return null;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UserBadgeView, {
					t: props.t,
					wide: props.wide,
					user: state.user,
					deps: browserDeps
				});
			}
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "projects-auth-gate",
				order: 0,
				locale: "projects"
			}, AuthGateEntry));
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "projects-admin",
				order: 200,
				locale: "projects",
				label: () => ctx.locale.bind("projects")("section.title")
			}, AdminSectionEntry));
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "projects-user-badge",
				order: 0,
				locale: "projects"
			}, UserBadgeEntry));
			const sessionsFace = ctx.sessions;
			const sessionsList = sessionsFace.list;
			/** Clear a current session that is foreign to the signed-in user (once). */
			function guardForeignCurrentSession(user) {
				if (!user.cwd) return;
				const snapshot = typeof sessionsList?.getSnapshot === "function" ? sessionsList.getSnapshot() : void 0;
				if (!snapshot) return;
				guardCurrentSession(snapshot, user.cwd, () => {
					sessionsFace.clear?.();
				});
			}
			/**
			* Keep guarding while the store mutates: the runtime may restore or set a
			* current session at any tick (wire resync, list refresh) — every change
			* re-checks and clears foreign selections for this user.
			*/
			function subscribeForeignGuard(user) {
				if (typeof sessionsList?.subscribe !== "function") return () => {};
				return sessionsList.subscribe(() => guardForeignCurrentSession(user));
			}
			const workspacesFace = ctx.workspaces;
			/** Which user the auto-connect already armed for (one shot per identity). */
			let autoConnectedFor;
			/**
			* A project user has exactly one legal workspace — select it for them as
			* soon as their identity resolves, so the hero lands pre-picked instead of
			* offering a one-entry menu. Mirrors the stock hero's onPick flow
			* (connectWorkspace + open) minus the draft migration (nothing is staged
			* yet at identity time).
			*/
			function autoConnectWorkspace(user) {
				if (!user.cwd) return;
				if (autoConnectedFor === user.slug) return;
				autoConnectedFor = user.slug;
				(async () => {
					try {
						const mine = (workspacesFace?.list?.getSnapshot?.())?.items?.find((w) => w.path === user.cwd);
						if (!mine) return;
						const currentId = sessionsList?.getSnapshot?.()?.current;
						if ((currentId !== void 0 ? sessionsList?.getSnapshot?.()?.byId?.[currentId]?.cwd : void 0) === user.cwd) return;
						const sessionId = await workspacesFace?.connectWorkspace?.(mine.workspaceId);
						if (sessionId !== void 0) sessionsFace.open(sessionId);
					} catch {}
				})();
			}
			function RestrictedWorkspacesEntry(props) {
				const state = useIdentity(source);
				const titles = useColdSessionTitles(state.kind === "user" ? state.user : void 0, browserDeps);
				if (state.kind !== "user") return null;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RestrictedWorkspacesView, {
					t: props.t,
					wide: props.wide,
					useSessions: (selector) => props.useSessions(selector),
					openSession: (sessionId) => sessionsFace.open(sessionId),
					user: state.user,
					titles
				});
			}
			function RestrictedSettingsEntry(_props) {
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RestrictedSettingsView, {});
			}
			function RestrictedPickerEntry(props) {
				const state = useIdentity(source);
				if (state.kind !== "user") return null;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RestrictedPickerView, {
					t: props.t,
					open: props.open,
					anchorRef: props.anchorRef,
					selectedId: props.selectedId === void 0 ? void 0 : String(props.selectedId),
					onPick: (workspaceId) => props.onPick(workspaceId),
					onClose: props.onClose,
					useWorkspaces: (selector) => props.useWorkspaces(selector),
					user: state.user
				});
			}
			/**
			* Register the shadow while the resolved identity is a normal user; dispose
			* otherwise. `onUser` performs the actual register call (typing stays at the
			* call site where the slot key literal drives inference) and returns its
			* disposer.
			*/
			function shadowWhenUser(seat, onUser) {
				ctx.slots.inject(seat, () => {
					let disposeShadow;
					let disposeGuard;
					const sync = (state) => {
						if (state.kind === "user") {
							guardForeignCurrentSession(state.user);
							autoConnectWorkspace(state.user);
							disposeGuard ??= subscribeForeignGuard(state.user);
							disposeShadow ??= onUser();
						} else {
							disposeShadow?.();
							disposeShadow = void 0;
							disposeGuard?.();
							disposeGuard = void 0;
						}
					};
					sync(source.get());
					const off = source.subscribe(() => sync(source.get()));
					return () => {
						off();
						disposeShadow?.();
						disposeShadow = void 0;
						disposeGuard?.();
						disposeGuard = void 0;
					};
				});
			}
			shadowWhenUser("sidebar.workspaces", () => ctx.slots.register({
				name: "sidebar.workspaces",
				priority: -10,
				locale: "projects"
			}, RestrictedWorkspacesEntry));
			shadowWhenUser("sidebar.settings", () => ctx.slots.register({
				name: "sidebar.settings",
				priority: -10,
				locale: "projects"
			}, RestrictedSettingsEntry));
			shadowWhenUser("conversation.hero.workspace", () => ctx.slots.register({
				name: "conversation.hero.workspace",
				priority: -10,
				locale: "projects"
			}, RestrictedPickerEntry));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map