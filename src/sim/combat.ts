import type {
  BattleState,
  Combatant,
  DungeonDef,
  EnemyDef,
  LogKind,
  Member,
  SkillDef,
  Stance,
  BattleCommands,
} from './types'
import { JOBS, specOf } from '../data/jobs'
import { ITEM_BASES } from '../data/items'
import { AFFIXES } from '../data/affixes'
import { MONSTER_AFFIXES } from './monster-affix'
import { staminaAttackMult } from './stamina'
import { SIGNATURE_SKILLS } from '../data/signature'
import { equipmentSetBonus } from './equipment-sets'
import { formatStat, formatPercent, STAT_NAME } from './loot'
import { applyEnemyScaling as applyScaling, ELITE_ENEMY_MULT, towerEnemyScale, type DifficultyModifiers, type EnemyScaleFactors } from './difficulty'
import { scarPenalty, recordScarMechanic } from './scars'
import { TRAIT_INFO } from '../data/traits'
import { HYBRIDS, isHybrid } from '../data/vocations'
import { isFamilyProficient, WEAPON_FAMILIES, canCastJob } from '../data/weapon-families'
import { RACES } from '../data/races'
import type { SpecDef } from './types'
import { processBossMechanics } from './mechanics'
import { interruptThreshold, MECHANIC_REGISTRY } from './mechanic-registry'
import { runAutoAI } from './ai'
import { equipmentStats } from './loot'
import { bondStars, BOND_MULT_PER_STAR } from './gen'

// 战斗引擎 D8-9 版：威胁表、站位、轻协同、护甲模型 +
// 团长指挥台（阵型/集火/道具/撤退令）与 boss 机制引擎对接。

export const TICK_MS = 100 // 10 tick / 秒；模拟与演出解耦，演出层按 tick 回放

/** 护甲减伤常数：dmg × K/(K+def)，K 越大护甲越弱（D13-14 平衡）
 *  试玩反馈④:装备端治本——K 60→30,def 属性真实化(def10:14%→25%),护甲值得穿 */
const MITIGATION_K = 30
/** 坦克每 tick 对每个敌人的被动仇恨（活着就拉住阵线；战斗变长后须压过游侠输出仇恨,1.8 起稳坐第一仇恨） */
const TANK_AURA_THREAT = 3.0
/** 威胁目标选择的抖动概率：偶尔打二号仇恨，模拟走位失误 */
const THREAT_DITHER = 0.2
/** 集火加成：全队对集火目标伤害 +50%（打断咏唱/秒杀增援的核心手段） */
const FOCUS_MULT = 1.5
/** 爆发药：全队伤害 +30%，持续 15 秒 */
const FURY_MULT = 1.3
/** 阵型对伤害/防御的修正（推进换输出，收缩换生存，分散反 AOE） */
const STANCE_DMG: Record<Stance, number> = { advance: 1.15, standard: 1, tighten: 0.85, spread: 0.9 }
const STANCE_DEF: Record<Stance, number> = { advance: 0.85, standard: 1, tighten: 1.25, spread: 1 }
export const STANCE_NAME: Record<Stance, string> = {
  advance: '推进',
  standard: '标准',
  tighten: '收缩',
  spread: '分散',
}
export const POTION_STOCK = 3
export const POTION_CD_TICKS = 600
export const HEAL_PCT = 0.3
export const FURY_TICKS = 150
/** 撤离过程时长（Q32：免费下令 + 可被干扰的撤离过程） */
export const EXTRACT_TICKS = 50
/** 战斗硬上限(试玩反馈:tick 无限拖):软压力/强制撤离 */
export const TICK_SOFT_CAP = 900
export const TICK_HARD_CAP = 1200
/** 副本敌人全局血量系数(试玩反馈④;温和放慢——弱档不磨死,秒杀感主要由等级压制治理) */
export const ENEMY_HP_MULT = 1.1

let combatantSeq = 0

/** 本场身份分配，不改变召唤、伤害或抽样规则。 */
export function allocateBattleId(state: BattleState, prefix = 'c'): string {
  state.unitSeq ??= state.combatants.reduce((max, c) => Math.max(max, Number(c.id.slice(1)) || 0), 0)
  return `${prefix}${++state.unitSeq}`
}

export function pushLog(state: BattleState, kind: LogKind, text: string): void {
  state.log.push({ tick: state.tick, kind, text })
  if (state.log.length > 400) state.log.splice(0, state.log.length - 400)
}

/** 战力分:装备/等级/默契之外的统一成长读数(单调即可,不求精确) */
export function powerScore(member: Member): number {
  const c = toCombatant(member)
  // #2.2 新属性权重(C4 占位):攻速已体现在 attackInterval;其余按"对一场战斗的期望贡献"折算
  return Math.round(
    c.attack * 3 + c.maxHp * 0.4 + c.defense * 4 + c.critChance * 200 + (60 / c.attackInterval) * 2 +
    (c.critDamage ?? 0) * 150 + (c.armorPen ?? 0) * 2 + (c.damageReduction ?? 0) * 120 +
    (c.healPower ?? 0) * 120 + (c.threatMult ?? 0) * 20 + (c.cdReduction ?? 0) * 80,
  )
}


export function initCommands(potions?: { heal: number; fury: number }): BattleCommands {
  return {
    stance: 'standard',
    // 药水经济:正式入口(远征/高塔)显式传入公会携带量;不传 = 测试/机器人默认带满
    healStock: potions?.heal ?? POTION_STOCK,
    furyStock: potions?.fury ?? POTION_STOCK,
    healCd: 0,
    furyCd: 0,
    furyUntil: 0,
    protectRetreat: true,
    autoMode: false,
  }
}

/** 成员 → 战斗实体投影。装备加算（D10）；混合职阶自带头部整体替换基础线 */
export function toCombatant(member: Member): Combatant {
  const job = JOBS[member.job]
  const eq = equipmentStats(member.equipment)
    // 装备 2.0 传承威能聚合(DESIGN 13.3):行为类威能标记 + mend 折入受疗
    let legacyFocus = false
    let legacyKillheal = false
    let legacyBulwark = false
    let legacyElitewarden = false
    let legacyEmberward = false
    let legacyMend = 0
    let setCrown = 0
    let setHunt = 0
    // #2.3 触发词条聚合(复用威能钩子通道)
    let killHealPct = 0
    let lowHpAtkMult = 0
    let hitReflect = 0
    for (const eqItem of Object.values(member.equipment)) {
      const lk = eqItem ? ITEM_BASES[eqItem.baseId]?.legacy : undefined
      if (lk === 'focus') legacyFocus = true
      else if (lk === 'killheal') legacyKillheal = true
      else if (lk === 'bulwark') legacyBulwark = true
      else if (lk === 'elitewarden') legacyElitewarden = true
      else if (lk === 'emberward') legacyEmberward = true
      else if (lk === 'mend') legacyMend += 0.08
      // K08 套装计数
      const sn = eqItem ? ITEM_BASES[eqItem.baseId]?.setName : undefined
      if (sn === 'gray-crown') setCrown++
      if (sn === 'wind-hunt') setHunt++
      // #2.3:触发词条 roll 值聚合
      for (const r of eqItem?.rolls ?? []) {
        const aff = AFFIXES[r.affixId]
        if (aff?.trigger === 'kill-heal') killHealPct += r.value
        else if (aff?.trigger === 'low-hp-attack') lowHpAtkMult += r.value
        else if (aff?.trigger === 'hit-reflect') hitReflect += r.value
      }
    }
  // 混合职阶(宪法 v3):自带头部/站位/主职,不走基础职业线;普通专精 = 线 base + 专精修正
  const hy = isHybrid(member.spec) ? HYBRIDS[member.spec!] : undefined
  const baseSpec = hy ? hy : specOf(member.job, member.spec)
  const base = hy ? hy.base : job.base
  const mods = hy ? {} : (baseSpec as SpecDef).statMods ?? {}
  // 属性改革(切片 A):性格四维进面板——勇猛给伤害/谨慎给防御/贪婪给暴击/忠诚给受疗,
  // 以 50 为中性 ±6%~9%(幅度经 ⑱ 节奏带校准:乘法方差会抬高期望伤害),招募看性格不再只是看 AI 打法,也是看苗子的身体
  const p = member.personality ?? { bravery: 50, caution: 50, greed: 50, loyalty: 50 }
  const braveryAtkMult = 1 + (p.bravery - 50) * 0.0012
  const cautionDefMult = 1 + (p.caution - 50) * 0.0018
  const greedCrit = (p.greed - 50) * 0.0005
  const loyaltyHeal = (p.loyalty - 50) * 0.0012
  // 种族轻被动(宪法 v3,数值压在门禁精度下):矮人防/精灵暴击/兽人攻/血精灵受疗
  const race = member.race ? RACES[member.race] : RACES.human
  // 六维改革:种族招牌维加成并入有效属性;亡灵意志/人类经验保持独立字段
  const ab = race.attrBonus ?? {}
  const scarPen = scarPenalty(member)
  const eff = {
    str: Math.max(0, member.attrs.str + (ab.str ?? 0) + (scarPen.str ?? 0)),
    agi: Math.max(0, member.attrs.agi + (ab.agi ?? 0) + (scarPen.agi ?? 0)),
    int: Math.max(0, member.attrs.int + (ab.int ?? 0) + (scarPen.int ?? 0)),
    vit: Math.max(0, member.attrs.vit + (ab.vit ?? 0) + (scarPen.vit ?? 0)),
    spr: Math.max(0, member.attrs.spr + (ab.spr ?? 0) + (scarPen.spr ?? 0)),
    lck: Math.max(0, member.attrs.lck + (ab.lck ?? 0) + (scarPen.lck ?? 0)),
  }
  // 通用战技(DD Augment,跨专精携带)
  const augs = member.augments ?? []
  const augHp = augs.includes('aug-vit') ? 1.08 : 1
  const augDef = augs.includes('aug-iron') ? 2 : 0
  const augCrit = augs.includes('aug-eye') ? 0.03 : 0
  const augAtk = augs.includes('aug-blood') ? 3 : 0
  // R3 武器族(U31/W2):装备武器的族+熟练判定(职业表∪公会已学);非熟练=攻击降档
  const weaponBase = member.equipment.weapon ? ITEM_BASES[member.equipment.weapon.baseId] : undefined
  const weaponFamily = weaponBase?.family
  const weaponProficient = isFamilyProficient(member.job, weaponFamily, member.weaponLearned)
  const weaponProfMult = weaponFamily && !weaponProficient ? 0.85 : 1 // 结构占位,C4 统调
  // R3/W4 攻击方式与站位:武器决定站位与攻击方式(redesign §5「武器>头部>职业」);
  // 数值倍率全部 C4 结构占位(锤斧 伤×1.15/间隔×1.25,长柄 伤×0.92)
  const famDef = weaponFamily ? WEAPON_FAMILIES[weaponFamily] : undefined
  let stancePosition = hy ? hy.position : job.position
  let stanceRange = hy ? hy.range : job.range
  let weaponDmgMult: number | undefined
  let weaponIntervalMult = 1
  if (famDef) {
    if (famDef.mode === 'melee') { stancePosition = 'front'; stanceRange = 'melee' }
    else if (famDef.mode === 'ranged') { stancePosition = 'back'; stanceRange = 'ranged' }
    else if (famDef.mode === 'cast') {
      // 施法铁律:施法职业后排发法弹;不谙法术者退化为前排近战钝击(训练不授法术)
      if (canCastJob(member.job)) { stancePosition = 'back'; stanceRange = 'ranged' }
      else { stancePosition = 'front'; stanceRange = 'melee' }
    } else { stancePosition = 'front'; stanceRange = 'ranged' } // reach:立前排,长杆越线打后排
    weaponDmgMult = famDef.dmgMult
    weaponIntervalMult = famDef.intervalMult ?? 1
  }
  const maxHp = Math.round(
    (Math.max(1, base.maxHp + (mods.maxHp ?? 0)) +
      (member.level - 1) * job.growth.maxHp +
      eff.vit * 3 +
      (eq.maxHp ?? 0)) *
      augHp,
  )
  return {
    id: `c${++combatantSeq}`,
    name: member.name,
    team: 'guild',
    maxHp,
    // D13 修复：血量延续——带上成员当前血量进场（远征内的消耗才成立）
    hp: Math.max(1, Math.min(member.hp > 0 ? member.hp : maxHp, maxHp)),
    attack: Math.round(
      ((Math.max(1, base.attack + (mods.attack ?? 0)) + (member.level - 1) * job.growth.attack) *
        (1 + eff[job.attackAttr] * 0.05) +
        (eq.attack ?? 0)) *
        braveryAtkMult * weaponProfMult * staminaAttackMult(member) + augAtk,
    ),
    defense: Math.round(
      Math.max(0, base.defense + (mods.defense ?? 0) + augDef) *
        cautionDefMult +
        (member.level - 1) * job.growth.defense +
        (eq.defense ?? 0),
    ),
    critChance: base.critChance + (mods.critChance ?? 0) + augCrit + greedCrit + (eff.agi * 0.003 + eff.lck * 0.003) + (eq.critChance ?? 0) + equipmentSetBonus('wind-hunt', setHunt),
    attackInterval: Math.max(
      4,
      Math.round(((60 / (base.speed + (mods.speed ?? 0) + eff.agi * 0.04 + (eq.speed ?? 0))) * weaponIntervalMult) / (1 + (eq.attackSpeed ?? 0))),
    ),
    cooldownLeft: 0,
    alive: true,
    memberId: member.id,
    skills: (() => {
      const list = baseSpec.skills.map((def) => ({ def, cooldownLeft: 0 }))
      // 精进(宪法 v3):该专精记录的精进技能追加进组——切回专精即恢复
      const advId = member.specAdvanced?.[baseSpec.id]
      const adv = advId ? baseSpec.advancedSkills?.find((sk) => sk.id === advId) : undefined
      if (adv) list.push({ def: adv, cooldownLeft: 0 })
      return list
    })(),
    legacyFocus, legacyKillheal, legacyBulwark, legacyElitewarden, legacyEmberward, setCrown, setHunt,
    specId: baseSpec.id,
    spr: eff.spr,
    // #2.3:反弹=专精被动+棘肤词条(0.4 封顶);0/undefined=无反弹
    counterMult: (() => {
      const total = (baseSpec.passive === 'counter' ? 0.3 : 0) + Math.min(0.4, hitReflect)
      return total > 0 ? total : undefined
    })(),
    killHealPct: Math.min(0.15, killHealPct),
    lowHpAtkMult: Math.min(0.5, lowHpAtkMult),
    healReceived: loyaltyHeal + (race.passive.healReceived ?? 0) + eff.spr * 0.004 + (eq.healReceived ?? 0) + legacyMend,
    fireResist: Math.min(0.75, eq.fireResist ?? 0),
    // #2.2 批次 2 新属性(装备词条聚合;数值口径见各数学点,C4 占位)
    critDamage: eq.critDamage ?? 0,
    attackSpeed: eq.attackSpeed ?? 0,
    armorPen: eq.armorPen ?? 0,
    damageReduction: eq.damageReduction ?? 0,
    healPower: eq.healPower ?? 0,
    threatMult: eq.threatMult ?? 0,
    cdReduction: eq.cdReduction ?? 0,
    tauntedTicks: 0,
    position: stancePosition,
    range: stanceRange,
    role: hy ? hy.role : job.role,
    synergyIds: job.synergy ?? [],
    threat: {},
    lifesteal: eq.lifesteal,
    weaponFamily,
    weaponProficient,
    weaponDmgMult,
    personality: member.personality,
  }
}

