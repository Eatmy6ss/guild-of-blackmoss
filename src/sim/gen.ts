import type { Member, Nature, Personality, JobId, Attributes } from './types'
import { createRng, int, chance, pick, type Rng } from './rng'
import { JOBS } from '../data/jobs'
import { RACES, RACE_IDS } from '../data/races'
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

function uniqueName(rng: Rng, pool?: readonly string[]): string {
  for (let i = 0; i < 30; i++) {
    let name = pick(rng, pool ?? GIVEN_NAMES)
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

/** 读档后重置成员 ID 计数器:存档里的 m1 与新招募的 m1 会撞号(血量写回/默契/战斗关联全串位) */
export function seedMemberSeq(members: Member[]): void {
  let max = 0
  for (const m of members) {
    const n = Number(m.id.replace(/^m/, ''))
    if (Number.isFinite(n) && n > max) max = n
  }
  memberSeq = Math.max(memberSeq, max)
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

function rollNature(rng: Rng, job: JobId): Nature {
  // 天性随职业倾向倾斜（战士胚子力量高——Q18），但保留随机苗子空间
  const tilt: Record<JobId, Attributes> = {
    guard:    { str: 6, agi: 2, int: 1, vit: 4, spr: 1, lck: 1 },
    priest:   { str: 1, agi: 2, int: 6, vit: 1, spr: 4, lck: 1 },
    ranger:   { str: 2, agi: 6, int: 1, vit: 1, spr: 1, lck: 3 },
    warrior:  { str: 6, agi: 3, int: 1, vit: 3, spr: 1, lck: 1 },
    mage:     { str: 1, agi: 2, int: 6, vit: 1, spr: 3, lck: 1 },
    warlock:  { str: 2, agi: 2, int: 6, vit: 1, spr: 3, lck: 1 },
  }
  const t = tilt[job]
  // 属性改革(宪法 v3.3 批次①):六维;方差 0-7(均值 3.5,⑱ 校准)
  const base: Attributes = {
    str: int(rng, 0, 7) + t.str,
    agi: int(rng, 0, 7) + t.agi,
    int: int(rng, 0, 7) + t.int,
    vit: int(rng, 0, 7) + t.vit,
    spr: int(rng, 0, 7) + t.spr,
    lck: int(rng, 0, 7) + t.lck,
  }
  return {
    base,
    growth: {
      str: int(rng, 10, 70) / 100,
      agi: int(rng, 10, 70) / 100,
      int: int(rng, 8, 52) / 100,
      vit: int(rng, 10, 60) / 100,
      spr: int(rng, 8, 50) / 100,
      lck: int(rng, 6, 40) / 100,
    },
    caps: {
      str: base.str + int(rng, 3, 12),
      agi: base.agi + int(rng, 3, 12),
      int: base.int + int(rng, 3, 12),
      vit: base.vit + int(rng, 3, 12),
      spr: base.spr + int(rng, 3, 12),
      lck: base.lck + int(rng, 3, 12),
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
    const keys: (keyof Attributes)[] = ['str', 'agi', 'int', 'vit', 'spr', 'lck']
    const weights = member.nature.growth
    const total = keys.reduce((sum, k) => sum + weights[k], 0)
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
  // 宪法 v3.3 批次④:升级放缓——曲线拉长 ×1.5 并按平方走(前期快后期长)
  return Math.round((200 + level * 60) * 1.5)
}

/** 获得经验,跨阈值自动升级(调用 levelTo,受天性上限约束);返回是否升级 */
export function grantExp(member: Member, amount: number): boolean {
  // 人类轻被动:学得快(+5% 经验)
  const race = member.race ? RACES[member.race] : RACES.human
  member.exp += Math.round(amount * (1 + (race.passive.expMult ?? 0)))
  let leveled = false
  while (member.level < LEVEL_CAP && member.exp >= xpNeeded(member.level)) {
    member.exp -= xpNeeded(member.level)
    levelTo(member, member.level + 1)
    leveled = true
  }
  return leveled
}

export const LEVEL_CAP = 15

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
      member.attrs.vit * 3 +
      (eq.maxHp ?? 0),
  )
}

// 门禁标准条件开关:smoke 钉住种族以隔离方差(运行时为 undefined = 随机六族)
let raceOverride: string | undefined
export function setRaceOverride(r?: string): void {
  raceOverride = r
}

/** 招募随机专精(宪法 v3:招募即带专精) */
export function rollSpec(jobId: JobId, rng: Rng): string {
  const specs = Object.keys(JOBS[jobId].specs)
  return specs[Math.floor(rng() * specs.length)] ?? JOBS[jobId].defaultSpec
}

export function generateMember(job: JobId, level: number, seed: number = Date.now() + memberSeq * 131, opts?: { race?: string }): Member {
  const rng = createRng(seed)
  // 六族随机(宪法 v3):种族决定名字池与一条轻被动;老存档无 race 字段 = 人类
  const raceId = raceOverride ?? opts?.race ?? pick(rng, RACE_IDS)
  const name = uniqueName(rng, RACES[raceId].names)
  const member: Member = {
    id: `m${++memberSeq}`,
    name,
    race: raceId,
    job,
    level: 1,
    // F06(2026-09-25):生成即定专精=默认线——预览=入职=战斗行为一致;混合职阶候选由招募
    // 路径(三选一等)显式覆盖,候选卡看到的专精就是入职的专精
    spec: JOBS[job].defaultSpec,
    nature: rollNature(rng, job),
    personality: rollPersonality(rng),
    attrs: { str: 0, agi: 0, int: 0, vit: 0, spr: 0, lck: 0 },
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
