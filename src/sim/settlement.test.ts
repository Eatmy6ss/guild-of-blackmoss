import { createRun, startStep, advanceRun, startTower, startTowerFloor, beginBattle } from '../../scripts/run-test-compat'
import { describe, expect, it, vi } from 'vitest'
import { BLACKMOSS, THORNHOLD } from '../data/dungeons'
import { ECONOMY } from '../data/economy'
import { ITEM_BASES } from '../data/items'
import { baseEffects } from '../data/base'
import { markPermadeath, settleGrowth, bossSequence } from './run'
import { towerGold, towerItemTier } from './tower'
import { generateMember, xpNeeded } from './gen'
import { createRng } from './rng'
import { newKingdomState } from './kingdom'
import { applyDeathShock, applyVictory } from './morale'
import { rollDrop } from './loot'
import { chronicleRaw, seedChronicle } from './chronicle'
import { EMPTY_LEDGER } from './fact-ledger'
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

/** R1.1 夹具:把 run 送到 Boss 节点并推进到末位 boss(双 boss 副本伪造前一场已胜)。
 *  U28 后链上末位可能是变体遭遇——伪造前一场必须用 bossSequence(链口径),不能用原始 encounters 数组 */
function beginBossFinal(r: ReturnType<typeof createRun>, dungeon: typeof BLACKMOSS | typeof THORNHOLD, seed: number) {
  const bossNode = r.map.layers[r.map.layers.length - 1]![0]!
  r.nodeId = bossNode.id
  r.path = [bossNode.id]
  const chain = bossSequence(dungeon)
  const prior = chain.length > 1 ? chain[chain.length - 2]!.id : undefined
  if (prior) {
    r.battlesFought = 1
    r.battle = { encounterId: prior, status: 'guild-win', combatants: [], log: [], events: [], tick: 0, rngState: 1,
      commands: { stance: 'standard', healStock: 0, furyStock: 0, healCd: 0, furyCd: 0, furyUntil: 0, protectRetreat: true, autoMode: false } } as never
  }
  startStep(r, seed)
}

function fixture(source: 'dungeon' | 'tower', status = 'retreated' as 'guild-win' | 'retreated' | 'guild-wipe'): EncounterInput {
  const g = guild()
  const run = source === 'dungeon' ? beginBattle(createRun(g.members, BLACKMOSS, 53), 53)
    : startTower(g.members, 53, { heal: 5, fury: 4 })
  run.battle!.status = status
  const victim = run.battle!.combatants.find(c => c.memberId === g.members[0].id)!
  victim.alive = false; victim.hp = 0
  // R4.1 生平:受难者生前有传记 → 快照必须随 DeadHero 带进纪念堂(U34)
  g.members[0].bio = [{ day: 1, kind: 'joined', text: '经由酒馆传闻加入了公会。', permanent: true }]
  return source === 'dungeon' ? { source, run: run as ReturnType<typeof createRun>, guild: g }
    : { source, run: run as ReturnType<typeof startTower>, guild: g }
}