export function enemyToCombatant(def: EnemyDef): Combatant {
  return {
    enemyDef: def,
    id: `c${++combatantSeq}`,
    name: def.name,
    team: 'enemy',
    maxHp: def.maxHp,
    hp: def.maxHp,
    attack: def.attack,
    defense: def.defense,
    critChance: 0.05,
    attackInterval: Math.max(6, Math.round(60 / def.speed)),
    cooldownLeft: 0,
    alive: true,
    traits: def.traits,
    // #5.3 荆棘外壳(thorns):复用既有反弹通道(counterMult)——近战打它会被扎
    counterMult: def.traits?.includes('thorns') ? 0.15 : undefined,
    skills: (def.skills ?? []).map((def2) => ({ def: def2, cooldownLeft: 0 })),
    bossMechanics: def.mechanics,
    mech: def.mechanics ? {} : undefined,
    tauntedTicks: 0,
    position: def.position,
    range: def.range,
    synergyIds: [],
    threat: {},
  }
}

export function createBattle(
  members: Member[],
  dungeon: DungeonDef,
  encounterId: string,
  seed: number,
  auraBonus = 0,
  manualBonus = 0,
  protectOn = true,
  potions?: { heal: number; fury: number },
  modifiers: DifficultyModifiers = {},
  /** 远征内事件状态(反馈④事件大项):乘数,只作用于我方;fireRes=加算(R5.1b 阴寒/湿透好处面) */
  mods?: { atk?: number; def?: number; hp?: number; heal?: number; fireRes?: number },
  /** 路况敌方修正(U27② 暴露攻击/R5.1b 阴寒减速):走 difficulty 通道,召唤增援经 scaleFactors 继承 */
  enemyMods?: { atk?: number; spd?: number },
): BattleState {
  const enc = dungeon.encounters.find((e) => e.id === encounterId)
  if (!enc) throw new Error(`未知遭遇战: ${encounterId}`)
  // 副本节奏系数(试玩反馈④:满配队 11-18s 秒杀 boss、机制零触发)——只作用于注册了
  // expectedLevel 的副本;高塔有自己的 scaleEnemy 分层缩放,不吃这套
  // Normal maps have fixed enemies: leveling must not raise the cost of revisiting them.
  const hasCurve = dungeon.expectedLevel !== undefined
  const hpFactor = hasCurve ? ENEMY_HP_MULT : 1
  // #0.2:缩放因子只算一次,初始怪/boss/召唤增援共用同一份(反接缝:唯一乘算点在 difficulty.applyEnemyScaling)
  const factors: EnemyScaleFactors = {
    power: dungeon.rating * (modifiers.elite ? ELITE_ENEMY_MULT : 1) * (modifiers.rareHunt ?? 1) *
      (modifiers.towerFloor === undefined ? 1 : towerEnemyScale(modifiers.towerFloor)),
    hpFactor,
    difficultyAttack: 1,
    difficultyHp: 1,
    elite: !!modifiers.elite,
  }
  if (enemyMods?.atk !== undefined) factors.difficultyAttack *= enemyMods.atk
  if (enemyMods?.spd !== undefined) factors.difficultySpd = enemyMods.spd
  const combatants: Combatant[] = members.map(toCombatant)
  if (mods) {
    for (const c of combatants) {
      if (mods.atk !== undefined) c.attack = Math.max(1, Math.round(c.attack * mods.atk))
      if (mods.def !== undefined && c.defense !== undefined) c.defense = Math.max(0, Math.round(c.defense * mods.def))
      if (mods.hp !== undefined) {
        c.maxHp = Math.max(1, Math.round(c.maxHp * mods.hp))
        c.hp = c.maxHp
      }
      // #2.7:治疗减半等词缀走独立乘区 healTakenMod(不再覆盖玩家堆的受疗词条)
      if (mods.heal !== undefined) c.healTakenMod = (c.healTakenMod ?? 1) * mods.heal
      // R5.1b 好处面:火抗加算(湿透;灼热地形受益)
      if (mods.fireRes !== undefined) c.fireResist = Math.min(0.9, (c.fireResist ?? 0) + mods.fireRes)
    }
  }
  for (const gid of enc.enemyGroupIds) {
    for (const e of dungeon.enemyGroups[gid] ?? []) {
      const raw = enemyToCombatant(e)
      applyScaling(raw, factors)
      combatants.push(raw)
    }
  }
  if (enc.bossId) {
    const def = dungeon.bosses[enc.bossId]
    const boss = enemyToCombatant(def)
    boss.boss = true
    boss.bossMechanics = def.mechanics
    boss.mech = {}
    applyScaling(boss, factors)
    const sumMech = def.mechanics.find((m) => m.kind === 'summon')
    if (sumMech) {
      boss.summonPool = dungeon.enemyGroups[String(sumMech.params.groupId)] ?? []
      boss.scaleFactors = factors
    }
    // U28 变体:克隆机制表再改写——原型 BossDef 与原 encounters 不被污染(门禁直连不受影响)
    if (enc.variant) {
      const clone = def.mechanics.map((m) => ({ ...m, params: { ...m.params } }))
      if (enc.variant.startEnrage !== undefined) {
        const enrage = clone.find((m) => m.kind === 'enrage')
        if (enrage) { enrage.params.atTick = 0; enrage.params.attackMult = enc.variant.startEnrage }
      }
      if (enc.variant.addMechanics?.length) clone.push(...enc.variant.addMechanics.map((m) => ({ ...m, params: { ...m.params } })))
      boss.bossMechanics = clone
      if (enc.variant.name) boss.name = enc.variant.name
    }
    combatants.push(boss)
  }

  // 单位身份归本场战斗，不能依赖跨页面的模块序号（恢复后会撞号）。
  combatants.forEach((c, index) => { c.id = `c${index + 1}` })
  // 初始仇恨：坦克开局 100，其他人 0（开怪站位的意义）
  const guild = combatants.filter((c) => c.team === 'guild')
  for (const e of combatants) {
    if (e.team !== 'enemy') continue
    for (const a of guild) {
      e.threat[a.id] = a.role === 'tank' ? 100 : 0
    }
  }

  // 默契倍率(M1 P0):每个我方成员与其同队成员的两两默契星数求和,每星 +3% 伤害
  const memberById = new Map(members.map((m) => [m.id, m]))
  const bondMults: Record<string, number> = {}
  for (const a of guild) {
    if (!a.memberId) continue
    const ma = memberById.get(a.memberId)
    if (!ma) continue
    let stars = 0
    for (const b2 of guild) {
      if (b2.memberId && b2.memberId !== a.memberId) {
        stars += bondStars(ma.bonds?.[b2.memberId] ?? 0)
      }
    }
    bondMults[a.id] = 1 + stars * BOND_MULT_PER_STAR
  }

  const state: BattleState = {
    unitSeq: combatants.length,
    tick: 0,
    combatants,
    log: [],
    status: 'running',
    rngState: seed | 0,
    events: [],
    commands: initCommands(potions),
    auraBonus,
    manualBonus,
    bondMults,
  }
  // 公会层面的撤退保护开关（D13 修复：此前面板开关不生效）——战斗内仍可临时切换
  state.commands.protectRetreat = protectOn
  // 灼热地形(版图二·龙脊山脉):dungeon.env==='heat' 时战斗中周期性全队火伤,火抗减免
  if (dungeon.env === 'heat') {
    state.envHeat = { everyTicks: 150, damage: 8, next: 150 }
    pushLog(state, 'system', '地面滚烫,热浪灼人——没有火抗的队伍会一直流血汗。')
  }
  // M-a 空间化(U41):初始摆位——我方左半场/敌方右半场,y 按序展开(前后排语义保留为摆位偏好,坐标才是判定)
  {
    let gi = 0, ei = 0
    for (const c of state.combatants) {
      if (!c.alive) continue
      if (c.team === 'guild') { c.pos = { x: 150 - (gi % 2) * 50, y: 110 + gi * 70 }; gi++ }
      else { c.pos = { x: 490 + (ei % 2) * 50, y: 110 + ei * 70 }; ei++ }
    }
  }
  pushLog(state, 'system', `—— ${enc.name} 战斗开始 ——`)
  if (enc.variant) {
    pushLog(state, 'system', `⚠ 眼前的 ${enc.variant?.name ?? enc.name} 与传闻中的同类不同——一现身就已在狂怒。`)
  }
  return JSON.parse(JSON.stringify(state)) as BattleState
}

