import { expect, test } from 'vitest'
import { DUNGEONS } from '../data/dungeons'
import { ITEM_BASES } from '../data/items'
import { JOBS } from '../data/jobs'
import { HYBRIDS } from '../data/vocations'
import { stepBattle, TICK_HARD_CAP } from '../sim/combat'
import { LAB_KEY, buildMembers, createLabBattle, defaultConfig, defaultMember, labResults, loadLab, normalizeConfig, saveLab } from '../../tools/admin/lab'
import type { BattleState, ItemQuality } from '../sim/types'

test('管理员配置仅访问自己的存储键，刷新保留配置，不触碰正式存档', () => {
  const calls: string[] = []
  const values = new Map([['formal-save-sentinel', 'do-not-touch']])
  const storage = {
    getItem(key: string) { calls.push(key); return values.get(key) ?? null },
    setItem(key: string, value: string) { calls.push(key); values.set(key, value) },
  }
  const config = defaultConfig()
  config.name = '技能对照试验'
  config.party[1].cooldowns[JOBS.priest.specs[config.party[1].spec].skills[0].id] = 7
  expect(saveLab(storage, config)).toBe(true)
  expect(loadLab(storage).config).toEqual(config)
  expect(new Set(calls)).toEqual(new Set([LAB_KEY]))
  expect(values.get('formal-save-sentinel')).toBe('do-not-touch')
})

test('损坏或未来版本配置、存储禁用都能安全退回默认配置', () => {
  for (const text of ['{broken', '{"version":999}', 'null']) {
    const loaded = loadLab({ getItem: () => text })
    expect(loaded.config).toEqual(defaultConfig())
    expect(loaded.warning).not.toBe('')
  }
  expect(loadLab({ getItem() { throw Error('denied') } }).warning).not.toBe('')
  expect(saveLab({ setItem() { throw Error('quota') } }, defaultConfig())).toBe(false)
})

test('异常等级、队伍、遭遇与跨槽装备被校准，低等级不注入精进', () => {
  const member = defaultMember('priest')
  member.equipment.weapon = 'arm-t2-plate'
  member.level = -5
  member.advanced = JOBS.priest.specs[member.spec].advancedSkills![0].id
  const config = normalizeConfig({ dungeonId: 'missing', encounterId: 'missing', seed: Infinity,
    party: Array.from({ length: 10 }, () => member) })
  expect(config.party).toHaveLength(6)
  expect(config.party.every(m => m.level === 1 && !m.advanced && !m.equipment.weapon)).toBe(true)
  expect(DUNGEONS.find(d => d.id === config.dungeonId)!.encounters.some(e => e.id === config.encounterId)).toBe(true)
  expect(normalizeConfig({ party: [] }).party.length).toBeGreaterThan(0)
})

test('全关卡遭遇可直接生成，现有基础和混合专精可进入测试', () => {
  for (const dungeon of DUNGEONS) for (const encounter of dungeon.encounters) {
    const run = createLabBattle({ ...defaultConfig(), dungeonId: dungeon.id, encounterId: encounter.id })
    expect(run.battle.encounterId).toBe(encounter.id)
    expect(run.battle.combatants.some(c => c.team === 'enemy')).toBe(true)
  }
  for (const job of Object.values(JOBS)) {
    const specs = [...Object.values(job.specs), ...Object.values(HYBRIDS).filter(h => h.lines.includes(job.id))]
    for (const spec of specs) {
      const member = { ...defaultMember(job.id), spec: spec.id, advanced: spec.advancedSkills?.[0]?.id ?? '' }
      const run = createLabBattle({ ...defaultConfig(), party: [member] })
      const unit = run.battle.combatants.find(c => c.team === 'guild')!
      expect(unit.specId).toBe(spec.id)
      expect(unit.skills.map(s => s.def.id)).toEqual([...spec.skills.map(s => s.id), ...(member.advanced ? [member.advanced] : [])])
      expect(unit.hp).toBe(unit.maxHp)
    }
  }
})

test('同职业的冷却和禁用分别生效，不修改技能表、其他队员或下一场默认战斗', () => {
  const before = structuredClone(JOBS)
  const a = defaultMember('priest')
  const b = defaultMember('priest')
  const id = JOBS.priest.specs[a.spec].skills[0].id
  a.cooldowns[id] = 3
  b.cooldowns[id] = 71
  const run = createLabBattle({ ...defaultConfig(), party: [a, b] })
  const allies = run.battle.combatants.filter(c => c.team === 'guild')
  expect(allies.map(c => c.skills[0].def.cooldownTicks)).toEqual([3, 71])
  a.disabledSkills = [id]
  expect(createLabBattle({ ...defaultConfig(), party: [a] }).battle.combatants[0].skills).toEqual([])
  expect(JOBS).toEqual(before)
  expect(createLabBattle({ ...defaultConfig(), party: [defaultMember('priest')] }).battle.combatants[0].skills[0].def.cooldownTicks)
    .toBe(JOBS.priest.specs[a.spec].skills[0].cooldownTicks)
})

test('全部装备能按槽位和指定品质生成，固定样本不会在重战时重抽', () => {
  for (const item of Object.values(ITEM_BASES)) for (const quality of ['white', 'green', 'purple'] as ItemQuality[]) {
    const member = defaultMember()
    member.quality = quality
    member.equipment[item.slot] = item.id
    const config = { ...defaultConfig(), party: [member] }
    const first = buildMembers(config)
    expect(first[0].equipment[item.slot]!.quality).toBe(quality)
    expect(buildMembers(config)).toEqual(first)
  }
})

test('同配置重复战斗结果一致，测试死亡和消耗不会写回配置或备战成员', () => {
  const config = defaultConfig()
  const before = structuredClone(config)
  const one = createLabBattle(config)
  const two = createLabBattle(config)
  const members = structuredClone(one.members)
  for (const run of [one, two]) {
    for (let i = 0; i <= TICK_HARD_CAP && run.battle.status === 'running'; i++) stepBattle(run.battle)
  }
  const outcome = (battle: BattleState) => ({ status: battle.status, tick: battle.tick, rng: battle.rngState,
    results: labResults(battle), log: battle.log.map(line => line.text) })
  expect(outcome(two.battle)).toEqual(outcome(one.battle))
  expect(config).toEqual(before)
  expect(one.members).toEqual(members)
  expect(createLabBattle(config).battle.combatants.filter(c => c.team === 'guild').every(c => c.hp === c.maxHp && c.alive)).toBe(true)
})
