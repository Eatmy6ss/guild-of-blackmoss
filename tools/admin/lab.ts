import { DUNGEONS } from '../../src/data/dungeons'
import { JOBS, specOf } from '../../src/data/jobs'
import { HYBRIDS } from '../../src/data/vocations'
import { ITEM_BASES } from '../../src/data/items'
import { createBattle, toCombatant } from '../../src/sim/combat'
import { generateMember, levelTo, LEVEL_CAP } from '../../src/sim/gen'
import { rollDrop } from '../../src/sim/loot'
import { createRng } from '../../src/sim/rng'
import type { BattleState, ItemQuality, JobId, Member, Slot } from '../../src/sim/types'

export const LAB_KEY = 'blackmoss-test-lab-v1'
export const SLOTS: Slot[] = ['weapon', 'armor', 'trinket']
export interface LabMember {
  job: JobId
  spec: string
  level: number
  advanced: string
  equipment: Record<Slot, string>
  quality: ItemQuality
  disabledSkills: string[]
  cooldowns: Record<string, number>
}
export interface LabConfig {
  version: 1
  name: string
  dungeonId: string
  encounterId: string
  seed: number
  protect: boolean
  party: LabMember[]
}
export function labSpec(member: LabMember) {
  const hybrid = HYBRIDS[member.spec]
  return hybrid?.lines.includes(member.job) ? hybrid : specOf(member.job, member.spec)
}
export function labSkills(member: LabMember) {
  const spec = labSpec(member)
  const advanced = member.level >= 6 ? spec.advancedSkills?.find(skill => skill.id === member.advanced) : undefined
  return [...spec.skills, ...(advanced ? [advanced] : [])]
}
export function defaultMember(job: JobId = 'ranger'): LabMember {
  return { job, spec: JOBS[job].defaultSpec, level: 10, advanced: '', quality: 'green',
    equipment: { weapon: 'wpn-t2-bow', armor: 'arm-t2-plate', trinket: 'trk-t2-totem' },
    disabledSkills: [], cooldowns: {} }
}
export function defaultConfig(): LabConfig {
  const dungeon = DUNGEONS.find(d => d.id === 'emberpass') ?? DUNGEONS[0]
  return { version: 1, name: '制作人测试公会', dungeonId: dungeon.id,
    encounterId: dungeon.encounters.find(e => e.bossId)?.id ?? dungeon.encounters[0].id,
    seed: 20260927, protect: false, party: ['guard', 'priest', 'ranger'].map(job => defaultMember(job as JobId)) }
}
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const integer = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback

export function normalizeConfig(value: unknown): LabConfig {
  const raw = record(value)
  const fallback = defaultConfig()
  const dungeon = DUNGEONS.find(d => d.id === raw.dungeonId) ?? DUNGEONS.find(d => d.id === fallback.dungeonId)!
  const party = (Array.isArray(raw.party) && raw.party.length ? raw.party : fallback.party).slice(0, 6).map(value => {
    const input = record(value)
    const job = Object.values(JOBS).find(job => job.id === input.job)?.id ?? 'guard'
    const member = defaultMember(job)
    const specs = [...Object.values(JOBS[job].specs), ...Object.values(HYBRIDS).filter(h => h.lines.includes(job))]
    member.spec = specs.find(s => s.id === input.spec)?.id ?? member.spec
    member.level = integer(input.level, 1, LEVEL_CAP, member.level)
    member.quality = input.quality === 'white' || input.quality === 'purple' ? input.quality : 'green'
    const gear = record(input.equipment)
    for (const slot of SLOTS) member.equipment[slot] = typeof gear[slot] === 'string' &&
      ITEM_BASES[gear[slot] as string]?.slot === slot ? gear[slot] as string : ''
    member.advanced = member.level >= 6 ? labSpec(member).advancedSkills?.find(s => s.id === input.advanced)?.id ?? '' : ''
    const skills = labSkills(member)
    member.disabledSkills = skills.filter(s => Array.isArray(input.disabledSkills) && input.disabledSkills.includes(s.id)).map(s => s.id)
    const cooldowns = record(input.cooldowns)
    for (const skill of skills) {
      if (typeof cooldowns[skill.id] === 'number' && Number.isFinite(cooldowns[skill.id])) {
        member.cooldowns[skill.id] = integer(cooldowns[skill.id], 1, 600, skill.cooldownTicks)
      }
    }
    return member
  })
  return { version: 1, name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 32) : fallback.name,
    dungeonId: dungeon.id, encounterId: dungeon.encounters.find(e => e.id === raw.encounterId)?.id ?? dungeon.encounters[0].id,
    seed: integer(raw.seed, 0, 0xffffffff, fallback.seed), protect: raw.protect === true, party }
}
export function loadLab(storage: Pick<Storage, 'getItem'>): { config: LabConfig; warning: string } {
  try {
    const text = storage.getItem(LAB_KEY)
    if (!text) return { config: defaultConfig(), warning: '' }
    const raw: unknown = JSON.parse(text)
    if (record(raw).version !== 1) throw new Error('Unsupported test configuration')
    return { config: normalizeConfig(raw), warning: '' }
  } catch {
    return { config: defaultConfig(), warning: '测试配置无法读取，已载入默认队伍。正常公会不受影响。' }
  }
}
export function saveLab(storage: Pick<Storage, 'setItem'>, config: LabConfig): boolean {
  try { storage.setItem(LAB_KEY, JSON.stringify(normalizeConfig(config))); return true } catch { return false }
}