/** 战斗内确定性随机（mulberry32 步进，与 sim/rng.ts 同族） */
function nextRandom(state: BattleState): number {
  state.rngState = (state.rngState + 0x6d2b79f5) | 0
  let t = state.rngState
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
export const battleRandom = nextRandom

function aliveOf(state: BattleState, team: 'guild' | 'enemy'): Combatant[] {
  return state.combatants.filter((c) => c.alive && c.team === team)
}

// ---- 轻协同词条（Q13）：效果引擎，词条数据在 data/jobs.ts SYNERGY ----

function synergyDamageMult(_state: BattleState, attacker: Combatant): number {
  // A6 #1.4:盾墙掩护无条件化——原「坦克存活时」条件删除(计划授权的收敛,坦克阵亡后仍生效=小幅加强);
  // 倍率保留 ×1.15 而非折入基础:乘数作用于含装备/成长的最终攻击,折基础无法在任意等级等效(实测 Lv13 -9% 触发节奏带翻车)。
  if (attacker.team !== 'guild') return 1
  return attacker.synergyIds.includes('shield-wall') ? 1.15 : 1
}

function effectiveAttack(state: BattleState, c: Combatant): number {
  const fury = c.team === 'guild' && state.commands.furyUntil > state.tick ? FURY_MULT : 1
  const stance = c.team === 'guild' ? STANCE_DMG[state.commands.stance] : 1
  const buff = c.buffUntil && state.tick < c.buffUntil ? (c.buffAttack ?? 0) : 0
  // 纪念堂光环 + 战术手册（D11）+ 默契（M1 P0）：死者的故事与公会的羁绊化作力量
  const legacy = c.team === 'guild' ? 1 + (state.auraBonus ?? 0) + (state.manualBonus ?? 0) : 1
  // 咏叹光环:持有者存活时全队伤害加成(stepBattle 每 tick 刷新 auraMult)
  const aura = c.team === 'guild' ? (c.auraMult ?? 1) : 1
  const bond = c.team === 'guild' ? (state.bondMults?.[c.id] ?? 1) : 1
  return (c.attack + buff) * fury * stance * legacy * bond * aura
}

function effectiveDefense(state: BattleState, target: Combatant, attacker?: Combatant): number {
  let def = target.defense
  // #2.2 破甲词条:攻击者定值先扣(对 shield 原型的针对性价值)
  if (attacker?.armorPen) def = Math.max(0, def - attacker.armorPen)
  // R5.3b(U33⑤)锤斧·破甲:被破甲者防御 ×0.8(3 秒)
  if (target.armorBreakUntilTick !== undefined && state.tick < target.armorBreakUntilTick) def *= 0.8
  if (target.team === 'guild') {
    // 祝福阵型：治疗者存活时，全队防御 +10%
    if (aliveOf(state, 'guild').some((a) => a.role === 'healer')) def *= 1.1
    def *= STANCE_DEF[state.commands.stance]
  }
  return def
}

// ---- 目标选择 ----

/** 近战只能打存活的前排；前排清空后后排暴露 */
function allowedPool(attacker: Combatant, foes: Combatant[]): Combatant[] {
  if (attacker.range === 'melee') {
    const front = foes.filter((f) => f.position === 'front')
    if (front.length > 0) return front
  }
  return foes
}

// ---- R3/W3 武器族技能门槛 ----

/** 技能对当前武器是否可用;不可用返回人话原因(UI 悬停同源),可用返回 null。
 *  敌方(含召唤增援)与未标注('universal'/undefined)一律放行——敌方技能默认通用;
 *  空手(未持武器)不触发族门槛——R3 惩罚的是"拿错武器",不是"没拿武器",老档行为零变。 */
export function skillFamilyBlocked(c: Combatant, families: readonly import('./types').WeaponFamily[] | 'universal' | undefined): string | null {
  if (c.team !== 'guild') return null
  if (!families || families === 'universal') return null
  const fam = c.weaponFamily
  if (!fam) return null
  if (!families.includes(fam)) {
    return `需 ${families.map((f) => WEAPON_FAMILIES[f].name).join('/')}(当前:${WEAPON_FAMILIES[fam].name})`
  }
  if (c.weaponProficient === false) return `${WEAPON_FAMILIES[fam].name}非熟练,族内技能失效`
  return null
}

/** 敌方按威胁选目标，带抖动（偶尔打二号仇恨） */
function pickByThreat(state: BattleState, pool: Combatant[], enemy: Combatant): Combatant {
  const scored = pool
    .map((c) => ({ c, t: enemy.threat[c.id] ?? 0 }))
    .sort((a, b) => b.t - a.t)
  const dither = scored.length > 1 && nextRandom(state) < THREAT_DITHER ? 1 : 0
  return scored[dither].c
}

/** 命中结算：血量、仇恨、咏唱打断积攒、事件与战报、死亡（AOE/技能/普攻共用） */
export function applyHit(
  state: BattleState,
  attacker: Combatant,
  target: Combatant,
  amount: number,
  label: string,
  opts?: { crit?: boolean; ranged?: boolean },
): void {
  // R5.3b(U33⑤)长柄·替身挡击:敌方普攻点名我方非长柄队员时,前排长柄队友替其挡下(每场一次)
  if (attacker.team === 'enemy' && label === '攻击' && target.team === 'guild' && target.weaponFamily !== 'polearm' && attacker.range === 'melee') {
    const guard = state.combatants.find((g) => g.team === 'guild' && g.alive && g.weaponFamily === 'polearm' && !g.guardOnceUsed && g.position === 'front' && g.id !== target.id)
    if (guard) {
      guard.guardOnceUsed = true
      state.events.push({ tick: state.tick, type: 'guarded', attackerId: guard.id, targetId: target.id })
      pushLog(state, 'guild', `🛡 ${guard.name} 挺械替 ${target.name} 挡下了这一击!`)
      return applyHit(state, attacker, guard, amount, label, opts)
    }
  }
  // #5.3 游斗(evasive):对近战普攻 20% 闪避(C4)——技能与招牌必中,保住打断系与必中流的价值
  if (label === '攻击' && attacker.range === 'melee' && target.alive && target.traits?.includes('evasive') && nextRandom(state) < 0.2) {
    traitHint(state, 'evasive')
    state.events.push({ tick: state.tick, type: 'dodge', attackerId: attacker.id, targetId: target.id })
    pushLog(state, target.team, `💨 ${target.name} 侧身避开了 ${attacker.name} 的挥击!`)
    return
  }
  // Mitigation must precede HP loss, shields, threat and interrupt accounting.
  if (target.traits?.includes('heavy-plate') && !target.plateUsed) {
    traitHint(state, 'heavy-plate')
    target.plateUsed = true
    amount = Math.max(1, Math.round(amount * 0.6))
    state.events.push({ tick: state.tick, type: 'armorbreak', targetId: target.id })
  }
  if (opts?.crit && target.traits?.includes('dragon-scale')) {
    traitHint(state, 'dragon-scale')
    amount = Math.max(1, Math.round(amount * 0.5))
  }
  // R5.3b(U33⑤)刃·暴击流血:暴击时附加 3 秒持续流血(总量 = 该次伤害 ×30%,与灼烧分开计)
  if (opts?.crit && attacker.weaponFamily === 'blade' && target.alive && amount > 0) {
    target.bleedUntilTick = state.tick + 30
    target.bleedPerTick = Math.max(1, Math.round((amount * 0.3) / 3))
    state.events.push({ tick: state.tick, type: 'bleed', attackerId: attacker.id, targetId: target.id })
    pushLog(state, target.team === 'guild' ? 'enemy' : 'guild', `🩸 ${attacker.name} 的刀口让 ${target.name} 流血不止!`)
  }
  // R5.3b(U33⑤)锤斧·普攻破甲:命中后目标防御 ×0.8 持续 3 秒
  if (label === '攻击' && attacker.weaponFamily === 'axe' && target.alive) {
    target.armorBreakUntilTick = state.tick + 30
    state.events.push({ tick: state.tick, type: 'armorbreak', targetId: target.id })
  }
  // 吸收盾(戒律/圣盾使):伤害先扣盾,余量才进血
  if (target.absorbShield && target.absorbShield > 0) {
    const absorbed = Math.min(target.absorbShield, amount)
    target.absorbShield -= absorbed
    amount -= absorbed
    if (absorbed > 0) {
      state.events.push({ tick: state.tick, type: 'shielded', targetId: target.id, amount: absorbed })
      pushLog(state, target.team, '🛡 ' + target.name + ' 的护盾吸收了 ' + absorbed + ' 点伤害')
    }
    if (amount <= 0) return
  }
  // 诅咒易伤(痛苦/咒印):受伤加深
  if (target.vulnUntilTick && state.tick < target.vulnUntilTick) {
    amount = Math.round(amount * (target.vulnMult ?? 1.2))
  }
  // #2.2 减伤词条:受伤乘区(0.6 封顶,与防御的定值减算分工)
  if (target.damageReduction) {
    amount = Math.max(1, Math.round(amount * (1 - Math.min(0.6, target.damageReduction))))
  }
  // 装备 2.0 传承威能·磐石:受到 boss 的伤害 -8%
  if (target.legacyBulwark && attacker.team === 'enemy' && attacker.boss) {
    amount = Math.round(amount * 0.92)
  }
  target.hp = Math.max(0, target.hp - amount)
  // 反伤被动(荆棘/裂阵):近战命中者反弹 fraction
  if (target.counterMult && attacker.range === 'melee' && attacker.alive) {
    const back = Math.max(1, Math.round(amount * target.counterMult))
    attacker.hp = Math.max(0, attacker.hp - back)
    state.events.push({ tick: state.tick, type: 'counter', attackerId: target.id, targetId: attacker.id, amount: back })
    if (attacker.hp <= 0 && attacker.alive) {
      attacker.alive = false
      state.events.push({ tick: state.tick, type: 'death', targetId: attacker.id })
      pushLog(state, 'system', '☠ ' + attacker.name + ' 倒下了')
    }
  }
  // 吸血词条：攻击者按比例回血（静默，不产生事件）
  if (attacker.lifesteal && attacker.alive) {
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + Math.round(amount * attacker.lifesteal))
  }
  if (attacker.team === 'guild') {
    target.threat[attacker.id] = (target.threat[attacker.id] ?? 0) + amount * (1 + (attacker.threatMult ?? 0))
  }
  // 特质·venom(淬毒):命中附加易伤
  if (attacker.traits?.includes('venom') && target.alive) {
    traitHint(state, 'venom')
    target.vulnUntilTick = state.tick + 30
    target.vulnMult = 1.15
  }
  // 特质·ember-breath(灼息,版图二):命中点燃目标,持续灼烧
  if (attacker.traits?.includes('ember-breath') && target.alive) {
    traitHint(state, 'ember-breath')
    target.burnUntilTick = state.tick + 40
    target.burnFrom = attacker.id
  }
  // A5 #1.3 火法叠灼烧:火焰法师(及其宠物)的命中为目标 +1 层灼烧(资源挂目标身上,禁全局资源系统)
  if (attacker.team === 'guild' && (attacker.specId === 'mage-fire' || attacker.petOf && state.combatants.find((x) => x.id === attacker.petOf)?.specId === 'mage-fire') && target.alive) {
    target.burnStacks = Math.min(5, (target.burnStacks ?? 0) + 1)
  }
  // 特质·dragon-fear(龙威,版图二):命中压制目标,攻击暂降
  if (attacker.traits?.includes('dragon-fear') && target.alive) {
    traitHint(state, 'dragon-fear')
    target.fearUntilTick = state.tick + 40
  }
  if (attacker.traits?.some(t => t === 'ember-breath' || t === 'dragon-fear')) recordScarMechanic(attacker, target)
  // 我方引导咏唱:被打的伤害累积,超过阈值即打断
  if (target.channelUntilTick && state.tick < target.channelUntilTick) {
    target.channelTaken = (target.channelTaken ?? 0) + amount
  }
  // Ordinary enemies and bosses share declaration-based interrupt accumulation.
  // R5.3c(U33⑤)打断改规则:只有锤斧族的伤害按 1.0 累积读条打断值,其他武器/来源按 0.25
  // (C4 占位;打断类招牌技不受影响——executeSignature 直接置 taken=阈值,不经此通道)。
  if (target.bossMechanics && target.mech) {
    const interruptMult = attacker.weaponFamily === 'axe' ? 1 : 0.25
    for (const def of target.bossMechanics) {
      if (interruptThreshold(def) === undefined) continue
      const rt = target.mech[def.kind]
      if (rt?.until !== undefined && state.tick < rt.until) {
        rt.taken = (rt.taken ?? 0) + amount * interruptMult
      }
    }
  }
  state.events.push({
    tick: state.tick,
    type: 'damage',
    attackerId: attacker.id,
    targetId: target.id,
    amount,
    crit: opts?.crit,
    ranged: opts?.ranged,
  })
  // A13 后续:败因台账——敌方对己方伤害累计(事件会被 checkpoint 裁剪,台账不受影响)
  if (attacker.team === 'enemy' && target.team === 'guild' && target.memberId) {
    state.guildDmgTaken = { ...state.guildDmgTaken, [attacker.id]: (state.guildDmgTaken?.[attacker.id] ?? 0) + amount }
  }
  // A3 荆棘咆哮:反甲——击中带荆棘的守卫,部分伤害当场奉还
  if (
    target.thornsUntilTick && state.tick < target.thornsUntilTick &&
    target.alive && attacker.alive && attacker.team === 'enemy'
  ) {
    const reflect = Math.max(1, Math.round(amount * 0.25))
    attacker.hp = Math.max(0, attacker.hp - reflect)
    state.events.push({ tick: state.tick, type: 'damage', attackerId: target.id, targetId: attacker.id, amount: reflect })
    pushLog(state, 'guild', `🌵 荆棘反甲刺穿了 ${attacker.name},奉还 ${reflect} 点伤害！`)
    if (attacker.hp === 0) {
      attacker.alive = false
      pushLog(state, 'guild', `🌵 ${attacker.name} 死在了荆棘反甲上！`)
    }
  }
  pushLog(
    state,
    attacker.team,
    `${attacker.name} ${label}${target.name}，造成 ${amount}${opts?.crit ? '（暴击！）' : ''} 伤害`,
  )
  if (target.hp <= 0 && target.alive) {
    target.alive = false
    state.events.push({ tick: state.tick, type: 'death', targetId: target.id })
    pushLog(state, 'system', `☠ ${target.name} 倒下了`)
    // #5.3 复生怨念(vengeful):死亡瞬间缠上击杀者,反弹其自身攻击力(斩杀谁先谁后有了代价)
    if (target.traits?.includes('vengeful') && attacker.alive && attacker.team !== target.team) {
      const back = Math.max(1, Math.round(target.attack))
      attacker.hp = Math.max(0, attacker.hp - back)
      state.events.push({ tick: state.tick, type: 'counter', attackerId: target.id, targetId: attacker.id, amount: back })
      pushLog(state, 'guild', `💀 ${target.name} 的怨念缠上了 ${attacker.name},奉还 ${back} 点伤害!`)
      if (attacker.hp <= 0 && attacker.alive) {
        attacker.alive = false
        state.events.push({ tick: state.tick, type: 'death', targetId: attacker.id })
        pushLog(state, 'system', `☠ ${attacker.name} 倒下了`)
      }
    }
    // B3-4 死因写入词缀:被带词缀敌人击杀 → 词缀名记入死者(DeathCause.affixes 消费)
    const killedAffix = target.team === 'guild' && attacker.team === 'enemy'
      ? (Object.values(MONSTER_AFFIXES).map((d) => d.name).find((n) => attacker.name.includes(n)) ?? undefined)
      : undefined
    if (killedAffix) (target as { deathAffixes?: string[] }).deathAffixes = [killedAffix]
    // #3.3 亡语钩子(U22):词缀怪死亡瞬间执行其已登记 kind 的效果(此处 ground-zone=腐蚀之地)
    const deathwargMech = target.bossMechanics?.find((m) => Boolean((m.params as Record<string, unknown> | undefined)?.onDeath))
    if (deathwargMech && target.team === 'enemy') {
      const dps = typeof deathwargMech.params.dps === 'number' ? deathwargMech.params.dps : 6
      for (const g of aliveOf(state, 'guild')) {
        g.hp = Math.max(0, g.hp - dps)
        if (g.hp <= 0 && g.alive) {
          g.alive = false
          state.events.push({ tick: state.tick, type: 'death', targetId: g.id })
          pushLog(state, 'system', `☠ ${g.name} 倒下了`)
        }
      }
      pushLog(state, 'guild', `☠ ${target.name} 的【${deathwargMech.name}】爆发——地面腐蚀,全队受到 ${dps} 点伤害!(触发提示:亡语)`)
    }
    // 装备 2.0 传承威能·饮血:己方击杀敌人时,持有者回复 2% 最大生命
    if (target.team === 'enemy' && attacker.team === 'guild') {
      for (const g of aliveOf(state, 'guild')) {
        const pct = (g.legacyKillheal ? 0.02 : 0) + (g.killHealPct ?? 0)
        if (pct <= 0) continue
        const back = Math.max(1, Math.round(g.maxHp * pct))
        g.hp = Math.min(g.maxHp, g.hp + back)
      }
    }    // 死亡特质:湮灭自爆/冰封遗骸/临终呼援
    if (target.traits?.includes('death-blast')) {
      traitHint(state, 'death-blast')
      for (const g of aliveOf(state, target.team === 'enemy' ? 'guild' : 'enemy')) {
        applyHit(state, target, g, 12, '湮灭自爆')
      }
      pushLog(state, 'enemy', `💥 ${target.name} 的尸体轰然爆炸!`)
    }
    if (target.traits?.includes('death-zone') && attacker && attacker.alive) {
      traitHint(state, 'death-zone')
      const zt = controlResist(attacker, 20)
      attacker.slowUntilTick = state.tick + zt
      state.events.push({ tick: state.tick, type: 'slowed', targetId: attacker.id, amount: zt })
      pushLog(state, 'enemy', `❄ ${target.name} 的遗骸冻住了 ${attacker.name} 的脚步!`)
    }
    if (target.traits?.includes('call-reinforce') && battleRandom(state) < 0.3) {
      traitHint(state, 'call-reinforce')
      const clone: Combatant = {
        ...target,
        id: allocateBattleId(state),
        hp: Math.max(1, Math.round(target.maxHp * 0.5)),
        alive: true,
        traits: target.traits?.filter((t2) => t2 !== 'call-reinforce'),
        threat: {},
        mech: {},
      }
      state.combatants.push(clone)
      pushLog(state, 'enemy', `⚠ ${target.name} 临终呼来了增援!`)
      state.events.push({ tick: state.tick, type: 'summoned', targetId: clone.id })
    }
  }
}

