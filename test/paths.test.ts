import { describe, expect, it } from 'vitest'
import {
  projectWorkspacePath,
  userWorkspacePath,
  planUserWorkspace,
  isInside,
} from '../src/paths.ts'

const root = '/ws'

describe('workspace path derivation', () => {
  it('project workspace is <root>/<projectSlug>', () => {
    expect(projectWorkspacePath(root, 'My App')).toBe('/ws/my-app')
  })

  it('user workspace is <root>/<projectSlug>-<userSlug>', () => {
    // 张 = U+5F20, 三 = U+4E09
    expect(userWorkspacePath(root, 'My App', '张三')).toBe('/ws/my-app-5f204e09')
  })

  it('isInside rejects traversal outside the base', () => {
    expect(isInside('/ws/proj', '/ws/proj/sub/file.txt')).toBe(true)
    expect(isInside('/ws/proj', '/ws/proj')).toBe(true)
    expect(isInside('/ws/proj', '/ws/other/file.txt')).toBe(false)
    expect(isInside('/ws/proj', '/ws/proj/../../etc/passwd')).toBe(false)
  })
})

describe('user workspace plan', () => {
  it('symlinks every top-level project entry except reserved names', () => {
    const plan = planUserWorkspace({
      root,
      projectName: 'app',
      userName: 'bob',
      projectEntries: ['src', 'docs', 'README.md', 'AGENTS.md', '.hidden'],
      reserved: ['AGENTS.md'],
    })
    expect(plan.userWorkspacePath).toBe('/ws/app-bob')
    expect(plan.symlinks.map((s) => s.name)).toEqual(['src', 'docs', 'README.md', '.hidden'])
    expect(plan.symlinks[0]).toEqual({
      name: 'src',
      linkPath: '/ws/app-bob/src',
      targetPath: '/ws/app/src',
    })
  })

  it('places the user workspace BESIDE an explicitly bound project directory', () => {
    const plan = planUserWorkspace({
      root,
      projectName: 'app',
      userName: 'bob',
      projectWorkspacePath: '/elsewhere/proj',
      projectEntries: ['src'],
      reserved: ['AGENTS.md'],
    })
    expect(plan.userWorkspacePath).toBe('/elsewhere/proj-bob')
    expect(plan.symlinks[0]).toEqual({
      name: 'src',
      linkPath: '/elsewhere/proj-bob/src',
      targetPath: '/elsewhere/proj/src',
    })
  })

  it('keeps reserved entries out of the symlink set', () => {
    const plan = planUserWorkspace({
      root,
      projectName: 'app',
      userName: 'bob',
      projectEntries: ['AGENTS.md'],
      reserved: ['AGENTS.md'],
    })
    expect(plan.symlinks).toEqual([])
  })

  it('skips entries whose name is not a safe single path segment', () => {
    const plan = planUserWorkspace({
      root,
      projectName: 'app',
      userName: 'bob',
      projectEntries: ['ok', 'a/b', '..', '.'],
      reserved: [],
    })
    expect(plan.symlinks.map((s) => s.name)).toEqual(['ok'])
  })
})
