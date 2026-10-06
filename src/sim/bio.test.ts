import { describe, expect, it } from 'vitest'
import { appendBio, sanitizeBio, BIO_CAP, type BioEntry } from './bio'

describe('R4.1 生平 bio', () => {
  it('appendBio:无 bio 字段的成员可追加;LRU 只数普通条目', () => {
    const m: { bio?: BioEntry[] } = {}
    appendBio(m, { day: 1, kind: 'joined', text: '加入了公会。', permanent: true })
    for (let d = 2; d <= BIO_CAP + 3; d++) appendBio(m, { day: d, kind: 'level-up', text: '升到了 Lv' + d })
    // 普通条目 42 条 → 只留最近 40 条;永久条目不占额度、不修剪
    const normal = m.bio!.filter((b) => !b.permanent)
    expect(normal.length).toBe(BIO_CAP)
    expect(normal[0].day).toBe(4) // 最旧的 2 条普通条被挤掉
    expect(m.bio!.some((b) => b.permanent && b.kind === 'joined')).toBe(true)
  })

  it('appendBio:普通条目超限时挤掉最旧普通条,永久条夹在中间也不丢', () => {
    const m: { bio?: BioEntry[] } = {}
    for (let d = 1; d <= BIO_CAP; d++) appendBio(m, { day: d, kind: 'level-up', text: 'n' + d })
    appendBio(m, { day: 100, kind: 'first-kill', text: '首杀!', permanent: true })
    appendBio(m, { day: 101, kind: 'level-up', text: 'after-kill' })
    const normal = m.bio!.filter((b) => !b.permanent)
    expect(normal.length).toBe(BIO_CAP)
    expect(normal[normal.length - 1].text).toBe('after-kill')
    expect(normal[0].text).toBe('n2') // n1 被挤掉
    expect(m.bio!.some((b) => b.text === '首杀!')).toBe(true)
  })

  it('sanitizeBio:非法 kind/坏条目逐条丢弃;缺失与空数组=undefined', () => {
    expect(sanitizeBio(undefined)).toBeUndefined()
    expect(sanitizeBio([])).toBeUndefined()
    expect(sanitizeBio('nope')).toBeUndefined()
    const ok: BioEntry = { day: 3, kind: 'story', text: '📖 一段故事。' }
    const kept = sanitizeBio([
      ok,
      { day: 1, kind: 'hacker' as never, text: 'bad kind' },
      { day: Number.NaN, kind: 'scar', text: 'bad day' },
      { day: 2, kind: 'wish', text: 42 as never },
      null,
      'str',
    ])
    expect(kept).toEqual([ok])
    // 普通条目规范化掉 permanent 键(永久枚举外的 kind 不允许借 permanent 逃逸 LRU)
    const sneaky = sanitizeBio([{ day: 1, kind: 'level-up', text: 'x', permanent: true }])
    expect(sneaky && sneaky[0].permanent).toBeUndefined()
  })
})