function dealDamage(
  state: BattleState,
  attacker: Combatant,
  target: Combatant,
  mult: number,
  label: string,
  opts?: { ignoreDefense?: boolean },
): void {
  // 相位无敌(敌人侧):一切伤害穿身而过
  if (target.invulnUntilTick && state.tick < target.invulnUntilTick) {
    state.events.push({ tick: state.tick, type: 'phase', targetId: target.id })
    pushLog(state, attacker.team, `${target.name} 处于相位之中,攻击无效!`)
    return
  }
  // 特质:volley(每第 3 击必暴)/pack-hunter(每存活同类 +8%)/last-stand(低血 ×1.4)
  let forcedCrit = false
  let packMult = 1
  if (attacker.traits?.includes('volley')) traitHint(state, 'volley')
  if (attacker.traits?.includes('pack-hunter')) traitHint(state, 'pack-hunter')
  if (attacker.traits?.includes('last-stand') && attacker.hp / attacker.maxHp < 0.3) traitHint(state, 'last-stand')
  if (attacker.traits?.includes('volley')) {
    attacker.atkCount = (attacker.atkCount ?? 0) + 1
    if (attacker.atkCount % 3 === 0) forcedCrit = true
  }
  if (attacker.traits?.includes('pack-hunter')) {
    const kin = aliveOf(state, attacker.team).filter((a) => a.name === attacker.name).length
    packMult *= 1 + Math.max(0, kin - 1) * 0.08
  }
  if (attacker.traits?.includes('last-stand') && attacker.hp / attacker.maxHp < 0.3) packMult *= 1.4
  // #2.3 背水词条:生命低于 30% 时伤害 +(乘区)
  if (attacker.lowHpAtkMult && attacker.hp / attacker.maxHp < 0.3) {
    traitHint(state, 'last-stand')
    packMult *= 1 + attacker.lowHpAtkMult
  }
  // 龙威压制(版图二 dragon-fear 特质/龙威光环):被压制的单位出伤 ×0.85
  const fearMult = attacker.fearUntilTick && state.tick < attacker.fearUntilTick ? 0.85 : 1
  let variance = 0.85 + nextRandom(state) * 0.3
  let crit = nextRandom(state) < attacker.critChance
  if (forcedCrit) { crit = true; variance = Math.max(variance, 1.0) }
  let raw =
    effectiveAttack(state, attacker) *
    mult *
    packMult *
    variance *
    fearMult *
    (crit ? 1.5 + (attacker.critDamage ?? 0) : 1) *
    synergyDamageMult(state, attacker)
  if (attacker.team === 'guild' && state.commands.focusId === target.id) {
    raw *= FOCUS_MULT
    // 装备 2.0 传承威能·锋镝:对集火目标伤害额外 +10%
    if (attacker.legacyFocus) raw *= 1.1
  }
  // 传承威能·嗜功:对精英与 boss 伤害 +8%
  if (attacker.legacyElitewarden && target.team === 'enemy' && (target.boss || target.elite)) {
    raw *= 1.08
  }
  // K08 套装数值与面板共用定义。
  raw *= 1 + equipmentSetBonus('gray-crown', attacker.setCrown ?? 0)
  const dmg = opts?.ignoreDefense
    ? Math.max(1, Math.round(raw))
    : Math.max(
        1,
        Math.round((raw * MITIGATION_K) / (MITIGATION_K + effectiveDefense(state, target, attacker))),
      )
  applyHit(state, attacker, target, dmg, label, {
    crit,
    ranged: attacker.range === 'ranged',
  })
  // 霜寒触摸(slow-touch 被动):命中概率减速目标——行动间隔加倍,持续可刷新
  const slowDef = attacker.bossMechanics?.find((m) => m.kind === 'slow-touch')
  if (slowDef && target.alive) {
    const chance = typeof slowDef.params.chance === 'number' ? slowDef.params.chance : MECHANIC_REGISTRY[slowDef.kind].defaults.chance
    if (battleRandom(state) < chance) {
      let ticks = typeof slowDef.params.ticks === 'number' ? slowDef.params.ticks : MECHANIC_REGISTRY[slowDef.kind].defaults.ticks
      ticks = controlResist(target, ticks)
      target.slowUntilTick = state.tick + ticks
      state.events.push({ tick: state.tick, type: 'slowed', targetId: target.id, amount: ticks })
      pushLog(state, 'enemy', `❄ ${target.name} 被【${slowDef.name}】冻结,行动变缓！`)
    }
  }
}

