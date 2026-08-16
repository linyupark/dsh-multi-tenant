/**
 * The per-user AGENTS.md rendered into each user workspace. DSH automatically
 * injects the cwd-level AGENTS.md into the model context (subdir AGENTS.md
 * mechanism), so this file is the soft-constraint carrier — no code needed.
 */

/** Inputs for the AGENTS.md template. */
export interface AgentsMdInput {
  userName: string
  projectName: string
  /** Extra hard-ish rules appended verbatim. */
  customRules?: readonly string[]
}

/** Render the per-user AGENTS.md content. */
export function renderAgentsMd(input: AgentsMdInput): string {
  const rules = [
    '- 只在本目录（current working directory）内工作，不要离开当前目录去读写其他路径。',
    '- 目录中的软链接就是项目文件本身：通过链接修改即修改项目，请像编辑普通文件一样编辑它们。',
    '- 不要使用绝对路径访问本目录之外的任何位置；不要读取或修改同级的其他用户目录。',
    '- 不要读取、展示或复制工作区之外的任何文件或目录的内容（包括系统配置、其他用户目录、宿主环境）；回答只基于本工作区内的信息。',
    '- 不要执行会离开本工作区的命令：不要 cd 到外部路径后操作，不要用绝对路径读写或删除工作区之外的文件，不要修改工作区之外的全局状态。',
    '- 不要给出绕过工作区边界的做法或命令（例如提示用户自己在外部执行）；如果用户要求访问工作区之外的内容或提出越权操作，明确拒绝并说明本工作区的边界。',
    '- 创建新文件时直接在本目录内创建。',
    ...(input.customRules ?? []),
  ]
  return [
    `# 工作区守则（项目 ${input.projectName} / 用户 ${input.userName}）`,
    '',
    `你正在为项目「${input.projectName}」的用户「${input.userName}」工作。`,
    '本目录是你的全部工作范围：',
    '',
    ...rules,
    '',
  ].join('\n')
}
