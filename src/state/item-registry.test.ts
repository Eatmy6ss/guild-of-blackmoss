import { createRun, startTower } from '../../scripts/run-test-compat'
import { describe, expect, it, vi } from 'vitest'
import { generateMember, maxHpOf } from '../sim/gen'
import { rollDrop, equipmentStats } from '../sim/loot'
import { createRng } from '../sim/rng'
import { toCombatant } from '../sim/combat'


import { settleEncounter } from '../sim/settlement'
import { BLACKMOSS } from '../data/dungeons'
import { newKingdomState } from '../sim/kingdom'
import { newStatistics } from '../sim/statistics'
import { migrate, exportSave, importSave, saveGuild, loadGuildSave, SAVE_VERSION } from './save'
import {
  createGuildItems, itemStateFromSave, serializeGuildItems, resolveMembers, itemOwnershipErrors,
  addInventoryItems, equipRegisteredItem, removeInventoryItem, redeemRegisteredRelic, applyEncounterItems,
} from './item-registry'
import type { ItemInstance } from '../sim/types'

const roster = () => (['guard', 'priest', 'ranger'] as const).map((job, i) => generateMember(job, 5, 90200 + i, { race: 'human' }))
const gear = (baseId: string, id: string): ItemInstance => ({ ...rollDrop(baseId, createRng(93)), id })
const contents = (items: ItemInstance[]) => items.map(({ id: _id, ...item }) => JSON.stringify(item)).sort()
function oldSave() {
  return { version: 19, members: roster(), inventory: [] as ItemInstance[], pendingRelics: [] as { item: ItemInstance; hero: string; redeem: number }[],
    rngState: 0x80000000, statistics: newStatistics(8), trainingReady: true, kingdom: newKingdomState(),
    rareHuntNext: { mult: 1.5, rewardMult: 2 }, gold: 900, blessing: 12, starMarrow: 7, healingMastery: { str: 5 },
    memorial: [], manual: ['grush'], protectOn: true, recruitCooldown: 2, towerBest: 6, lastSeen: Date.now(),
    day: 8, chronicle: [], buildings: { training: 2 }, potions: { heal: 3, fury: 4 }, unlockedHybrids: [], dungeonMastery: {},
  }
}