/** 普通技能与招牌技共用施放时的冷却折算，计时仍由模拟 tick 驱动。 */
function skillCooldownTicks(base: number, caster: Combatant): number {
  return Math.round(base / (1 + (caster.cdReduction ?? 0)))
}

function actWith(c: Combatant, state: BattleState): void {
  const allies = aliveOf(state, c.team)
  const foes = aliveOf(state, c.team === 'guild' ? 'enemy' : 'guild')
  if (foes.length === 0) return
  const pool = allowedPool(c, foes)

  // AI 多技能择优:逆序逐个尝试(情境技/精进技优先,基础输出压轴),条件不满足则回落
  for (const ready of [...c.skills].reverse()) {
    if (ready.cooldownLeft > 0) continue
    if (skillFamilyBlocked(c, ready.def.weaponFamily)) continue // R3/W3:非熟练/族不合,AI 不会傻按
    if (useSkill(c, ready.def, allies, pool, state)) {
      // #2.2 冷却缩减:施放时一次折算(无小数累积)
      ready.cooldownLeft = skillCooldownTicks(ready.def.cooldownTicks, c)
      return
    }
  }

  let target: Combatant | undefined
  if (c.team === 'enemy') {
    // 嘲讽强制（若嘲讽对象已死则回落威胁表）
    if (c.tauntedTicks > 0 && c.taunterId) {
      target = pool.find((f) => f.id === c.taunterId)
    }
    if (!target) target = pickByThreat(state, pool, c)
  } else {
    // 团长集火优先（指挥台 D8-9）
    if (state.commands.focusId) {
      target = pool.find((f) => f.id === state.commands.focusId)
    }
    if (!target) {
      // 协同走位（节奏改版修复）：默认打坦克正在打的目标，保持威胁一致性——
      // 旧逻辑"残血优先"会让游侠全程单刷后排,把远程怪的仇恨从坦克身上拉走(威胁表 51% 失效)
      const tank = aliveOf(state, 'guild').find((c) => c.role === 'tank')
      if (tank) {
        const best = pool.reduce((a, b) => ((a.threat[tank.id] ?? 0) >= (b.threat[tank.id] ?? 0) ? a : b))
        if ((best.threat[tank.id] ?? 0) > 0) target = best
      }
    }
    if (!target) {
      // 兜底：坦克缺席/无威胁信息时回到残血优先
      target = pool.reduce((a, b) => (a.hp <= b.hp ? a : b))
    }
  }
  // R3/W4:普攻吃武器族伤害乘区(锤斧 ×1.15/长柄 ×0.92);技能不吃,族内技能另有门槛
  // R5.3b(U33⑤)弓·独有用处:优先射击正在读条的后排;无读条者打残血(改写默认威胁/集火逻辑)
  if (c.weaponFamily === 'bow') {
    const bowPick = pickBowTarget(state, pool)
    if (bowPick) dealDamage(state, c, bowPick, 1.0 * (c.weaponDmgMult ?? 1), '攻击')
    return
  }
  if (!target) return
  // M-a 空间化:射程判定——目标在射程外则追击(本 tick 不出手),进入射程才攻击
  if (c.pos && target.pos) {
    const range = c.range === 'melee' ? MELEE_RANGE : RANGED_RANGE
    if (dist(c.pos, target.pos) > range) {
      c.moveTarget = { x: target.pos.x, y: target.pos.y }
      return
    }
    c.moveTarget = undefined // 射程内:清追击,恢复站桩输出
  }
  dealDamage(state, c, target, 1.0 * (c.weaponDmgMult ?? 1), '攻击')
}

function useSkill(
  c: Combatant,
  skill: SkillDef,
  allies: Combatant[],
  pool: Combatant[],
  state: BattleState,
  forcedTarget?: Combatant, // #7.1(U39)RTS 式点选施法:玩家指定的目标优先(仅单体效果尊重;AOE/召唤无视)
): boolean {
  switch (skill.effect) {
    case 'heavy-strike': {
      const target = forcedTarget && pool.includes(forcedTarget) ? forcedTarget : pool.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b))
      dealDamage(state, c, target, 1.8, `释放【${skill.name}】命中`)
      return true
    }
    case 'heal-lowest': {
      if (forcedTarget && allies.includes(forcedTarget)) {
        const amount = computeHeal(c, forcedTarget, Math.round(c.attack * 4.5), 'skill')
        forcedTarget.hp = Math.min(forcedTarget.maxHp, forcedTarget.hp + amount)
        state.events.push({ tick: state.tick, type: 'heal', attackerId: c.id, targetId: forcedTarget.id, amount })
        pushLog(state, 'guild', `${c.name} 释放【${skill.name}】，为 ${forcedTarget.name} 恢复 ${amount} 点生命`)
        return true
      }
      const hurt = allies.filter((a) => a.hp / a.maxHp < 0.75)
      if (hurt.length === 0) return false
      const target = hurt.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b))
      // 治疗吞吐须覆盖 boss 基础压力:D15 加压轮后 3.0 倍;节奏改版(血池×1.5/战斗拉长)后
      // 牧师基础攻击 7.0 配 4.5 倍 ≈ 31/s,恢复 D15 校准的绝对吞吐,否则长战斗必崩盘
      const amount = computeHeal(c, target, Math.round(c.attack * 4.5), 'skill')
      target.hp = Math.min(target.maxHp, target.hp + amount)
      // 治疗仇恨：0.4× 转化为威胁(节奏改版④:战斗拉长后 1:1 会让牧师威胁反超坦克,
      // 远程转火治疗——打折扣保住坦克仇恨线;坦克倒下后累积仍会居首,兜底逻辑不变)
      for (const e of aliveOf(state, 'enemy')) {
        e.threat[c.id] = (e.threat[c.id] ?? 0) + Math.round(amount * 0.4)
      }
      state.events.push({
        tick: state.tick,
        type: 'heal',
        attackerId: c.id,
        targetId: target.id,
        amount,
      })
      pushLog(state, 'guild', `${c.name} 释放【${skill.name}】，为 ${target.name} 恢复 ${amount} 点生命`)
      return true
    }
    case 'taunt': {
      const victim = pool.reduce((a, b) => (a.maxHp >= b.maxHp ? a : b))
      victim.tauntedTicks = 50
      victim.taunterId = c.id
      // 嘲讽同时注入高额仇恨：嘲讽结束威胁依然在
      victim.threat[c.id] = (victim.threat[c.id] ?? 0) + 200
      pushLog(state, 'guild', `${c.name} 释放【${skill.name}】，${victim.name} 被激怒了！`)
      return true
    }
    case 'charge-strike': {
      // 破城冲锋:高伤 + 注入大仇恨(破城锤手/冲锋队长——威胁靠伤害堆)
      const target = pool.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b))
      dealDamage(state, c, target, 1.6, `释放【${skill.name}】撞上`)
      for (const e of aliveOf(state, 'enemy')) {
        e.threat[c.id] = (e.threat[c.id] ?? 0) + 120
      }
      return true
    }
    case 'group-heal': {
      const hurt = allies.filter((a) => a.hp / a.maxHp < 0.7)
      if (hurt.length === 0) return false
      const amount = Math.round(c.attack * 3.0)
      for (const a of hurt) {
        a.hp = Math.min(a.maxHp, a.hp + amount)
        state.events.push({ tick: state.tick, type: 'heal', attackerId: c.id, targetId: a.id, amount })
      }
      pushLog(state, 'guild', `${c.name} 释放【${skill.name}】，恢复 ${hurt.length} 人各 ${amount} 点生命`)
      return true
    }
    case 'shield-ally': {
      // 真言盾:给最脆的人上吸收盾;全队 >75% 时不施放(时机条件——AI 不再满血乱交盾)
      if (allies.every((a) => a.hp / a.maxHp > 0.75)) return false
      const target = forcedTarget && allies.includes(forcedTarget) ? forcedTarget : allies.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b))
      const shield = Math.round(c.attack * 6)
      target.absorbShield = (target.absorbShield ?? 0) + shield
      state.events.push({ tick: state.tick, type: 'shielded', targetId: target.id, amount: shield })
      pushLog(state, 'guild', `${c.name} 释放【${skill.name}】，为 ${target.name} 挂上 ${shield} 点护盾`)
      return true
    }
    case 'curse-mark': {
      // 痛苦诅咒:目标受伤 +25%,持续 12s
      const target = forcedTarget && pool.includes(forcedTarget) ? forcedTarget : pool.reduce((a, b) => (a.maxHp >= b.maxHp ? a : b))
      target.vulnUntilTick = state.tick + 120
      target.vulnMult = 1.25
      state.events.push({ tick: state.tick, type: 'cursed', targetId: target.id })
      pushLog(state, 'guild', `${c.name} 释放【${skill.name}】，${target.name} 成了全队的活靶子！`)
      return true
    }
    case 'frost-nova': {
      // 霜寒新星:全体敌方(按施放者阵营)减速 + 轻伤
      let hit = 0
      for (const e of aliveOf(state, c.team === 'guild' ? 'enemy' : 'guild')) {
        e.slowUntilTick = state.tick + 80
        hit++
        dealDamage(state, c, e, 0.5, '被霜寒新星扫过')
      }
      if (hit === 0) return false
      pushLog(state, 'guild', `${c.name} 释放【${skill.name}】，${hit} 个敌人被冻得步履蹒跚！`)
      return true
    }
    case 'multishot': {
      // 弹幕:最多打两个目标(奥术飞弹/旋风斩)
      const targets = pool.slice(0, 2)
      if (targets.length === 0) return false
      for (const t of targets) dealDamage(state, c, t, 1.0, `被【${skill.name}】命中`)
      return true
    }
    case 'trap-bind': {
      // 捕兽夹:束缚目标 2s(猎手控场)
      const target = pool.reduce((a, b) => (a.maxHp >= b.maxHp ? a : b))
      const bindTicks = controlResist(target, 20)
      target.boundUntilTick = state.tick + bindTicks
      state.events.push({ tick: state.tick, type: 'bound', targetId: target.id, amount: bindTicks })
      pushLog(state, 'guild', `${c.name} 的【${skill.name}】咬住了 ${target.name}！`)
      return true
    }
    case 'summon-pet': {
      // 召唤物(战狼/小鬼/契灵):每场一只,存活期间技能不可用(回落平砍)
      if (state.combatants.some((x) => x.petOf === c.id && x.alive)) return false
      const pet = summonPet(c, state)
      state.combatants.push(pet)
      state.events.push({ tick: state.tick, type: 'summoned', targetId: pet.id })
      pushLog(state, 'guild', `${c.name} 释放【${skill.name}】，${pet.name} 出现在战场上！`)
      return true
    }
    case 'armor-break': {
      // 护甲击碎:永久削减目标防御——磨高防盾卫/重甲 boss 的先手
      const target = pool.reduce((a, b) => (a.maxHp >= b.maxHp ? a : b))
      dealDamage(state, c, target, 0.8, `释放【${skill.name}】`)
      target.defense = Math.max(0, target.defense - 4)
      state.events.push({ tick: state.tick, type: 'armorbreak', targetId: target.id })
      pushLog(state, 'guild', `【${skill.name}】奏效——${target.name} 的护甲被击碎,防御永久下降!`)
      return true
    }
    case 'combo-strike': {
      // 连击资源:2 层连击时爆发(高倍率并清空),否则积攒——节奏型输出的资源循环
      c.combo = c.combo ?? 0
      const target = pool.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b))
      if (c.combo >= 2) {
        c.combo = 0
        dealDamage(state, c, target, 2.2, `【${skill.name}】连击爆发`)
      } else {
        c.combo += 1
        dealDamage(state, c, target, 1.0, `释放【${skill.name}】`)
      }
      return true
    }
    case 'reposition': {
      // 位移:优先救回被拉拽的队友(解除拉拽归位),否则把最伤的前排换到后排
      const pulledAlly = allies.find((a) => a.pulledUntilTick && state.tick < a.pulledUntilTick)
      if (pulledAlly) {
        if (pulledAlly.originalPosition) pulledAlly.position = pulledAlly.originalPosition
        pulledAlly.pulledUntilTick = undefined
        state.events.push({ tick: state.tick, type: 'reposition', targetId: pulledAlly.id })
        pushLog(state, 'guild', `${c.name} 掩护 ${pulledAlly.name} 脱离拉拽,回到了自己的位置!`)
        return true
      }
      const front = allies.filter((a) => a.position === 'front' && a.id !== c.id)
      if (front.length === 0) return false
      const hurt = front.reduce((a, b2) => (a.hp / a.maxHp <= b2.hp / b2.maxHp ? a : b2))
      hurt.position = 'back'
      state.events.push({ tick: state.tick, type: 'reposition', targetId: hurt.id })
      pushLog(state, 'guild', `${c.name} 掩护 ${hurt.name} 撤到了后排!`)
      return true
    }
    case 'channel-heal': {
      // 我方引导咏唱:引导 4s 后全队大治疗;期间自身受伤 ≥ 阈值则被打断——守住治疗者!
      if (allies.every((a) => a.hp / a.maxHp > 0.8)) return false
      if (c.channelUntilTick && state.tick < c.channelUntilTick) return false
      c.channelUntilTick = state.tick + 40
      c.channelTaken = 0
      c.channelBreak = Math.round(c.attack * 3)
      c.channelAmount = Math.round(c.attack * 8)
      state.events.push({ tick: state.tick, type: 'casting', targetId: c.id, amount: 40 })
      pushLog(state, 'guild', `${c.name} 开始引导【${skill.name}】——守住她!`)
      return true
    }
    case 'enchant-self': {
      // 附魔:自我攻击加成
      c.buffAttack = Math.round(c.attack * 0.3)
      c.buffUntil = state.tick + 150
      pushLog(state, 'guild', `${c.name} 释放【${skill.name}】，武器燃起了魔力！`)
      return true
    }
  }
}