// Generate this page's fixed set once; repeated setup must not re-roll nature/name RNG.
let templates: Record<string, Member> | undefined
export function buildMembers(config: LabConfig): Member[] {
  templates ??= Object.fromEntries(Object.values(JOBS).map((job, index) =>
    [job.id, generateMember(job.id, 1, 92700 + index, { race: 'human' })]))
  return normalizeConfig(config).party.map((setup, index) => {
    const member = structuredClone(templates![setup.job])
    member.id = `test-member-${index}`
    member.name = `试员${index + 1}·${labSpec(setup).name}`
    member.spec = setup.spec
    member.personality = { bravery: 50, caution: 70, greed: 50, loyalty: 50 }
    member.specAdvanced = setup.advanced ? { [setup.spec]: setup.advanced } : {}
    levelTo(member, setup.level)
    member.equipment = {}
    for (const [slotIndex, slot] of SLOTS.entries()) {
      const baseId = setup.equipment[slot]
      if (!baseId) continue
      const rng = createRng(92700 + index * 37 + slotIndex)
      let first = true
      const item = rollDrop(baseId, () => {
        if (first) { first = false; return { white: 0.99, green: 0.3, purple: 0.01 }[setup.quality] }
        return rng()
      })
      item.id = `test-item-${index}-${slot}`
      member.equipment[slot] = item
    }
    member.hp = toCombatant(member).maxHp
    return member
  })
}
export function createLabBattle(input: LabConfig) {
  const config = normalizeConfig(input)
  const dungeon = DUNGEONS.find(d => d.id === config.dungeonId)!
  const members = buildMembers(config)
  // Clone before test overrides: skill definitions and enemy data otherwise share table references.
  const battle = structuredClone(createBattle(members, dungeon, config.encounterId, config.seed, 0, 0, config.protect))
  battle.encounterId = config.encounterId
  for (const unit of battle.combatants) {
    const index = members.findIndex(member => member.id === unit.memberId)
    if (index < 0) continue
    const setup = config.party[index]
    unit.skills = unit.skills.filter(skill => !setup.disabledSkills.includes(skill.def.id)).map(skill => ({
      ...skill, def: { ...skill.def, cooldownTicks: setup.cooldowns[skill.def.id] ?? skill.def.cooldownTicks },
    }))
  }
  return { config, members, battle }
}
export function labResults(battle: BattleState) {
  return battle.combatants.filter(unit => unit.team === 'guild').map(unit => ({
    name: unit.name, hp: unit.hp, maxHp: unit.maxHp, alive: unit.alive,
    // Enemy area effects can emit additional presentation events; only count guild hits on enemies.
    damage: battle.events.filter(e => e.type === 'damage' && e.attackerId === unit.id &&
      battle.combatants.some(target => target.id === e.targetId && target.team === 'enemy')).reduce((sum, e) => sum + (e.amount ?? 0), 0),
    healing: battle.events.filter(e => e.type === 'heal' && e.attackerId === unit.id).reduce((sum, e) => sum + (e.amount ?? 0), 0),
  }))
}
