import type { Member, Nature, Personality, JobId, Attributes } from './types'
import { createRng, int, chance, pick, type Rng } from './rng'
import { JOBS } from '../data/jobs'
import { equipmentStats } from './loot'

// 角色生成器（D1-2）：天性 + 性格 + 出身名字
// M0 简化：直接 roll；出身背景文案生成是 M1 的事（招募看苗子的素材）

const GIVEN_NAMES = [
  '加雷斯', '索恩', '布伦丹', '罗温', '卡尔文', '奥斯蒙', '巴尔德', '克莱门特',
  '达斯汀', '威尔弗雷德', '艾莉娅', '温娜', '罗莎琳', '布莉安娜', '塞莱斯特',
  '莫薇拉', '伊丝特拉', '薇尔玛', '奥萝拉', '芙蕾雅',
] as const

const EPITHETS = [
  '铁手', '沼行者', '星眼', '灰袍', '断刃', '夜歌', '石心', '疾风', '老盐',
] as const

let memberSeq = 0

/** 全局已用名字：避免同一存档里出现无数个同名英雄 */
const usedNames = new Set<string>()

function uniqueName(rng: Rng): string {
  for (let i = 0; i < 30; i++) {
    let name = pick(rng, GIVEN_NAMES)
    if (chance(rng, 0.5)) name += '·' + pick(rng, EPITHETS)
    if (!usedNames.has(name)) {
      usedNames.add(name)
      return name
    }
  }
  // 名字池耗尽的兜底：加序号
  let name = pick(rng, GIVEN_NAMES)
  usedNames.add(name)
  return `${name}${usedNames.size}`
}

/** 读档后登记已用名字（存档恢复不经过 uniqueName，新招募不得与存档英雄重名） */
export function reserveNames(names: string[]): void {
  for (const n of names) if (n) usedNames.add(n)
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

function rollNature(rng: Rng, job: JobId): Nature {
  // 天性随职业倾向倾斜（战士胚子力量高——Q18），但保留随机苗子空间
  const tilt: Record<JobId, Attributes> = {
    guard: { str: 6, agi: 2, int: 1 },
    priest: { str: 1, agi: 2, int: 6 },
    ranger: { str: 2, agi: 6, int: 1 },
  }
  const t = tilt[job]
  const base: Attributes = {
    str: int(rng, 2, 5) + t.str,
    agi: int(rng, 2, 5) + t.agi,
    int: int(rng, 2, 5) + t.int,
  }
  return {
    base,
    growth: {
      str: int(rng, 20, 60) / 100,
      agi: int(rng, 20, 60) / 100,
      int: int(rng, 10, 40) / 100,
    },
    caps: {
      str: base.str + int(rng, 4, 9),
      agi: base.agi + int(rng, 4, 9),
      int: base.int + int(rng, 4, 9),
    },
  }
}

function rollPersonality(rng: Rng): Personality {
  return {
    bravery: int(rng, 25, 75),
    caution: int(rng, 25, 75),
    greed: int(rng, 25, 75),
    loyalty: int(rng, 25, 75),
  }
}

/** 升级：按天性成长权重分配属性点，封顶于天性上限 */
export function levelTo(member: Member, targetLevel: number): void {
  const rng = createRng(hashStr(member.id) + targetLevel * 7919)
  while (member.level < targetLevel) {
    member.level++
    const keys: (keyof Attributes)[] = ['str', 'agi', 'int']
    const weights = member.nature.growth
    const total = weights.str + weights.agi + weights.int
    let roll = rng() * total
    for (const k of keys) {
      roll -= weights[k]
      if (roll <= 0) {
        member.attrs[k] = Math.min(member.nature.caps[k], member.attrs[k] + 1)
        break
      }
    }
  }
  member.hp = maxHpOf(member)
}

// ===== M1 P0 成长系统 =====

/** 升到下一级所需经验(设计:一整轮险路通关 ≈ 升 1 级) */
export function xpNeeded(level: number): number {
  return 200 + level * 60
}

/** 获得经验,跨阈值自动升级(调用 levelTo,受天性上限约束);返回是否升级 */
export function grantExp(member: Member, amount: number): boolean {
  member.exp += amount
  let leveled = false
  while (member.level < LEVEL_CAP && member.exp >= xpNeeded(member.level)) {
    member.exp -= xpNeeded(member.level)
    levelTo(member, member.level + 1)
    leveled = true
  }
  return leveled
}

export const LEVEL_CAP = 10

/** 默契星数阈值:共同远征 1/3/6/10 次 = ★~★★★★ */
export const BOND_STAR_STEPS = [1, 3, 6, 10]

export function bondStars(count: number): number {
  return BOND_STAR_STEPS.filter((s) => count >= s).length
}

/** 每颗默契星的伤害加成 */
export const BOND_MULT_PER_STAR = 0.03

export function maxHpOf(member: Member): number {
  const job = JOBS[member.job]
  const eq = equipmentStats(member.equipment)
  return Math.round(
    job.base.maxHp +
      (member.level - 1) * job.growth.maxHp +
      member.attrs.str * 3 +
      (eq.maxHp ?? 0),
  )
}

export function generateMember(job: JobId, level: number, seed: number = Date.now() + memberSeq * 131): Member {
  const rng = createRng(seed)
  const name = uniqueName(rng)
  const member: Member = {
    id: `m${++memberSeq}`,
    name,
    job,
    level: 1,
    nature: rollNature(rng, job),
    personality: rollPersonality(rng),
    attrs: { str: 0, agi: 0, int: 0 },
    hp: 0,
    equipment: {},
    alive: true,
    exp: 0,
    bonds: {},
  }
  member.attrs = { ...member.nature.base }
  member.hp = maxHpOf(member)
  levelTo(member, level)
  return member
}
