import { describe, expect, it } from 'vitest'
import { renderAgentsMd } from '../src/agents-md.ts'

describe('AGENTS.md rendering', () => {
  it('mentions the user, the project, and the stay-in-this-directory rule', () => {
    const md = renderAgentsMd({ userName: 'bob', projectName: 'app' })
    expect(md).toContain('bob')
    expect(md).toContain('app')
    expect(md).toContain('只在本目录（current working directory）内工作')
  })

  it('explains that symlinks are the project files', () => {
    const md = renderAgentsMd({ userName: 'bob', projectName: 'app' })
    expect(md).toContain('软链接')
    expect(md).toContain('项目文件')
  })

  it('keeps the default rules when no custom constraints are given', () => {
    const md = renderAgentsMd({ userName: 'bob', projectName: 'app' })
    expect(md).toContain('不要离开')
    expect(md).toContain('绝对路径')
  })

  it('appends custom constraints when provided', () => {
    const md = renderAgentsMd({
      userName: 'bob',
      projectName: 'app',
      customRules: ['不要运行 pnpm install'],
    })
    expect(md).toContain('不要运行 pnpm install')
  })

  it('tells the model not to reveal or copy content outside the workspace', () => {
    const md = renderAgentsMd({ userName: 'bob', projectName: 'app' })
    expect(md).toContain('不要读取、展示或复制工作区之外的任何文件或目录的内容')
  })

  it('tells the model not to run commands that escape the workspace', () => {
    const md = renderAgentsMd({ userName: 'bob', projectName: 'app' })
    expect(md).toContain('不要执行会离开本工作区的命令')
    expect(md).toContain('不要用绝对路径读写或删除工作区之外的文件')
  })

  it('tells the model to refuse out-of-scope requests explicitly', () => {
    const md = renderAgentsMd({ userName: 'bob', projectName: 'app' })
    expect(md).toContain('明确拒绝并说明本工作区的边界')
  })
})