/** 首次遭遇提示(宪法 v3.4):每场每特质只提示一次 */
export function traitHint(state: BattleState, traitId: string): void {
  if (!state.traitSeen) state.traitSeen = {}
  if (state.traitSeen[traitId]) return
  state.traitSeen[traitId] = true
  const info = TRAIT_INFO[traitId]
  if (info) pushLog(state, 'system', '⚠ 首次遭遇——' + info.name + ':' + info.hint)
}

/** 控制韧性(宪法 v3.3):我方精神缩短被控时长(至多 -40%) */
export function controlResist(target: Combatant, ticks: number): number {
  if (target.team !== 'guild') return ticks
  return Math.max(6, Math.round(ticks * (1 - Math.min(0.4, (target.spr ?? 0) * 0.008))))
}

/** 召唤物:属性随召唤者成长,无 memberId(阵亡不进纪念堂) */
function summonPet(caster: Combatant, state: BattleState): Combatant {
  const atk = Math.max(3, Math.round(caster.attack * 0.6))
  const hp = Math.round(caster.maxHp * 0.45)
  return {
    id: allocateBattleId(state, 'p'),
    name: caster.specId?.includes('warlock') ? '契约小鬼' : '战狼',
    team: 'guild',
    maxHp: hp,
    hp,
    attack: atk,
    defense: 2,
    critChance: 0.05,
    attackInterval: 8,
    cooldownLeft: 0,
    alive: true,
    skills: [],
    tauntedTicks: 0,
    position: 'front',
    range: 'melee',
    role: 'dps',
    synergyIds: [],
    threat: {},
    petOf: caster.id,
  }
}

/** 推进一个 tick。战斗结束后再调用是空操作 */
export function stepBattle(state: BattleState): void {
  if (state.status !== 'running') return
  state.tick++
  // A3/B7 招牌技指令消费:按队员顺序执行并清空(多槽,每人一格)
  const pendingSigs = state.commands.signatures
  if (pendingSigs) {
    state.commands.signatures = undefined
    for (const m of state.combatants) {
      if (m.team !== 'guild') continue
      const sig = pendingSigs[m.memberId ?? '']
      if (sig) executeSignature(state, sig)
    }
  }
  // 灼热地形(版图二):周期性全队火伤,火抗按比例减免——逼装备取舍的环境压力
  if (state.envHeat && state.tick >= state.envHeat.next) {
    state.envHeat.next = state.tick + state.envHeat.everyTicks
    for (const c of state.combatants) {
      if (!c.alive || c.team !== 'guild') continue
      const heatMult = c.legacyEmberward ? 0.5 : 1
      const dmg = Math.max(1, Math.round(state.envHeat.damage * (1 - (c.fireResist ?? 0)) * heatMult))
      c.hp = Math.max(0, c.hp - dmg)
      if (c.hp === 0) {
        c.alive = false
        pushLog(state, 'system', `🔥 ${c.name} 倒在了灼热的地面上!`)
      }
    }
    if (state.tick % 300 === 0) pushLog(state, 'system', '🔥 热浪翻涌,队伍在灼热的地面上持续失血!')
  }
  // M-a 空间化(U41):移动推进——有 moveTarget 的单位朝目标走(移动优先于普攻),到达即清
  for (const c of state.combatants) {
    if (!c.alive || !c.pos || !c.moveTarget) continue
    const d = dist(c.pos, c.moveTarget)
    if (d <= MOVE_SPEED) { c.pos = { ...c.moveTarget }; c.moveTarget = undefined }
    else c.pos = { x: c.pos!.x + (c.moveTarget.x - c.pos!.x) / d * MOVE_SPEED, y: c.pos!.y + (c.moveTarget.y - c.pos!.y) / d * MOVE_SPEED }
  }
  // 灼息点燃(版图二 ember-breath):被点燃者每 10 tick 灼烧 3 血
  for (const c of state.combatants) {
    if (!c.alive || !c.burnUntilTick || state.tick >= c.burnUntilTick) continue
    if (state.tick % 10 === 0) {
      c.hp = Math.max(0, c.hp - 3)
      if (c.hp === 0) {
        c.alive = false
        pushLog(state, 'system', `🔥 ${c.name} 被灼息吞没!`)
      }
    }
  }
  // R5.3b(U33⑤)刃·流血:每 10 tick 流一次血,持续 30 tick
  for (const c of state.combatants) {
    if (!c.alive || !c.bleedUntilTick || state.tick >= c.bleedUntilTick) continue
    if (state.tick % 10 === 0 && c.bleedPerTick) {
      c.hp = Math.max(0, c.hp - c.bleedPerTick)
      state.events.push({ tick: state.tick, type: 'bleed', targetId: c.id, amount: c.bleedPerTick })
      if (c.hp === 0) {
        c.alive = false
        pushLog(state, 'system', `🩸 ${c.name} 失血倒下!`)
      }
    }
  }
  // 战斗硬上限:900 tick 敌人狂暴(软压力);1200 tick 强制撤离(被束缚者留下)
  if (state.tick === TICK_SOFT_CAP) {
    for (const c of state.combatants) {
      if (!c.alive || c.team !== 'enemy') continue
      c.attack = Math.round(c.attack * 1.5)
    }
    pushLog(state, 'system', '⏳ 战斗旷日持久——敌人陷入了疯狂!')
  }
  if (state.tick >= TICK_HARD_CAP) {
    for (const c of state.combatants) {
      if (!c.alive || c.team !== 'guild') continue
      if (c.boundUntilTick && state.tick < c.boundUntilTick) {
        c.alive = false
        c.hp = 0
        state.events.push({ tick: state.tick, type: 'death', targetId: c.id })
      }
    }
    state.status = 'retreated'
    pushLog(state, 'result', '⏳ 战斗超时——全队被迫撤离(无掉落)!')
    return
  }

  // 特质·regen(沼泽再生):缓慢回血
  for (const c of state.combatants) {
    if (!c.alive || !c.traits?.includes('regen')) continue
    traitHint(state, 'regen')
    c.regenAcc = (c.regenAcc ?? 0) + 0.5
    if (c.regenAcc >= 1) {
      const pt = Math.floor(c.regenAcc)
      c.regenAcc -= pt
      c.hp = Math.min(c.maxHp, c.hp + pt)
    }
  }

  for (const c of state.combatants) {
    if (!c.alive) continue
    if (c.tauntedTicks > 0) c.tauntedTicks--
    c.cooldownLeft--
    for (const s of c.skills) s.cooldownLeft--
  }

  // 团长指令冷却
  const cmd = state.commands
  if (cmd.healCd > 0) cmd.healCd--
  if (cmd.furyCd > 0) cmd.furyCd--

  // 撤退保护（Q7，默认开启）：有人濒危自动下撤退令
  if (cmd.protectRetreat && cmd.extractingUntil === undefined && state.tick > 10) {
    const critical = state.combatants.some(
      (c) => c.alive && c.team === 'guild' && c.hp / c.maxHp < 0.2,
    )
    if (critical) {
      cmd.extractingUntil = state.tick + EXTRACT_TICKS
      pushLog(state, 'guild', '🛡 撤退保护触发——有人濒危，全队自动撤离！')
    }
  }

  // 挂机 AI（D12）：队长性格代打——同一套指令系统，另一种执行者
  runAutoAI(state)

  // boss 机制引擎（蓄力/咏唱/召唤/束缚/狂暴）
  processBossMechanics(state)

  // 我方引导咏唱结算:完成 = 全队大治疗;被打断 = 前功尽弃
  for (const c of state.combatants) {
    if (!c.alive || !c.channelUntilTick || c.team !== 'guild') continue
    if (state.tick < c.channelUntilTick) {
      if ((c.channelTaken ?? 0) >= (c.channelBreak ?? 0)) {
        c.channelUntilTick = undefined
        state.events.push({ tick: state.tick, type: 'interrupted', targetId: c.id })
        pushLog(state, 'enemy', `${c.name} 的引导被打断了——治疗化作泡影!`)
      }
      continue
    }
    const amount = c.channelAmount ?? 0
    for (const a of state.combatants.filter((x) => x.alive && x.team === 'guild')) {
      const healed = Math.min(a.maxHp - a.hp, amount)
      if (healed <= 0) continue
      a.hp += healed
      state.events.push({ tick: state.tick, type: 'heal', attackerId: c.id, targetId: a.id, amount: healed })
    }
    pushLog(state, 'guild', `${c.name} 的引导完成——圣光洒满全场!`)
    c.channelUntilTick = undefined
  }

  // 地面效果区结算:zoned 成员每 10 tick 受持续伤害;拉拽到期还原站位
  for (const c of state.combatants) {
    if (!c.alive) continue
    if (c.zonedUntilTick && state.tick < c.zonedUntilTick && state.tick % 10 === 0) {
      applyHit(state, c, c, 4, '毒沼侵蚀')
    }
    if (c.pulledUntilTick && state.tick >= c.pulledUntilTick && c.originalPosition) {
      c.position = c.originalPosition
      c.pulledUntilTick = undefined
    }
  }

  // 咏叹光环刷新:持有者存活 → 全队(除自身)伤害 +10%
  {
    const auraOn = state.combatants.some((x) => x.alive && x.specId === 'priest-chanter')
    for (const c of state.combatants) {
      if (c.team !== 'guild') continue
      c.auraMult = auraOn && c.specId !== 'priest-chanter' ? 1.1 : 1
    }
  }

  // 坦克被动仇恨：活着就持续吸引战线
  for (const e of aliveOf(state, 'enemy')) {
    for (const a of aliveOf(state, 'guild')) {
      if (a.role === 'tank') {
        e.threat[a.id] = (e.threat[a.id] ?? 0) + TANK_AURA_THREAT
      }
    }
  }

  for (const c of state.combatants) {
    if (!c.alive || state.status !== 'running') continue
    // 被束缚：无法行动（也无法撤离，见撤离结算）
    if (c.boundUntilTick && state.tick < c.boundUntilTick) continue
    if (c.cooldownLeft <= 0) {
      actWith(c, state)
      // 被霜寒减速:行动间隔加倍(减速是"少出手",不是"做不了事"——与束缚区分)
      c.cooldownLeft =
        c.slowUntilTick && state.tick < c.slowUntilTick ? c.attackInterval * 2 : c.attackInterval
    }
  }

  if (aliveOf(state, 'enemy').length === 0) {
    state.status = 'guild-win'
    pushLog(state, 'result', '★ 战斗胜利！')
  } else if (aliveOf(state, 'guild').length === 0) {
    state.status = 'guild-wipe'
    pushLog(state, 'result', '✝ 队伍全灭……')
  } else if (
    cmd.extractingUntil !== undefined &&
    state.tick >= cmd.extractingUntil
  ) {
    // 撤离完成：被束缚者被留下（Q32 的代价）
    for (const c of state.combatants) {
      if (!c.alive || c.team !== 'guild') continue
      if (c.boundUntilTick && state.tick < c.boundUntilTick) {
        c.alive = false
        c.hp = 0
        state.events.push({ tick: state.tick, type: 'death', targetId: c.id })
        pushLog(state, 'system', `☠ ${c.name} 因束缚无法撤离，被留在了殿后……`)
      }
    }
    state.status = 'retreated'
    pushLog(state, 'result', '🏳 队伍撤出了战斗')
  }
}

