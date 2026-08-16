/**
 * The restricted-session guard section for project users' agents.
 *
 * Layers of the tenant boundary (strongest first):
 *  1. THIS module — host-side `systemPrompt.section()` contribution under the
 *     agent's own context: the guard becomes part of the system prompt body
 *     itself (above user-role AGENTS.md reminders in instruction strength).
 *  2. The per-user workspace AGENTS.md — the official agent-instructions
 *     channel (system-reminder framed, durable user-role baseline).
 *
 * Registration lives in the host half (`src/index.ts`, the agent-scoped
 * `systemPrompt` inject next to the permission-command shadow); this module
 * keeps the section identity and text unit-testable.
 */
/** Unique section name (duplicate registrations throw — keep it namespaced). */
export declare const GUARD_SECTION_NAME = "projects.restricted-privacy";
/**
 * Prompt order per the dsh-system-prompt conventions: 0 is the deployment
 * persona, tool guidance lives at 100–199 — the guard renders right after
 * the persona, before tool guidance.
 */
export declare const GUARD_SECTION_ORDER = 50;
/**
 * The guard text injected into the system prompt of every agent whose
 * session cwd is a project-user workspace. Chinese, deployment-language
 * consistent with the AGENTS.md rules.
 */
export declare function restrictedGuardSectionText(): string;
