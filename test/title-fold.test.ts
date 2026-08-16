import { describe, expect, it } from 'vitest'
import { applyTitleFold, type TitleFoldObservation, type TitleFoldRow } from '../src/title-fold.ts'

const row = (id: string, title?: string): TitleFoldRow => (title === undefined ? { id } : { id, title })

describe('applyTitleFold', () => {
  it('fills the durable title on cold rows', () => {
    const out = applyTitleFold(
      [row('s1'), row('s2')],
      [{ sessionId: 's1', status: 'fulfilled', value: { title: { title: '帮我写个脚本' } } }],
    )
    expect(out).toEqual([row('s1', '帮我写个脚本'), row('s2')])
  })

  it('lets the durable fold supersede a stale header title', () => {
    const out = applyTitleFold(
      [row('s1', '旧标题')],
      [{ sessionId: 's1', status: 'fulfilled', value: { title: { title: '新标题' } } }],
    )
    expect(out).toEqual([row('s1', '新标题')])
  })

  it('keeps the row untouched on rejected observations and title-less logs', () => {
    const out = applyTitleFold(
      [row('s1', '保留'), row('s2')],
      [
        { sessionId: 's1', status: 'rejected', reason: 'boom' } as unknown as TitleFoldObservation,
        { sessionId: 's2', status: 'fulfilled', value: {} },
      ],
    )
    expect(out).toEqual([row('s1', '保留'), row('s2')])
  })

  it('ignores empty-string titles and preserves row order', () => {
    const out = applyTitleFold(
      [row('a'), row('b')],
      [
        { sessionId: 'b', status: 'fulfilled', value: { title: { title: 'B' } } },
        { sessionId: 'a', status: 'fulfilled', value: { title: { title: '' } } },
      ],
    )
    expect(out).toEqual([row('a'), row('b', 'B')])
  })
})