describe('统一遭遇结算', () => {
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
      // R4.1 生平(U34):阵亡快照带出生前传记;陨落条目落在结算克隆上(纪念堂碑文另示死因)
      expect(o.deaths[0].bio?.some(b => b.kind === 'joined')).toBe(true)
      expect(victim.bio?.some(b => b.kind === 'fall')).toBe(true)
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
    const run = createRun(g.members, THORNHOLD, 221)
    beginBossFinal(run, THORNHOLD, 221)
    run.battle!.status = 'guild-win'
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
      {
        const g = guild(), t = startTower(g.members, 123)
        t.floor = floor; startTowerFloor(t, 123)
        t.battle!.status = 'guild-win'
        const o = settleEncounter({ source: 'tower', run: t, guild: g }, () => 0.05)!
        // #3.1 下塔才结算:outcome 不再入账(金币进 pendingLoot,掉落进 pendingDrops)
        expect(o.loot.gold).toBe(0)
        expect(o.loot.items).toHaveLength(0)
        expect(o.run.pendingLoot.gold).toBe(towerGold(floor))
        expect(o.run.goldEarned).toBe(towerGold(floor))
        expect(o.run.phase).toBe('rest')
        expect(o.run.pendingDrops).toHaveLength(1)
        expect(ITEM_BASES[o.run.pendingDrops![0].baseId].tier).toBe(towerItemTier(floor))
        expect(o.guild.members[0].exp).toBe(0) // #3.1:经验也进 pending,下塔兑现
        expect(o.guild.members[0].morale).toBe(66)
        expect(o.guild.members[0].bonds[g.members[1].id]).toBe(1)
        expect(o.guild.members[1].bonds[g.members[0].id]).toBe(1)
        expect(o.guild.members[3]).toEqual(g.members[3])
        expect(o.guild.towerBest).toBe(floor)
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
          const g = guild(), r = createRun(g.members, dungeon, 91, 0, true, { heal: 3, fury: 2 }, false, [], { mult: 1.5, rewardMult: 2 })
          const node = r.map.layers[0].find(n => n.kind === 'battle') ?? r.map.layers[0][0]!
          r.nodeId = node.id; r.path = [node.id]
          r.trainingExpMultiplier = 1.25; startStep(r, 91); r.battle!.status = status
          void terminal
          const deadUnit = r.battle!.combatants.find(c => c.memberId === r.members[0].id)!
          deadUnit.alive = false; deadUnit.hp = 0
          const old = { ...r, members: structuredClone(r.members), battle: { ...r.battle! }, potions: { ...r.potions } }
          advanceRun(old, old.members); const dead = markPermadeath({ ...old, dungeon, members: old.members })
          if (dead.length) applyDeathShock(dead[0].id, old.members.filter(m => m.alive))
          if (status === 'guild-win') applyVictory(old.members)
          settleGrowth({ ...old, dungeon }, 1)
          const o = settleEncounter({ source: 'dungeon', run: r, guild: g }, () => 0.99)!
          expect(o.run.phase).toBe(old.phase)
          expect(o.run.path).toEqual(old.path)
          expect(o.run.potions).toEqual(old.potions)
          // U34:bio 是新增叙事层,旧链对照剥离 bio 后逐字段一致
          expect(o.guild.members.filter(m => o.run.memberIds.includes(m.id)).map(({ bio: _b, ...rest }) => rest))
            .toEqual(old.members.map(({ bio: _b2, ...rest }) => rest))
          expect(o.loot.gold).toBe(status === 'guild-win' ? ECONOMY.battleGold.wave * 2 : 0)
          expect(o.loot.clearGold).toBe(0) // 中途(非 Boss 末场)永不清关
          expect(o.guild.recruitCooldown).toBe(1)
        }
      }
    }
    // 通关奖励:Boss 末场胜利才有 clearGold(黑苔末位 boss 塔尔玛夹具)
    {
      const g = guild(), r = createRun(g.members, BLACKMOSS, 91, 0, true, { heal: 3, fury: 2 }, false, [], { mult: 1.5, rewardMult: 2 })
      beginBossFinal(r, BLACKMOSS, 91)
      r.trainingExpMultiplier = 1.25
      r.battle!.status = 'guild-win'
      const o = settleEncounter({ source: 'dungeon', run: r, guild: g }, () => 0.99)!
      expect(o.loot.clearGold).toBe(ECONOMY.clearBonus)
      expect(o.loot.gold).toBe(ECONOMY.battleGold.boss) // 非 first battle → rareHunt rewardMult 不翻倍
      expect(o.run.phase).toBe('victory')
    }
  })

  it('升级/默契升星写进当事人生平各一次且不重复登记;大事记不再记(U34)', () => {
    const g = guild(), r = createRun(g.members, BLACKMOSS, 9)
    const node = r.map.layers[0].find(n => n.kind === 'battle') ?? r.map.layers[0][0]!
    r.nodeId = node.id; r.path = [node.id]
    startStep(r, 9)
    g.members[0].exp = xpNeeded(5) - 1
    r.battle!.status = 'guild-win'
    const first = settleEncounter({ source: 'dungeon', run: r, guild: g }, () => 0.99)!
    const bioLevelUps = (guild: typeof g) => guild.members.flatMap(m => m.bio ?? []).filter(b => b.kind === 'level-up')
    expect(bioLevelUps(first.guild)).toHaveLength(1)
    // 大事记回归里程碑:升级不再进编年史
    expect(first.consequences.chronicle.filter(x => x.text.includes('成长到了'))).toHaveLength(0)
    first.guild.chronicle = [...g.chronicle, ...first.consequences.chronicle]
    startStep(first.run, 10, 0, first.guild.members); first.run.battle!.status = 'guild-win'
    const next = settleEncounter({ source: 'dungeon', run: first.run, guild: first.guild }, () => 0.99)!
    expect(bioLevelUps(next.guild)).toHaveLength(bioLevelUps(first.guild).length) // 不重复登记旧升级(总量不增)
    expect(next.guild.members[0].level).toBe(6)
  })
})

// R5.1c 精英回报(U33②):金币 ×2/经验 ×2/熟练 +2/掉落品质下限绿
describe('R5.1c 精英回报', () => {
  function eliteFixture(seed: number) {
    const g = guild()
    const r = createRun(g.members, BLACKMOSS, seed)
    const eliteNode = r.map.layers.flat().find(n => n.kind === 'elite')!
    r.nodeId = eliteNode.id; r.path = [eliteNode.id]
    startStep(r, seed)
    r.battle!.status = 'guild-win'
    return { g, r }
  }

  it('精英战:金币 60(30×2)、熟练 +2、经验 54(18×3 人)', () => {
    for (let seed = 101; seed < 140; seed += 7) {
      const { g, r } = eliteFixture(seed)
      const o = settleEncounter({ source: 'dungeon', run: r, guild: g }, () => 0.99)!
      if (!o.win) continue
      expect(o.loot.gold).toBe(ECONOMY.battleGold.wave * 2)
      expect(o.consequences.mastery?.gain).toBe(2)
      // 夹具全人类(经验被动 +5%):round(18×1.05)=19/人
      expect(o.consequences.growth.experience.every(x => x.amount === 19)).toBe(true)
      expect(o.exp).toBe(19 * 3)
      return
    }
    throw new Error('40 个 seed 内没跑到必胜精英局')
  })

  it('普通战不受精英回报影响:金币 30、熟练 +1、经验 27(9×3 人)', () => {
    const g = guild(), r = createRun(g.members, BLACKMOSS, 9)
    const node = r.map.layers[0].find(n => n.kind === 'battle') ?? r.map.layers[0][0]!
    r.nodeId = node.id; r.path = [node.id]
    startStep(r, 9)
    r.battle!.status = 'guild-win'
    const o = settleEncounter({ source: 'dungeon', run: r, guild: g }, () => 0.99)!
    expect(o.loot.gold).toBe(ECONOMY.battleGold.wave)
    expect(o.consequences.mastery?.gain).toBe(1)
    expect(o.exp).toBe(9 * 3)
  })
})
