import { describe, expect, it } from 'vitest'
import { migrate, SAVE_VERSION } from './save'

// R5.3d 验收(U33⑥):存档 v26 按人学武器——v25 公会级已学族迁移发给每位在世成员,公会字段删除。

const MINIMAL = {
  members: [
    { id: 'm1', name: '甲', job: 'guard', level: 5, nature: {}, personality: {}, attrs: {}, hp: 1, equipment: {}, alive: true, exp: 0, bonds: {} },
    { id: 'm2', name: '乙', job: 'priest', level: 5, nature: {}, personality: {}, attrs: {}, hp: 1, equipment: {}, alive: true, exp: 0, bonds: {} },
    { id: 'm3', name: '丙', job: 'ranger', level: 5, nature: {}, personality: {}, attrs: {}, hp: 0, equipment: {}, alive: false, exp: 0, bonds: {} },
  ],
  items: {}, itemSeq: 0,
  inventory: [], memorial: [], manual: [], protectOn: true,
}

describe('weaponLearned 存档迁移(v26)', () => {
  it('v25 → v26:公会级已学族发给每位在世成员(非法族滤除),亡者不发,公会字段删除', () => {
    const out = migrate({ version: 25, weaponTraining: ['polearm', 'not-a-family'], ...MINIMAL })
    expect(out.version).toBe(SAVE_VERSION)
    expect('weaponTraining' in out).toBe(false)
    expect(out.members[0].weaponLearned).toEqual(['polearm'])
    expect(out.members[1].weaponLearned).toEqual(['polearm'])
    // 亡者不发(U33⑥ 规格:发给每位在世成员)
    expect(out.members[2].alive).toBe(false)
    expect(out.members[2].weaponLearned ?? []).not.toContain('polearm')
  })

  it('v1 老档一路迁上来:在世成员 weaponLearned 空表', () => {
    const out = migrate({ version: 1, ...MINIMAL })
    expect(out.version).toBe(SAVE_VERSION)
    expect(out.members.filter((m: { alive: boolean }) => m.alive).every((m: { weaponLearned?: string[] }) => Array.isArray(m.weaponLearned) && m.weaponLearned.length === 0)).toBe(true)
  })

  it('已有个人 weaponLearned 的成员不被公会表覆盖', () => {
    const m = { ...MINIMAL.members[0], weaponLearned: ['bow'] }
    const out = migrate({ version: 25, weaponTraining: ['polearm'], ...MINIMAL, members: [m] })
    expect(out.members[0].weaponLearned).toEqual(['bow'])
  })
})
