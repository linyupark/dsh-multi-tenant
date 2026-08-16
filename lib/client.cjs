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
			storage: globalThis.localStorage
		};
		/** Probe guard-status (and whoami when a token exists) and decide. */
		async function resolveGate(fetchLike, storage) {
			let guardEnabled = false;
			try {
				guardEnabled = (await callApi(fetchLike, "/projects/api/guard-status")).guardEnabled === true;
			} catch {
				return { phase: "open" };
			}
			if (!guardEnabled) return { phase: "open" };
			const token = readStoredToken(storage);
			if (!token) return { phase: "login" };
			try {
				return {
					phase: "open",
					user: (await callApi(fetchLike, "/projects/api/whoami", { token })).user
				};
			} catch {
				return { phase: "login" };
			}
		}
		/** Resolve the current user through the stored token; null when absent. */
		async function whoAmI(deps) {
			const token = readStoredToken(deps.storage);
			if (!token) return null;
			try {
				return (await callApi(deps.fetch, "/projects/api/whoami", { token })).user ?? null;
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
		/** Drop the token and notify listeners. */
		function logout(deps) {
			clearStoredToken(deps.storage);
			authEvents.emit("changed");
		}
		/** Auth state change notifications shared by the gate, badge and console. */
		var AuthEventBus = class {
			target = typeof EventTarget !== "undefined" ? new EventTarget() : void 0;
			handlers = /* @__PURE__ */ new Set();
			/** Subscribe to 'changed'; returns the unsubscribe function. */
			on(event, handler) {
				if (this.target) {
					this.target.addEventListener(event, handler);
					return () => this.target.removeEventListener(event, handler);
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
		const css$1 = "._7C7Hwq_veil{pointer-events:auto;background:var(--dsw-alias-bg-layer-3);justify-content:center;align-items:center;padding:24px;display:flex;position:fixed;inset:0}._7C7Hwq_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);border-radius:10px;flex-direction:column;gap:6px;width:min(320px,100%);padding:24px;display:flex}._7C7Hwq_title{color:var(--dsw-alias-label-primary);margin:0 0 2px;font-size:18px;font-weight:600;line-height:1.4}._7C7Hwq_subtitle{color:var(--dsw-alias-label-tertiary);margin:0 0 10px;font-size:12px;line-height:1.5}._7C7Hwq_label{color:var(--dsw-alias-label-primary);margin-top:8px;font-size:13px;font-weight:500;line-height:1.5}._7C7Hwq_input{border:1px solid var(--dsw-alias-border-l2);font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border-radius:6px;padding:7px 9px;font-size:13px;line-height:1.5;transition:border-color .13s}._7C7Hwq_input:hover{border-color:var(--dsw-alias-label-dimmed)}._7C7Hwq_input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}._7C7Hwq_error{color:var(--dsw-alias-state-error-primary);margin:8px 0 0;font-size:12px;line-height:1.5}._7C7Hwq_submit{border:1px solid var(--dsw-alias-button-info-fill);font:inherit;cursor:pointer;color:var(--dsw-alias-label-primary-foreground);background:var(--dsw-alias-button-info-fill);border-radius:6px;margin-top:14px;padding:7px 12px;font-size:13px;line-height:1.5;transition:background-color .13s,border-color .13s}._7C7Hwq_submit:hover:not(:disabled){border-color:var(--dsw-alias-button-info-hover);background:var(--dsw-alias-button-info-hover)}._7C7Hwq_submit:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}._7C7Hwq_submit:disabled{opacity:.5;cursor:default}@media (prefers-reduced-motion:reduce){._7C7Hwq_input,._7C7Hwq_submit{transition:none}}";
		const tagId$1 = "dsh-plugin-projects/auth-gate.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-projects";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var auth_gate_module_css_default = {
			"title": "_7C7Hwq_title",
			"label": "_7C7Hwq_label",
			"subtitle": "_7C7Hwq_subtitle",
			"card": "_7C7Hwq_card",
			"input": "_7C7Hwq_input",
			"submit": "_7C7Hwq_submit",
			"veil": "_7C7Hwq_veil",
			"error": "_7C7Hwq_error"
		};
		//#endregion
		//#region src/client/auth-gate.tsx
		/**
		* The shell.overlay auth gate: while the host guard is armed and no valid
		* token is stored, this entry covers the whole frame with a login card. On
		* success it stores the token, notifies authEvents, and unmounts itself out
		* of the way. Fail-open by design (see resolveGate). Uncontrolled form —
		* values are read through FormData at submit time.
		*/
		/** Sentinel while the initial gate probe is still in flight. */
		const PROBING = Symbol("probing");
		/** The inner view: probe, render the card, submit, get out of the way. */
		function AuthGateView(props) {
			const [gate, setGate] = (0, react.useState)(PROBING);
			const [error, setError] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				let alive = true;
				resolveGate(props.deps.fetch, props.deps.storage).then((decision) => {
					if (alive) setGate(decision);
				});
				return () => {
					alive = false;
				};
			}, [props.deps]);
			if (gate === PROBING || gate.phase === "open") return null;
			const onSubmit = (event) => {
				event.preventDefault();
				if (busy) return;
				const data = new FormData(event.currentTarget);
				const username = String(data.get("username") ?? "");
				const password = String(data.get("password") ?? "");
				setBusy(true);
				setError("");
				login(props.deps, username, password).then(() => {
					setGate({ phase: "open" });
				}).catch((err) => {
					setError(err instanceof ApiError ? err.message : String(err));
				}).finally(() => {
					setBusy(false);
				});
			};
			const t = props.t;
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
		const css = "._3Vi1bq_section{flex-direction:column;gap:18px;min-width:0;display:flex}._3Vi1bq_header{justify-content:space-between;align-items:flex-start;gap:12px;display:flex}._3Vi1bq_title{color:var(--dsw-alias-label-primary);margin:0;font-size:16px;font-weight:600;line-height:1.5}._3Vi1bq_identity{color:var(--dsw-alias-label-tertiary);margin:2px 0 0;font-size:12px;line-height:1.5}._3Vi1bq_note{color:var(--dsw-alias-label-secondary);margin:0;font-size:12px;line-height:1.6}._3Vi1bq_error{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px;line-height:1.6}._3Vi1bq_ok{color:var(--dsw-alias-label-secondary);word-break:break-all;margin:0;font-size:12px;line-height:1.6}._3Vi1bq_token{font-family:var(--dsw-alias-font-mono,ui-monospace, monospace);color:var(--dsw-alias-label-primary);user-select:all}._3Vi1bq_block{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:8px;flex-direction:column;gap:10px;padding:14px;display:flex}._3Vi1bq_blockTitle{color:var(--dsw-alias-label-primary);margin:0;font-size:13px;font-weight:600;line-height:1.5}._3Vi1bq_list{flex-direction:column;margin:0;padding:0;list-style:none;display:flex}._3Vi1bq_row{border-bottom:1px solid var(--dsw-alias-border-l2);justify-content:space-between;align-items:center;gap:8px;min-width:0;padding:8px 2px;display:flex}._3Vi1bq_row:last-child{border-bottom:0}._3Vi1bq_userMeta{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5;overflow:hidden}._3Vi1bq_dim{color:var(--dsw-alias-label-tertiary);font-size:12px}._3Vi1bq_slug{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}._3Vi1bq_rowActions{flex:none;gap:6px;display:flex}._3Vi1bq_form{flex-direction:column;gap:4px;max-width:360px;display:flex}._3Vi1bq_label{color:var(--dsw-alias-label-primary);margin-top:8px;font-size:13px;font-weight:500;line-height:1.5}._3Vi1bq_input{border:1px solid var(--dsw-alias-border-l2);font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border-radius:6px;padding:6px 8px;font-size:13px;line-height:1.5;transition:border-color .13s}._3Vi1bq_input:hover{border-color:var(--dsw-alias-label-dimmed)}._3Vi1bq_input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}._3Vi1bq_primary{border:1px solid var(--dsw-alias-button-info-fill);font:inherit;cursor:pointer;color:var(--dsw-alias-label-primary-foreground);background:var(--dsw-alias-button-info-fill);border-radius:6px;margin-top:12px;padding:6px 12px;font-size:13px;line-height:1.5;transition:background-color .13s,border-color .13s}._3Vi1bq_primary:hover:not(:disabled){border-color:var(--dsw-alias-button-info-hover);background:var(--dsw-alias-button-info-hover)}._3Vi1bq_secondary{border:1px solid var(--dsw-alias-border-l2);font:inherit;cursor:pointer;color:var(--dsw-alias-label-secondary);background:0 0;border-radius:6px;padding:4px 10px;font-size:12px;line-height:1.5;transition:color .13s,border-color .13s,background-color .13s}._3Vi1bq_secondary:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed);background:var(--dsw-alias-interactive-bg-hover)}._3Vi1bq_primary:focus-visible,._3Vi1bq_secondary:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}@media (prefers-reduced-motion:reduce){._3Vi1bq_input,._3Vi1bq_primary,._3Vi1bq_secondary{transition:none}}";
		const tagId = "dsh-plugin-projects/admin-section.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-projects";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var admin_section_module_css_default = {
			"token": "_3Vi1bq_token",
			"form": "_3Vi1bq_form",
			"title": "_3Vi1bq_title",
			"section": "_3Vi1bq_section",
			"identity": "_3Vi1bq_identity",
			"userMeta": "_3Vi1bq_userMeta",
			"header": "_3Vi1bq_header",
			"blockTitle": "_3Vi1bq_blockTitle",
			"secondary": "_3Vi1bq_secondary",
			"ok": "_3Vi1bq_ok",
			"row": "_3Vi1bq_row",
			"rowActions": "_3Vi1bq_rowActions",
			"primary": "_3Vi1bq_primary",
			"input": "_3Vi1bq_input",
			"note": "_3Vi1bq_note",
			"block": "_3Vi1bq_block",
			"dim": "_3Vi1bq_dim",
			"slug": "_3Vi1bq_slug",
			"label": "_3Vi1bq_label",
			"error": "_3Vi1bq_error",
			"list": "_3Vi1bq_list"
		};
		//#endregion
		//#region src/client/admin-section.tsx
		/**
		* The settings.section page carrying the project/user console. Admins manage
		* projects, one-shot users, one-time tokens and workspace sync here; signed-in
		* non-admins see their identity plus a denial note; anonymous visitors are
		* pointed at the login gate. All forms are uncontrolled (FormData on submit).
		*/
		/** The inner view: identity, denial, or the full admin console. */
		function AdminSectionView(props) {
			const t = props.t;
			const [user, setUser] = (0, react.useState)();
			const [projects, setProjects] = (0, react.useState)([]);
			const [users, setUsers] = (0, react.useState)([]);
			const [message, setMessage] = (0, react.useState)(null);
			const [oneTimeToken, setOneTimeToken] = (0, react.useState)("");
			const [loaded, setLoaded] = (0, react.useState)(false);
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
				(async () => {
					await api("/projects/api/admin/projects", { name });
				})().then(refresh).catch((err) => {
					setMessage({
						kind: "error",
						text: err instanceof ApiError ? err.message : String(err)
					});
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
										children: p.slug
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
													api("/projects/api/admin/tokens", { username: u.name }).then((res) => {
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
														await api("/projects/api/admin/disable", { username: u.name });
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
		//#region src/client/locales.ts
		/**
		* The 'projects' locale namespace: every user-facing string of the browser
		* half, zh first (fallback), en second. Declared into LocaleNamespaceMap so
		* registrations and the framework `t` seat type-check against these keys.
		*/
		const zh = {
			"gate.title": "登录 DSH",
			"gate.subtitle": "项目工作区访问",
			"gate.username": "用户名",
			"gate.password": "密码",
			"gate.submit": "登录",
			"gate.signingIn": "登录中…",
			"badge.signedInAs": "当前用户",
			"badge.logout": "退出登录",
			"section.title": "项目与用户",
			"admin.notSignedIn": "尚未登录：请先通过登录门禁完成认证，再打开本页。",
			"admin.denied": "仅管理员可管理项目与用户；当前账号没有这个权限。",
			"admin.logout": "退出登录",
			"admin.identity": "当前身份",
			"admin.role.admin": "管理员",
			"admin.role.user": "普通用户",
			"admin.projects": "项目",
			"admin.projectName": "项目名称",
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
			"gate.username": "Username",
			"gate.password": "Password",
			"gate.submit": "Sign in",
			"gate.signingIn": "Signing in…",
			"badge.signedInAs": "Signed in as",
			"badge.logout": "Sign out",
			"section.title": "Projects & Users",
			"admin.notSignedIn": "Not signed in: pass the login gate first, then reopen this page.",
			"admin.denied": "Only admins manage projects and users; this account lacks that right.",
			"admin.logout": "Sign out",
			"admin.identity": "Current identity",
			"admin.role.admin": "Admin",
			"admin.role.user": "Member",
			"admin.projects": "Projects",
			"admin.projectName": "Project name",
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
		/** Services required by this plugin (slots registry + locale dictionaries). */
		const inject = ["slots", "locale"];
		function AuthGateEntry(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AuthGateView, {
				t: props.t,
				deps: browserDeps
			});
		}
		function AdminSectionEntry(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AdminSectionView, {
				t: props.t,
				close: props.close,
				deps: browserDeps
			});
		}
		/**
		* Mount the projects surfaces into the Web Client.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register("projects", {
				zh,
				en
			}), "projects: dictionaries");
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
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.cjs.map