import { describe, expect, it } from 'vitest'
import { migrate, SAVE_VERSION } from './save'

// R3/W2 验收:存档 v25 weaponTraining(训练场武器专修已学族)——迁移链 24→25 补空,畸形档安全回落。

const MINIMAL = {
  members: [{ id: 'm1', name: '测试', job: 'guard', level: 5, nature: {}, personality: {}, attrs: {}, hp: 1, equipment: {}, alive: true, exp: 0, bonds: {} }],
  items: {}, itemSeq: 0,
  inventory: [], memorial: [], manual: [], protectOn: true,
}

describe('weaponTraining 存档迁移(v25)', () => {
  it('v24 → v25 自动补空已学族表', () => {
    const out = migrate({ version: 24, ...MINIMAL })
    expect(out.version).toBe(SAVE_VERSION)
    expect(Array.isArray(out.weaponTraining)).toBe(true)
    expect(out.weaponTraining).toEqual([])
  })

  it('v1 老档一路迁上来同样补齐', () => {
    const out = migrate({ version: 1, ...MINIMAL })
    expect(out.version).toBe(SAVE_VERSION)
    expect(out.weaponTraining).toEqual([])
  })

  it('已学族保留,非法条目被滤除', () => {
    const out = migrate({ version: 25, weaponTraining: ['polearm', 'not-a-family', 42], ...MINIMAL })
    expect(out.weaponTraining).toEqual(['polearm'])
  })
})
