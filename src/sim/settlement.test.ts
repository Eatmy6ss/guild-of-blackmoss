import { createRun, startStep, advanceRun, startTower, startTowerFloor } from '../../scripts/run-test-compat'
import { describe, expect, it, vi } from 'vitest'
import { BLACKMOSS, THORNHOLD } from '../data/dungeons'
import { ECONOMY } from '../data/economy'
import { ITEM_BASES } from '../data/items'
import { baseEffects } from '../data/base'
import { markPermadeath, settleGrowth } from './run'
import { towerGold, towerExp, towerItemTier } from './tower'
import { generateMember, xpNeeded } from './gen'
import { createRng } from './rng'
import { newKingdomState } from './kingdom'
import { applyDeathShock, applyVictory } from './morale'
import { rollDrop } from './loot'
import { chronicleRaw, seedChronicle } from './chronicle'
import { EMPTY_LEDGER, markTold, normalizeLedger } from './fact-ledger'
import { tellExpedition } from './storyteller'
import { settleEncounter, type EncounterGuild, type EncounterInput } from './settlement'

function roster() {
  return (['guard', 'priest', 'ranger', 'mage'] as const).map((job, i) => {
    const m = generateMember(job, 5, 300930 + i, { race: 'human' })
    m.morale = 60
    m.trait = 'cool'
    m.wish = { kind: 'tower', target: '999', text: '遥远的目标' }
    return m
  })
}

function guild(members = roster()): EncounterGuild {
  return { members, manual: [], kingdom: newKingdomState(), dungeonMastery: {}, towerBest: 0,
    recruitCooldown: 2, day: 7, buildings: {}, factLedger: { ...EMPTY_LEDGER }, chronicle: [{ seq: 15, day: 6, text: '既有故事' }] }
}

function fixture(source: 'dungeon' | 'tower', status = 'retreated' as 'guild-win' | 'retreated' | 'guild-wipe'): EncounterInput {
  const g = guild()
  const run = source === 'dungeon' ? createRun(g.members, BLACKMOSS, BLACKMOSS.branches[0].id, 53)
    : startTower(g.members, 53, { heal: 5, fury: 4 })
  run.battle!.status = status
  const victim = run.battle!.combatants.find(c => c.memberId === g.members[0].id)!
  victim.alive = false; victim.hp = 0
  return source === 'dungeon' ? { source, run: run as ReturnType<typeof createRun>, guild: g }
    : { source, run: run as ReturnType<typeof startTower>, guild: g }
}