describe('物品注册表与唯一归属 I6', () => {
  it('v19 重复 ID 按装备/遗物/仓库优先，完整保留每份内容，迁移不重掷或修改输入', () => {
    const data = oldSave()
    data.members[0].equipment = { weapon: gear('wpn-t1-sword', 'collision'), armor: gear('arm-t1-mail', 'armor') }
    data.members[1].equipment.weapon = gear('wpn-t2-bow', 'collision')
    data.pendingRelics = [{ item: gear('wpn-t3-dawn', 'collision'), hero: '旧英雄', redeem: 123 }]
    data.inventory = [gear('wpn-t3-dawn', 'collision'), { id: 'legacy', baseId: 'trk-t1-band', rolls: [{ affixId: 'aff-hp', value: 17.13 }] }]
    const originalItems = [...data.members.flatMap(m => Object.values(m.equipment)), ...data.inventory, ...data.pendingRelics.map(r => r.item)]
    const before = structuredClone(data), warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('迁移不能抽样') })
    const migrated = migrate(data)
    expect(migrated.version).toBe(SAVE_VERSION)
    expect(contents(Object.values(migrated.items))).toEqual(contents(originalItems))
    expect(Object.keys(migrated.items)).toHaveLength(6)
    expect(migrated.inventory).toHaveLength(4)
    expect(migrated.members[1].equipment).toEqual({})
    expect(migrated.pendingRelics).toEqual([])
    expect(itemOwnershipErrors(itemStateFromSave(migrated))).toEqual([])
    for (const key of ['gold', 'blessing', 'starMarrow', 'rngState', 'kingdom', 'manual', 'statistics', 'trainingReady', 'rareHuntNext', 'healingMastery'] as const) expect(migrated[key]).toEqual(data[key])
    expect(data).toEqual(before)
    expect(warn).toHaveBeenCalledOnce()
    random.mockRestore(); warn.mockRestore()
  })

  it('逐级迁移 v1–v19；正常 v20 读写后身份、物品属性和序号不变', () => {
    for (let version = 1; version <= 19; version++) {
      const data = oldSave(); data.version = version
      data.members[0].equipment.weapon = gear('wpn-t1-sword', 'weapon')
      const saved = migrate(data), imported = importSave(exportSave(saved))!
      expect(saved.version).toBe(SAVE_VERSION)
      expect(imported).toEqual(saved)
      expect(contents(Object.values(saved.items))).toEqual(contents([data.members[0].equipment.weapon]))
      expect(itemOwnershipErrors(itemStateFromSave(saved))).toEqual([])
    }
  })

  it('v20 修复重复引用、缺失引用、孤儿及回绕序号；有警告且再次读档无需重复修复', () => {
    const data = oldSave(); data.members[0].equipment.weapon = gear('wpn-t1-sword', 'weapon')
    data.inventory = [gear('arm-t1-mail', 'armor'), gear('trk-t1-band', 'trinket')]
    const saved = migrate(data), uid = saved.members[0].equipment.weapon!
    saved.members[1].equipment.weapon = uid
    saved.members[2].equipment.armor = 'missing'
    saved.pendingRelics.push({ uid, hero: '冲突遗物', redeem: 91 })
    saved.inventory.push(uid)
    saved.items.it_9 = gear('wpn-t3-dawn', 'bad-id')
    saved.itemSeq = 1
    const before = structuredClone(saved), warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const repaired = migrate({ ...saved })
    expect(warn).toHaveBeenCalledOnce()
    expect(saved).toEqual(before)
    expect(Object.keys(repaired.items)).toHaveLength(7)
    expect(repaired.members[1].equipment).toEqual({})
    expect(repaired.members[2].equipment).toEqual({})
    expect(repaired.inventory).toContain('it_9')
    expect(itemOwnershipErrors(itemStateFromSave(repaired))).toEqual([])
    warn.mockClear()
    expect(migrate({ ...repaired })).toEqual(repaired)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('换装/卸装原子转移，非法或过期选择不丢装备；模拟视图解析同一注册物品', () => {
    const members = roster(); members[0].equipment.weapon = gear('wpn-t1-sword', 'old')
    const original = createGuildItems(members, [gear('wpn-t2-bow', 'new'), gear('arm-t1-mail', 'armor')])
    const uid = original.inventory[0], old = original.equipment[members[0].id].weapon!
    expect(equipRegisteredItem(original, members[0].id, 'weapon', 'missing')).toBe(original)
    expect(equipRegisteredItem(original, members[0].id, 'weapon', original.inventory[1])).toBe(original)
    const equipped = equipRegisteredItem(original, members[0].id, 'weapon', uid)
    expect(equipped.inventory).toContain(old)
    expect(equipped.inventory).not.toContain(uid)
    expect(equipRegisteredItem(equipped, members[1].id, 'weapon', uid)).toBe(equipped)
    expect(equipRegisteredItem(equipped, members[0].id, 'weapon', uid)).toBe(equipped)
    expect(resolveMembers(members, equipped)[0].equipment.weapon).toBe(equipped.items[uid])
    const removed = equipRegisteredItem(equipped, members[0].id, 'weapon', '')
    expect(removed.inventory.filter(x => x === uid)).toHaveLength(1)
    expect(equipRegisteredItem(removed, members[0].id, 'weapon', '')).toBe(removed)
    expect(itemOwnershipErrors(removed)).toEqual([])
    expect(original.equipment[members[0].id].weapon).toBe(old)
  })

  it('阵亡/保险与新掉落进入同一登记；赎回原身份、资金不足与重复操作不发奖', () => {
    for (const source of ['dungeon', 'tower'] as const) for (const insured of [false, true]) {
      const members = roster(); members[0].equipment.weapon = gear('wpn-t1-sword', 'weapon')
      const state = createGuildItems(members), resolved = resolveMembers(members, state), uid = state.equipment[members[0].id].weapon!
      const run = source === 'dungeon' ? createRun(resolved, BLACKMOSS, BLACKMOSS.branches[0].id, 53) : startTower(resolved, 53)
      if (source === 'tower') (run as ReturnType<typeof startTower>).insuredFloor = insured
      run.battle!.status = 'guild-win'
      const victim = run.battle!.combatants.find(c => c.memberId === resolved[0].id)!
      victim.alive = false; victim.hp = 0
      const outcome = settleEncounter({ source, run, guild: { factLedger: { nextId: 1, facts: [] }, members: resolved, manual: [], kingdom: newKingdomState(), dungeonMastery: {}, towerBest: 0, recruitCooldown: 0, day: 8, buildings: {}, chronicle: [] } } as Parameters<typeof settleEncounter>[0], () => 0)!
      const applied = applyEncounterItems(state, outcome.guild.members, outcome.loot.items, outcome.consequences.relics)
      expect(itemOwnershipErrors(applied.state)).toEqual([])
      expect(applied.state.equipment[members[0].id]).toEqual({})
      expect(applied.state.items[uid]).toBe(state.items[uid])
      if (source === 'tower' && insured) expect(applied.state.inventory).toContain(uid)
      else {
        const relic = applied.state.pendingRelics[0]
        expect(relic.uid).toBe(uid)
        expect(redeemRegisteredRelic(applied.state, uid, relic.redeem - 1)).toBeNull()
        const redeemed = redeemRegisteredRelic(applied.state, uid, relic.redeem)!
        expect(redeemed.state.inventory).toContain(uid)
        expect(redeemRegisteredRelic(redeemed.state, uid, 9999)).toBeNull()
        expect(itemOwnershipErrors(redeemed.state)).toEqual([])
      }
    }
  })

  it('变卖/拆解销毁登记，重新入库及导入后的编号永不复用；物品来源不改变战斗属性', () => {
    const members = roster(); members[0].equipment.weapon = gear('wpn-t3-dawn', 'weapon')
    const beforeUnit = toCombatant(members[0]), beforeStats = equipmentStats(members[0].equipment)
    let state = createGuildItems(members)
    for (let i = 0; i < 100; i++) {
      const added = addInventoryItems(state, [gear('wpn-t3-dawn', 'same-source-id')]), uid = added.items[0].id
      expect(Number(uid.slice(3))).toBe(state.itemSeq)
      const consumed = removeInventoryItem(added.state, uid)!
      expect(consumed.state.items[uid]).toBeUndefined()
      expect(removeInventoryItem(consumed.state, uid)).toBeNull()
      state = consumed.state
      expect(itemOwnershipErrors(state)).toEqual([])
    }
    const stored = { ...migrate(oldSave()), ...serializeGuildItems(state, members) }
    const restored = importSave(exportSave(stored))!, projected = resolveMembers(restored.members, itemStateFromSave(restored))
    expect(restored.itemSeq).toBe(102)
    expect(equipmentStats(projected[0].equipment)).toEqual(beforeStats)
    expect({ ...toCombatant(projected[0]), id: beforeUnit.id }).toEqual(beforeUnit)
    expect(maxHpOf(projected[0])).toBe(maxHpOf(members[0]))
    expect(typeof restored.members[0].equipment.weapon).toBe('string')
    expect(Object.values(restored.items)).toHaveLength(1)
  })

  it('保存/读档只使用临时 storage，坏归属不会覆盖好档或备份', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) })
    const data = oldSave(); data.members[0].equipment.weapon = gear('wpn-t1-sword', 'weapon')
    const saved = migrate(data)
    saveGuild(saved)
    const good = store.get('guild-game-save-v1')
    expect(loadGuildSave()!.members).toEqual(saved.members)
    const invalid = structuredClone(saved)
    invalid.inventory.push(invalid.members[0].equipment.weapon!)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    saveGuild(invalid)
    expect(warn).toHaveBeenCalledOnce()
    expect(store.get('guild-game-save-v1')).toBe(good)
    expect(store.has('guild-game-save-v1.bak')).toBe(false)
    warn.mockRestore(); vi.unstubAllGlobals()
  })
})