// ===== 团长指令（Q27 指挥台）：立即生效的状态变更，写日志与事件 =====

export function setStance(state: BattleState, stance: Stance): void {
  if (state.status !== 'running' || state.commands.stance === stance) return
  state.commands.stance = stance
  pushLog(state, 'guild', `团长命令：${STANCE_NAME[stance]}阵型！`)
}

export function setFocus(state: BattleState, targetId?: string): void {
  if (state.status !== 'running') return
  const target = targetId
    ? state.combatants.find((c) => c.id === targetId && c.alive && c.team === 'enemy')
    : undefined
  state.commands.focusId = target?.id
  if (target) {
    pushLog(state, 'guild', `团长下令：集火 ${target.name}！`)
  } else if (state.commands.focusId === undefined && targetId) {
    pushLog(state, 'guild', '集火目标已失效')
  }
}

// ===== A3 #1.1 招牌技能:玩家可点名释放的主动技(UI 与 ai.ts 只调 useSignature) =====

/** 目标是否有可打断的进行中咏唱(任一 boss 机制处于 cast 窗口且可打断) */
function hasActiveCast(state: BattleState, targetId?: string): boolean {
  if (!targetId) return false
  const target = state.combatants.find((c) => c.id === targetId && c.alive && c.team === 'enemy')
  if (!target?.bossMechanics || !target.mech) return false
  for (const def of target.bossMechanics) {
    if (interruptThreshold(def) === undefined) continue
    const rt = target.mech[def.kind]
    if (rt?.until !== undefined && state.tick < rt.until) return true
  }
  return false
}

/** R5.3b(U33⑤)弓·独有用处:优先射击正在咏唱的后排;没有读条者时打残血。
 *  单独导出供单测。pool 已是 allowedPool 过滤后的合法目标。 */
export function pickBowTarget(state: BattleState, pool: Combatant[]): Combatant | null {
  if (pool.length === 0) return null
  const castingBack = pool.filter((f) => f.position === 'back' && hasActiveCast(state, f.id))
  if (castingBack.length > 0) return castingBack[0]!
  return pool.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b))
}

/** 玩家点名释放招牌技:校验通过则写入指令队列,由下一次 stepBattle 消费;返回是否受理 */
export function useSignature(state: BattleState, memberId: string, targetId?: string): boolean {
  if (state.status !== 'running') return false
  const c = state.combatants.find((x) => x.memberId === memberId && x.alive && x.team === 'guild')
  if (!c?.specId) return false
  const skill = SIGNATURE_SKILLS[c.specId]
  if (!skill) return false
  // R3/W3:武器族门槛(与 AI/基础技能同一条单点判定)
  if (skillFamilyBlocked(c, skill.weaponFamily)) return false
  if (state.tick < (state.signatureCd?.[memberId] ?? 0)) return false
  // S4:被定身(束缚)的队员无法施放招牌技
  if ((c.boundUntilTick ?? 0) > state.tick) return false
  // 打断系招牌技:没有在读条的目标就不受理(UI 据此禁用);引爆系:目标无灼烧层不受理;其余按各自 targetShape 校验
  if (skill.effect.startsWith('interrupt')) {
    if (!hasActiveCast(state, targetId)) return false
  } else if (skill.effect === 'detonate-burn') {
    // S3:无指定目标时,优先引爆正在读条且层数≥3 的敌人
    let t = state.combatants.find((x) => x.id === targetId && x.alive && x.team === 'enemy')
    if (!t) {
      const casters = state.combatants.filter((x) => x.alive && x.team === 'enemy' && (x.burnStacks ?? 0) >= 3 && x.mech && Object.values(x.mech).some((rt) => rt.until !== undefined && state.tick < rt.until))
      t = casters[0]
    }
    if (!t || (t.burnStacks ?? 0) === 0) return false
    targetId = t.id
  } else if (skill.targeting === 'ally') {
    if (!state.combatants.some((x) => x.memberId === targetId && x.alive && x.team === 'guild')) return false
  }
  // B7:该队员已有入队指令就拒绝(手动优先,不被 AI 改写)
  if (state.commands.signatures?.[memberId]) return false
  state.commands.signatures = { ...state.commands.signatures, [memberId]: { memberId, skillId: skill.id, targetId } }
  return true
}

/** 敌方目标解析:招牌技的敌方点名=集火目标优先(玩家已点名的意图),其余由 UI 兜底 */
function resolveSignatureEnemy(state: BattleState, targetId?: string): Combatant | undefined {
  if (!targetId) return undefined
  return state.combatants.find((x) => x.id === targetId && x.alive && x.team === 'enemy')
}

/** 消费招牌技指令:打断走 stepCastWindow 既有管线(置 taken=阈值,brokenBy 归属),二段效果复用既有字段 */
// ===== M-a 战斗空间化(U41):战场坐标/移动/射程。数值全部 C4 占位。 =====
export const ARENA = { width: 640, height: 360 } as const
export const MELEE_RANGE = 70
export const RANGED_RANGE = 230
export const MOVE_SPEED = 2.2 // px/tick
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

/** 玩家点地面:指定我方角色移动(移动优先于普攻;到达后自动恢复攻击) */
export function setMoveTarget(state: BattleState, memberId: string, x: number, y: number): void {
  const c = state.combatants.find((u) => u.team === 'guild' && u.memberId === memberId && u.alive)
  if (!c || !c.pos) return
  c.moveTarget = { x: Math.max(20, Math.min(ARENA.width - 20, x)), y: Math.max(40, Math.min(ARENA.height - 20, y)) }
}

/** #7.1(U39)RTS 式点选施法:玩家点选我方角色→选技能→选目标。校验冷却/存活/族门槛;冷却与 AI 同池(玩家放了 AI 不重复放)。 */
export function castSkillManually(
  state: BattleState,
  memberId: string,
  skillId: string,
  targetId?: string,
): { ok: boolean; reason?: string } {
  if (state.status !== 'running') return { ok: false, reason: '战斗已结束' }
  const caster = state.combatants.find((c) => c.team === 'guild' && c.memberId === memberId && c.alive)
  if (!caster) return { ok: false, reason: '该角色不在战场或已倒下' }
  if (caster.skills.length === 0) return { ok: false, reason: '该角色没有主动技能' }
  const ready = caster.skills.find((r) => r.def.id === skillId)
  if (!ready) return { ok: false, reason: '该角色没有这个技能' }
  if (ready.cooldownLeft > 0) return { ok: false, reason: `【${ready.def.name}】冷却中` }
  if (skillFamilyBlocked(caster, ready.def.weaponFamily)) return { ok: false, reason: '武器族不合,放不出来' }
  const allies = aliveOf(state, 'guild')
  const pool = aliveOf(state, 'enemy')
  const forced = targetId ? [...allies, ...pool].find((c) => c.id === targetId && c.alive) : undefined
  const ok = useSkill(caster, ready.def, allies, pool, state, forced)
  if (ok) ready.cooldownLeft = skillCooldownTicks(ready.def.cooldownTicks, caster)
  return ok ? { ok: true } : { ok: false, reason: '施放条件不满足(如全队血量健康/无有效目标)' }
}

