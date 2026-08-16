/**
 * The per-user AGENTS.md rendered into each user workspace. DSH automatically
 * injects the cwd-level AGENTS.md into the model context (subdir AGENTS.md
 * mechanism), so this file is the soft-constraint carrier — no code needed.
 */
/** Inputs for the AGENTS.md template. */
export interface AgentsMdInput {
    userName: string;
    projectName: string;
    /** Extra hard-ish rules appended verbatim. */
    customRules?: readonly string[];
}
/** Render the per-user AGENTS.md content. */
export declare function renderAgentsMd(input: AgentsMdInput): string;
