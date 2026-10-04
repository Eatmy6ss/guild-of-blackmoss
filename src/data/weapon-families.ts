import type { JobId, WeaponFamily } from '../sim/types'
import { JOBS } from './jobs'

// R3 武器族(U31/W1):所有人都能用所有武器,但攻击方式与站位由武器决定,
// 数值与技能看职业熟练。设计依据 redesign-2026-10-03.md §5 + r3-weapon-plan.md。
// 数值倍率全部是 C4 期结构占位,G3 平衡窗口统调。

export interface WeaponFamilyDef {
  id: WeaponFamily
  name: string
  /** 攻击方式:
   *  melee  = 前排近战(刃/锤斧;不谙法术者抡杖也归此);
   *  ranged = 后排射击,可越过前排打后排(弓弩);
   *  cast   = 施法职业后排发法弹,不谙法术者退化为前排近战钝击(杖圣器);
   *  reach  = 前排站立、长杆越线可打敌方后排,基础攻击伤略低(长柄)。 */
  mode: 'melee' | 'ranged' | 'cast' | 'reach'
  /** 基础攻击(普攻)伤害与出手间隔修正,结构占位受 C4 */
  dmgMult?: number
  intervalMult?: number
  desc: string
}

export const WEAPON_FAMILIES: Record<WeaponFamily, WeaponFamilyDef> = {
  blade: { id: 'blade', name: '刃器', mode: 'melee', desc: '剑刃匕首——前排近战,干净利落。' },
  bow: { id: 'bow', name: '弓弩', mode: 'ranged', desc: '弓与弩——后排射击,箭矢越过前排直取后排。' },
  staff: { id: 'staff', name: '杖圣器', mode: 'cast', desc: '法杖圣器——施法者以后排法弹御敌;不谙法术者只能近身抡。' },
  axe: { id: 'axe', name: '锤斧', mode: 'melee', dmgMult: 1.15, intervalMult: 1.25, desc: '锤斧——前排近战,出手更慢,落得更重。' },
  polearm: { id: 'polearm', name: '长柄', mode: 'reach', dmgMult: 0.92, desc: '长柄——立住前排阵脚,长杆越线够到敌方后排。' },
}

export const FAMILY_IDS = Object.keys(WEAPON_FAMILIES) as WeaponFamily[]

/** 职业熟练表(U31 拍板):守卫=刃/锤斧/长柄;战士=刃/锤斧;游侠=弓/刃;牧师=杖圣器/刃;法师/术士=杖圣器。
 *  混合职阶按其登记的头部职业取表(训练场学习对混合线同样生效)。 */
export const JOB_FAMILIES: Record<JobId, WeaponFamily[]> = {
  guard: ['blade', 'axe', 'polearm'],
  warrior: ['blade', 'axe'],
  ranger: ['bow', 'blade'],
  priest: ['staff', 'blade'],
  mage: ['staff'],
  warlock: ['staff'],
}

/** 各职业的「本命族」:招募自带装备的默认族,熟练表校验锚点 */
export const JOB_HOME_FAMILY: Record<JobId, WeaponFamily> = {
  guard: 'blade',
  warrior: 'blade',
  ranger: 'bow',
  priest: 'staff',
  mage: 'staff',
  warlock: 'staff',
}

/** 施法铁律(W2):只有这三个职业能发挥杖圣器的施法能力。训练场学习只解决
 *  「数值不降档+可抡」,纯物理职业学杖圣器不获得施法——铁律在引擎侧硬编码。 */
export const CAST_JOBS: readonly string[] = ['priest', 'mage', 'warlock']
export function canCastJob(job: string): boolean {
  return CAST_JOBS.includes(job)
}

/** 成员的熟练族 = 职业表 ∪ 训练场已学(存档 weaponTraining)。 */
export function proficientFamilies(job: string, learned: readonly string[] | undefined): WeaponFamily[] {
  const base = JOB_FAMILIES[job as JobId] ?? []
  const out = new Set<WeaponFamily>(base)
  for (const f of learned ?? []) {
    if (f in WEAPON_FAMILIES) out.add(f as WeaponFamily)
  }
  return [...out]
}

// ---- 公会级已学族(存档 weaponTraining)的战斗侧读取 ----
// 战斗投影(toCombatant)只看得到 Member,看不到公会存档;存档 v25 的 weaponTraining 是
// 公会级字段,经 App 在加载/学习时注入本模块(与 battleSpeed/setConfirmAsk 同一套环境注入模式),
// 战斗侧永远只走 getGuildLearnedFamilies 单一来源。测试默认空=只有职业表。
let guildLearnedFamilies: readonly string[] = []
export function setGuildLearnedFamilies(list: readonly string[] | undefined): void {
  guildLearnedFamilies = Array.isArray(list) ? list.filter((f) => f in WEAPON_FAMILIES) : []
}
export function getGuildLearnedFamilies(): readonly string[] {
  return guildLearnedFamilies
}

/** 装备某族武器是否熟练(查表+已学;未持武器不构成非熟练) */
export function isFamilyProficient(job: string, family: WeaponFamily | undefined, learned: readonly string[] | undefined): boolean {
  if (!family) return true
  return proficientFamilies(job, learned).includes(family)
}

// 注册表键名断言(坑台账:键名必须对数据表实读校验,warrior 键名事故的教训)
const jobIds = Object.keys(JOBS)
if (jobIds.length === 0) throw new Error('weapon-families: JOBS 注册表为空')
for (const id of jobIds) {
  if (!(id in JOB_FAMILIES)) throw new Error(`weapon-families: JOB_FAMILIES 缺职业 ${id}`)
  if (!(id in JOB_HOME_FAMILY)) throw new Error(`weapon-families: JOB_HOME_FAMILY 缺职业 ${id}`)
  const table = JOB_FAMILIES[id as JobId]
  if (table.length === 0) throw new Error(`weapon-families: 职业 ${id} 熟练表为空`)
  if (!table.includes(JOB_HOME_FAMILY[id as JobId])) throw new Error(`weapon-families: 职业 ${id} 熟练表不含本命族`)
}