describe('统一遭遇结算', () => {
  it('副本/高塔结算保留说书水位和模板记忆，输入不变且旧事实不会再次拼故事', () => {
    for (const source of ['dungeon', 'tower'] as const) {
      const f = fixture(source)
      f.guild.factLedger = { nextId: 10, facts: [
        { id: 1, day: 1, kind: 'scar', actors: ['old'], names: { old: '上一趟英雄' }, refs: { dungeonId: 'blackmoss', scarNth: 2 } },
      ], toldThrough: 8, expeditionStart: 10, recentTemplates: { 'scar-survive': [1, 3] } }
      const before = JSON.stringify(f)
      const o = settleEncounter(f, () => 0.99)!
      expect(JSON.stringify(f)).toBe(before)
      expect(o.guild.factLedger).toMatchObject({ toldThrough: 8, expeditionStart: 10, recentTemplates: { 'scar-survive': [1, 3] } })
      expect(o.guild.factLedger.facts).not.toBe(f.guild.factLedger.facts)
      expect(o.guild.factLedger.recentTemplates?.['scar-survive']).not.toBe(f.guild.factLedger.recentTemplates?.['scar-survive'])
      const restored = normalizeLedger(JSON.parse(JSON.stringify(o.guild.factLedger)))
      const story = tellExpedition(restored, () => 0, { fromId: restored.toldThrough!, startId: restored.expeditionStart! })
      expect(story?.factIds).not.toContain(1)
      markTold(o.guild.factLedger, 'scar-survive', 5)
      expect(JSON.stringify(f)).toBe(before)
    }
  })

  it('I9：同样的阵亡在副本和高塔都有真实冲击、创伤、遗物与编年史，不只返回空键', () => {
    const outcomes = (['dungeon', 'tower'] as const).map(source => {
      const f = fixture(source)
      f.guild.members[0].equipment.weapon = rollDrop('wpn-t1-sword', createRng(5))
      return settleEncounter(f, () => 0)!
    })
    expect(Object.keys(outcomes[0].consequences).sort()).toEqual(Object.keys(outcomes[1].consequences).sort())
    for (const o of outcomes) {
      const victim = o.guild.members[0], witness = o.guild.members[1], reserve = o.guild.members[3]
      expect(victim.alive).toBe(false)
      expect(victim.hp).toBe(0)
      expect(victim.equipment.weapon).toBeUndefined()
      expect(o.deaths[0].legacy).toBeDefined()
      expect(o.consequences.relics).toHaveLength(1)
      expect(o.consequences.deathShock).toHaveLength(2)
      expect(witness.morale).toBeLessThan(60)
      expect(witness.bonds[victim.id]).toBeGreaterThan(0)
      expect(o.consequences.scars.every(x => x.memberId !== victim.id && x.memberId !== reserve.id)).toBe(true)
      expect(o.consequences.chronicle.some(x => x.text.includes(victim.name) && x.text.includes('酒馆里那晚没有人说话'))).toBe(true)
      expect(o.consequences.growth.bonds).toHaveLength(1)
      expect(reserve.morale).toBe(60)
      expect(reserve.bonds).toEqual({})
      expect(o.blessing).toBe(baseEffects({}).blessingPerDeath)
    }
  })

  it('纯结算：同输入与随机序列逐字节一致，输入/全局编年史序号和 crypto 不受影响', () => {
    const g = guild()
    const run = createRun(g.members, THORNHOLD, THORNHOLD.branches[0].id, 221)
    run.steps = [THORNHOLD.encounters.find(e => e.bossId === 'victor')!.id]
    run.stepIdx = 0; startStep(run, 221); run.battle!.status = 'guild-win'
    const input = { source: 'dungeon' as const, run, guild: g }
    const before = JSON.stringify(input)
    seedChronicle([{ seq: 500, day: 1, text: '' }])
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('裸随机数') })
    const uuid = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { throw new Error('结算中创建随机身份') })
    try {
      const a = settleEncounter(input, createRng(3))!, b = settleEncounter(input, createRng(3))!
      expect(JSON.stringify(a)).toBe(JSON.stringify(b))
      expect(JSON.stringify(input)).toBe(before)
      expect(a.loot.items.length).toBeGreaterThan(0)
      expect(a.loot.items.every(item => item.quality !== 'white')).toBe(true)
      expect(a.consequences.chronicle[0].seq).toBe(16)
      expect(chronicleRaw(7, '后续故事').seq).toBe(501)
    } finally { random.mockRestore(); uuid.mockRestore() }
  })

  it('运行中/已应用结果不可重复领奖、退药、登记死亡或消耗随机数', () => {
    for (const source of ['dungeon', 'tower'] as const) {
      const f = fixture(source)
      const o = settleEncounter(f, createRng(3))!
      const unexpected = () => { throw new Error('重复抽样') }
      const applied = o.source === 'tower'
        ? { source: o.source, run: o.run, guild: o.guild }
        : { source: o.source, run: o.run, guild: o.guild }
      expect(settleEncounter(applied, unexpected)).toBeNull()
      f.run.battle!.status = 'running'
      expect(settleEncounter(f, unexpected)).toBeNull()
    }
  })

  it('塔胜场沿用原金币/种族经验/掉落阶级，并补胜利士气和双方默契；挂机不刷新纪录', () => {
    for (const floor of [1, 3, 6, 12]) {
      for (const auto of [false, true]) {
        const g = guild(), t = startTower(g.members, 123)
        t.floor = floor; t.autoMode = auto; startTowerFloor(t, 123)
        t.battle!.status = 'guild-win'
        const o = settleEncounter({ source: 'tower', run: t, guild: g }, () => 0.05)!
        expect(o.loot.gold).toBe(towerGold(floor))
        expect(o.run.goldEarned).toBe(towerGold(floor))
        expect(o.run.phase).toBe('rest')
        expect(o.loot.items).toHaveLength(1)
        expect(ITEM_BASES[o.loot.items[0].baseId].tier).toBe(towerItemTier(floor))
        expect(o.guild.members[0].exp).toBe(Math.round(towerExp(floor) * 1.05))
        expect(o.guild.members[0].morale).toBe(66)
        expect(o.guild.members[0].bonds[g.members[1].id]).toBe(1)
        expect(o.guild.members[1].bonds[g.members[0].id]).toBe(1)
        expect(o.guild.members[3]).toEqual(g.members[3])
        expect(o.guild.towerBest).toBe(auto ? 0 : floor)
      }
    }
  })

  it('保险只归还阵亡装备，未投保保持塔赎回费；团灭零胜场奖励，无人复活', () => {
    for (const insured of [false, true]) {
      const f = fixture('tower', 'guild-wipe')
      if (f.source !== 'tower') throw new Error('tower fixture')
      f.run.insuredFloor = insured
      const item = rollDrop('wpn-t3-dawn', createRng(55))
      f.guild.members[0].equipment.weapon = item
      for (const unit of f.run.battle!.combatants.filter(c => c.team === 'guild')) { unit.alive = false; unit.hp = 0 }
      const o = settleEncounter(f, createRng(555))!
      expect(o.run.phase).toBe('ended')
      expect(o.run.result).toBe('defeated')
      expect(o.survivors).toEqual([])
      expect(o.deaths).toHaveLength(3)
      expect(o.loot.gold).toBe(0)
      expect(o.exp).toBe(0)
      expect(o.loot.items.map(x => x.id)).toEqual(insured ? [item.id] : [])
      expect(o.consequences.relics).toHaveLength(insured ? 0 : 1)
      if (!insured) expect(o.consequences.relics[0].redeem).toBeGreaterThan(0)
      expect(o.consequences.chronicle.filter(x => x.text.includes('酒馆里那晚'))).toHaveLength(3)
    }
  })

  it('副本金币/训练/超等级折扣/战末血量/终局默契与旧模拟链一致，推进后不把杂兵当 Boss', () => {
    for (const dungeon of [BLACKMOSS, THORNHOLD]) {
      for (const status of ['guild-win', 'guild-wipe', 'retreated'] as const) {
        for (const terminal of [false, true]) {
          const g = guild(), r = createRun(g.members, dungeon, dungeon.branches[0].id, 91, 0, true, { heal: 3, fury: 2 }, false, [], { mult: 1.5, rewardMult: 2 })
          const wave = dungeon.encounters.find(e => e.kind === 'wave')!.id
          const boss = dungeon.encounters.find(e => e.kind === 'boss')!.id
          r.steps = terminal ? [wave] : [wave, boss]; r.stepIdx = 0
          r.trainingExpMultiplier = 1.25; startStep(r, 91); r.battle!.status = status
          const deadUnit = r.battle!.combatants.find(c => c.memberId === r.members[0].id)!
          deadUnit.alive = false; deadUnit.hp = 0
          const old = { ...r, members: structuredClone(r.members), battle: { ...r.battle! }, potions: { ...r.potions } }
          advanceRun(old, old.members); const dead = markPermadeath({ ...old, dungeon, members: old.members })
          if (dead.length) applyDeathShock(dead[0].id, old.members.filter(m => m.alive))
          if (status === 'guild-win') applyVictory(old.members)
          settleGrowth({ ...old, dungeon }, 1)
          const o = settleEncounter({ source: 'dungeon', run: r, guild: g }, () => 0.99)!
          expect(o.run.phase).toBe(old.phase)
          expect(o.run.stepIdx).toBe(old.stepIdx)
          expect(o.run.potions).toEqual(old.potions)
          expect(o.guild.members.filter(m => o.run.memberIds.includes(m.id))).toEqual(old.members)
          expect(o.loot.gold).toBe(status === 'guild-win' ? ECONOMY.battleGold.wave * 2 : 0)
          expect(o.loot.clearGold).toBe(status === 'guild-win' && terminal ? ECONOMY.clearBonus : 0)
          expect(o.guild.recruitCooldown).toBe(1)
        }
      }
    }
  })

  it('升级/默契升星各留一次故事，下一个胜場不会重复登记旧升级', () => {
    const g = guild(), r = createRun(g.members, BLACKMOSS, BLACKMOSS.branches[0].id, 9)
    g.members[0].exp = xpNeeded(5) - 1
    r.battle!.status = 'guild-win'
    const first = settleEncounter({ source: 'dungeon', run: r, guild: g }, () => 0.99)!
    expect(first.consequences.chronicle.filter(x => x.text.includes('成长到了'))).toHaveLength(1)
    first.guild.chronicle = [...g.chronicle, ...first.consequences.chronicle]
    startStep(first.run, 10, 0, first.guild.members); first.run.battle!.status = 'guild-win'
    const next = settleEncounter({ source: 'dungeon', run: first.run, guild: first.guild }, () => 0.99)!
    expect(next.consequences.chronicle.filter(x => x.text.includes('成长到了'))).toEqual([])
    expect(next.guild.members[0].level).toBe(6)
  })
})
