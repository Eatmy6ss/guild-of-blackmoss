import { expect, test } from 'vitest'
import { migrate, exportSave, importSave, SAVE_VERSION } from './save'
import { createRng, createStatefulRng } from '../sim/rng'
import { generateMember } from '../sim/gen'

const oldSave = () => ({ version: 18, members: [generateMember('guard', 5, 5)], inventory: [], memorial: [], manual: ['grush'],
  kingdom: { active: [], completed: [] }, gold: 700, blessing: 9, recruitCooldown: 2, towerBest: 6, lastSeen: 1727656000000,
  day: 9, chronicle: [], buildings: { training: 2 }, potions: { heal: 2, fury: 3 }, unlockedHybrids: [], dungeonMastery: {},
  trainingReady: true, starMarrow: 4, pendingRelics: [], healingMastery: { str: 3 }, statistics: undefined,
  rareHuntNext: { mult: 1.5, rewardMult: 2 },
})

test('v18→v19 不丢资产/训练/稀有猎杀；相同旧档迁移到稳定序列，所有旧版本可逐级升级', () => {
  const data = oldSave(), before = structuredClone(data), a = migrate(data), b = migrate(data)
  expect(data).toEqual(before)
  expect(a).toEqual(b)
  expect(a.version).toBe(SAVE_VERSION)
  for (const key of ['members', 'inventory', 'manual', 'gold', 'blessing', 'starMarrow', 'healingMastery', 'rareHuntNext', 'trainingReady'] as const) expect(a[key]).toEqual(data[key])
  for (let version = 1; version < SAVE_VERSION; version++) expect(migrate({ ...data, version }).version).toBe(SAVE_VERSION)
  for (const bad of [undefined, NaN, -1, 1.5, Infinity, 0x100000000]) {
    expect(migrate({ ...a, rngState: bad }).rngState).toBe(a.rngState)
  }
})

test('随机序列保留旧 mulberry32 结果；状态 0/高位值可导出导入并逐次续接', () => {
  for (const seed of [0, 5, 0x80000000, 0xffffffff]) {
    const expected = createRng(seed), running = createStatefulRng(seed)
    for (let i = 0; i < 17; i++) expect(running()).toBe(expected())
    const saved = migrate({ ...migrate(oldSave()), rngState: running.state() })
    const imported = importSave(exportSave(saved))!
    expect(imported.rngState).toBe(running.state())
    const resumed = createStatefulRng(imported.rngState)
    for (let i = 0; i < 100; i++) {
      expect(resumed()).toBe(running())
      expect(resumed.state()).toBe(running.state())
    }
  }
})