export function executeSignature(state: BattleState, cmd: { memberId: string; skillId: string; targetId?: string }): void {
  const skill = Object.values(SIGNATURE_SKILLS).find((s) => s.id === cmd.skillId)
  if (!skill) return
  const c = state.combatants.find((x) => x.memberId === cmd.memberId && x.alive && x.team === 'guild')
  if (!c) return
  if ((c.boundUntilTick ?? 0) > state.tick) return // S4:被定身不能施放
  const target = resolveSignatureEnemy(state, cmd.targetId)
  // S5:打断类在目标已收招时不算出手——不扣冷却(信息性日志)
  if (skill.effect.startsWith('interrupt')) {
    const mechMap = target?.mech
    const stillCasting = !!target?.bossMechanics && !!mechMap && target.bossMechanics.some((def) => {
      const th = interruptThreshold(def)
      const rt = th === undefined ? undefined : mechMap[def.kind]
      return rt?.until !== undefined && state.tick < rt.until
    })
    if (!stillCasting) {
      pushLog(state, 'guild', `${c.name} 的【${skill.name}】落了空——目标已经收招。`)
      return
    }
  }
  state.signatureCd = { ...state.signatureCd, [cmd.memberId]: state.tick + skillCooldownTicks(skill.cdTicks, c) }
  let broken = false
  if (skill.effect.startsWith('interrupt') && target?.bossMechanics && target.mech) {
    for (const def of target.bossMechanics) {
      const threshold = interruptThreshold(def)
      if (threshold === undefined) continue
      const rt = target.mech[def.kind]
      if (rt?.until !== undefined && state.tick < rt.until) {
        rt.taken = threshold
        rt.brokenBy = skill.name
        broken = true
      }
    }
  }
  switch (skill.effect) {
    case 'detonate-burn': {
      if (!target) break
      const stacks = target.burnStacks ?? 0
      if (stacks === 0) {
        pushLog(state, 'guild', `${c.name} 释放【${skill.name}】,但目标身上没有火焰可引爆——先用火球烧它!`)
        break
      }
      target.burnStacks = undefined
      target.burnUntilTick = undefined
      dealDamage(state, c, target, 1.2 + 0.9 * stacks, `释放【${skill.name}】引爆 ${stacks} 层灼烧`)
      break
    }
    case 'interrupt-shield': {
      const shield = Math.round(c.attack * 4)
      c.absorbShield = (c.absorbShield ?? 0) + shield
      state.events.push({ tick: state.tick, type: 'shielded', targetId: c.id, amount: shield })
      break
    }
    case 'interrupt-bind': {
      if (target) {
        target.boundUntilTick = state.tick + 90
        state.events.push({ tick: state.tick, type: 'bound', targetId: target.id })
      }
      break
    }
    case 'interrupt-curse': {
      if (target) {
        target.vulnUntilTick = state.tick + 120
        target.vulnMult = 1.25
        state.events.push({ tick: state.tick, type: 'cursed', targetId: target.id })
      }
      break
    }
    case 'heal-target-cleanse': {
      const t = state.combatants.find((x) => x.memberId === cmd.targetId && x.alive && x.team === 'guild')
      if (!t) break
      const amount = Math.round(c.attack * 3.5)
      t.hp = Math.min(t.maxHp, t.hp + amount)
      if ((t.boundUntilTick ?? 0) > state.tick) t.boundUntilTick = undefined
      if ((t.burnUntilTick ?? 0) > state.tick) t.burnUntilTick = undefined
      state.events.push({ tick: state.tick, type: 'heal', attackerId: c.id, targetId: t.id, amount })
      pushLog(state, 'guild', `${c.name} 释放【${skill.name}】，${t.name} 恢复 ${amount} 点生命，束缚与灼烧一并清除。`)
      break
    }
    case 'pierce-shot': {
      if (!target) break
      dealDamage(state, c, target, 2.6, `释放【${skill.name}】贯穿`, { ignoreDefense: true })
      break
    }
    case 'enchant-pet': {
      let pet = state.combatants.find((x) => x.petOf === c.id && x.alive)
      const summoned = !pet
      if (!pet) {
        pet = summonPet(c, state)
        state.combatants.push(pet)
      }
      pet.attack = Math.round(pet.attack * 1.5)
      pet.hp = Math.min(pet.maxHp, pet.hp + Math.round(pet.maxHp * 0.3))
      pushLog(state, 'guild', `${c.name} 释放【${skill.name}】，${summoned ? '应召而来的' : ''}${pet.name} 双眼泛起红光！`)
      break
    }
    case 'execute-strike': {
      if (!target) break
      const bonus = 1 + 1.8 * (1 - target.hp / target.maxHp)
      dealDamage(state, c, target, 1.2 * bonus, `释放【${skill.name}】斩落`)
      break
    }
    case 'freeze-backline': {
      const backs = aliveOf(state, 'enemy').filter((e) => e.position === 'back')
      if (backs.length === 0) {
        pushLog(state, 'guild', `${c.name} 释放【${skill.name}】，但敌方后排空无一人。`)
        break
      }
      for (const e of backs) {
        e.boundUntilTick = state.tick + (e.boss ? 30 : 50)
        state.events.push({ tick: state.tick, type: 'bound', targetId: e.id })
      }
      pushLog(state, 'guild', `${c.name} 释放【${skill.name}】——敌方后排 ${backs.length} 人被冰封在原地！`)
      break
    }
    case 'sacrifice-strike': {
      if (!target) break
      const cost = Math.max(1, Math.round(c.maxHp * 0.12))
      c.hp = Math.max(1, c.hp - cost)
      dealDamage(state, c, target, 3.2, `以 ${cost} 点生命为引【${skill.name}】轰中`)
      break
    }
    case 'harvest-dots': {
      if (!target) break
      let statuses = 0
      if ((target.burnUntilTick ?? 0) > state.tick) statuses++
      if ((target.vulnUntilTick ?? 0) > state.tick) statuses++
      if ((target.fearUntilTick ?? 0) > state.tick) statuses++
      if (statuses === 0) {
        pushLog(state, 'guild', `${c.name} 释放【${skill.name}】，但目标身上没有任何痛楚可收割。`)
        break
      }
      target.burnUntilTick = undefined
      dealDamage(state, c, target, 1.5 * (1 + 0.8 * statuses), `释放【${skill.name}】收割痛楚`)
      break
    }
    case 'taunt-all-thorns': {
      for (const e of aliveOf(state, 'enemy')) {
        e.tauntedTicks = Math.max(e.tauntedTicks ?? 0, 60)
        e.taunterId = c.id
        e.threat[c.id] = (e.threat[c.id] ?? 0) + 150
      }
      c.thornsUntilTick = state.tick + 300
      state.events.push({ tick: state.tick, type: 'enraged', targetId: c.id })
      pushLog(state, 'guild', `${c.name} 释放【${skill.name}】——全体敌人被激怒，而荆棘在他的甲上立起！`)
      break
    }
  }
  pushLog(
    state,
    'guild',
    broken
      ? `${c.name} 使出【${skill.name}】——${target?.name ?? '目标'} 的咏唱被当场拍碎！`
      : `${c.name} 使出【${skill.name}】。`,
  )
}

/** #2.7 治疗三路径的统一量口:治疗输出 = 基量 × (1+治疗强度[技能路径才有]) × (1+受疗) × healTakenMod。
 *  kind: 'skill'=技能治疗(吃 healPower)/'potion'=药水(两条属性都不吃)/'tick'= DOT 类无主治疗。 */
export function computeHeal(source: Combatant | null, target: Combatant, base: number, kind: 'skill' | 'potion' | 'tick' = 'skill'): number {
  const power = source && kind === 'skill' ? (source.healPower ?? 0) : 0
  // 药水路径声明不吃任何治疗属性(#2.7 禁止留成隐含行为):kind==='potion' 时受疗也不计
  const received = kind === 'potion' ? 0 : (target.healReceived ?? 0)
  const taken = target.healTakenMod ?? 1
  return Math.max(1, Math.round(base * (1 + power) * (1 + received) * taken))
}

export function useHealPotion(state: BattleState): boolean {
  const cmd = state.commands
  if (state.status !== 'running' || cmd.healStock <= 0 || cmd.healCd > 0) return false
  const members = state.combatants.filter((c) => c.alive && c.team === 'guild')
  if (members.length === 0) return false
  cmd.healStock--
  cmd.healCd = POTION_CD_TICKS
  for (const m of members) {
    const amount = computeHeal(null, m, Math.round(m.maxHp * HEAL_PCT), 'potion')
    m.hp = Math.min(m.maxHp, m.hp + amount)
    state.events.push({
      tick: state.tick,
      type: 'heal',
      targetId: m.id,
      amount,
    })
  }
  pushLog(state, 'guild', `团长使用了治疗药——全队恢复 ${Math.round(HEAL_PCT * 100)}% 生命！`)
  return true
}

export function useFuryPotion(state: BattleState): boolean {
  const cmd = state.commands
  if (state.status !== 'running' || cmd.furyStock <= 0 || cmd.furyCd > 0) return false
  cmd.furyStock--
  cmd.furyCd = POTION_CD_TICKS
  cmd.furyUntil = state.tick + FURY_TICKS
  const anchor = state.combatants.find((c) => c.alive && c.team === 'guild')
  state.events.push({ tick: state.tick, type: 'fury', targetId: anchor?.id ?? '' })
  pushLog(state, 'guild', `团长使用了爆发药——全队伤害提升 30%，持续 ${FURY_TICKS / 10} 秒！`)
  return true
}

export function orderRetreat(state: BattleState): boolean {
  if (state.status !== 'running' || state.commands.extractingUntil !== undefined) return false
  state.commands.extractingUntil = state.tick + EXTRACT_TICKS
  pushLog(
    state,
    'guild',
    `撤退令下！全队撤离需要 ${EXTRACT_TICKS / 10} 秒——被束缚者将被留下！`,
  )
  return true
}


// ===== 透明面板(宪法 v3.2 缺陷二):把乘区逐层摊开给人看 =====
export interface StatLayer {
  label: string
  text: string
  good?: boolean
  bad?: boolean
}

export function statLayers(member: Member): StatLayer[] {
  const job = JOBS[member.job]
  const spec = specOf(member.job, member.spec)
  const race = member.race ? RACES[member.race] : RACES.human
  const p = member.personality ?? { bravery: 50, caution: 50, greed: 50, loyalty: 50 }
  const eq = equipmentStats(member.equipment)
  const layers: StatLayer[] = []
  layers.push({
    label: '攻速',
    text: `每 ${(toCombatant(member).attackInterval / 10).toFixed(1)} 秒攻击一次(职业+敏捷决定)`,
  })
  layers.push({
    label: '基础盘',
    text: `${spec.name} · ${job.base.maxHp}血/${job.base.attack}攻/${job.base.defense}防`,
  })
  layers.push({
    label: '主属性',
    text: `${job.attackAttr === 'str' ? '力量' : job.attackAttr === 'agi' ? '敏捷' : '智力'} ${member.attrs[job.attackAttr] + (race.attrBonus?.[job.attackAttr] ?? 0)}(每点 +5% 攻击) · 体质 ${member.attrs.vit + (race.attrBonus?.vit ?? 0)} · 精神 ${member.attrs.spr + (race.attrBonus?.spr ?? 0)} · 幸运 ${member.attrs.lck + (race.attrBonus?.lck ?? 0)}`,
  })
  const br = (p.bravery - 50) * 0.0012
  if (br !== 0) layers.push({ label: '性格·勇猛', text: `${formatPercent(br, true)} 攻击`, good: br > 0, bad: br < 0 })
  const ca = (p.caution - 50) * 0.0018
  if (ca !== 0) layers.push({ label: '性格·谨慎', text: `${formatPercent(ca, true)} 防御`, good: ca > 0, bad: ca < 0 })
  if (p.greed !== 50) {
    const gr = (p.greed - 50) * 0.0005
    layers.push({ label: '性格·贪婪', text: `${formatStat('critChance', gr, true)} 暴击`, good: p.greed > 50, bad: p.greed < 50 })
  }
  if (p.loyalty !== 50) {
    const lo = (p.loyalty - 50) * 0.0012
    layers.push({ label: '性格·忠诚', text: `${formatStat('healReceived', lo, true)} 受疗`, good: p.loyalty > 50, bad: p.loyalty < 50 })
  }
  const rp = race.passive
  const raceText = rp.attack
    ? `攻击 ${formatStat('attack', rp.attack, true)}`
    : rp.defense
      ? `防御 ${formatStat('defense', rp.defense, true)}`
      : rp.crit
        ? `暴击 ${formatStat('critChance', rp.crit, true)}`
        : rp.healReceived
          ? `受疗 ${formatStat('healReceived', rp.healReceived, true)}`
          : rp.undeadWill
            ? '阵亡冲击减半'
            : rp.expMult
              ? `经验 ${formatPercent(rp.expMult, true)}`
              : '—'
  layers.push({ label: `${'种族·' + race.name}`, text: raceText, good: Object.keys(rp).length > 0 })
  if (member.augments?.length) {
    layers.push({
      label: '通用战技',
      text: member.augments
        .map((a) => (a === 'aug-vit' ? '体魄' : a === 'aug-iron' ? '铁骨' : a === 'aug-eye' ? '锐眼' : a === 'aug-blood' ? '血性' : '韧性'))
        .join('、'),
      good: true,
    })
  }
  const eqParts = (Object.keys(STAT_NAME) as (keyof typeof STAT_NAME)[])
    .filter(stat => eq[stat])
    .map(stat => `${STAT_NAME[stat]} ${formatStat(stat, eq[stat]!)}`)
  if (eqParts.length) layers.push({ label: '装备', text: eqParts.join(' · '), good: true })
  const bondTotal = Object.values(member.bonds).reduce((s2, n) => s2 + n, 0)
  if (bondTotal > 0) layers.push({ label: '默契', text: `${bondTotal} 次共同远征(星数换算伤害加成)`, good: true })
  return layers
}
