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
  const dm = data.members[0] as unknown as Record<string, unknown>, bm = before.members[0] as unknown as Record<string, unknown>
  console.log('新增成员键:', Object.keys(dm).filter(k => !(k in bm)))
  console.log('变化成员键:', Object.keys(dm).filter(k => k in bm && JSON.stringify(dm[k]) !== JSON.stringify(bm[k])).map(k => k + ':' + JSON.stringify(bm[k]) + '→' + JSON.stringify(dm[k])))
  console.log('新增顶层键:', Object.keys(data).filter(k => !(k in before)))
  expect(data).toEqual(before)
  expect(a).toEqual(b)
  expect(a.version).toBe(SAVE_VERSION)
  // R5.3d(U33⑥):members 不再严格相等——迁移合法地给每位在世成员补 weaponLearned;
  // 资产不丢语义改为:除 weaponLearned 外逐字段相等。
  for (const am of a.members) {
    const dm = (data.members as unknown as Record<string, unknown>[]).find((x) => x.id === am.id)!
    const { weaponLearned: _wl, ...amRest } = am
    expect(amRest).toEqual(dm)
    expect(am.weaponLearned).toEqual([])
  }
  for (const key of ['inventory', 'manual', 'gold', 'blessing', 'starMarrow', 'healingMastery', 'rareHuntNext', 'trainingReady'] as const) expect(a[key]).toEqual(data[key])
  for (let version = 1; version <= 19; version++) expect(migrate({ ...data, version }).version).toBe(SAVE_VERSION)
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
