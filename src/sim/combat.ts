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
import { HYBRIDS, isHybrid } from '../data/vocations'
import type { SpecDef } from './types'
import { processBossMechanics } from './mechanics'
import { runAutoAI } from './ai'
import { equipmentStats } from './loot'
import { bondStars, BOND_MULT_PER_STAR } from './gen'

// 战斗引擎 D8-9 版：威胁表、站位、轻协同、护甲模型 +
// 团长指挥台（阵型/集火/道具/撤退令）与 boss 机制引擎对接。

export const TICK_MS = 100 // 10 tick / 秒；模拟与演出解耦，演出层按 tick 回放

/** 护甲减伤常数：dmg × K/(K+def)，K 越大护甲越弱（D13-14 平衡） */
const MITIGATION_K = 60
/** 坦克每 tick 对每个敌人的被动仇恨（活着就拉住阵线；战斗变长后须压过游侠输出仇恨,1.8 起稳坐第一仇恨） */
const TANK_AURA_THREAT = 2.2
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

let combatantSeq = 0

export function pushLog(state: BattleState, kind: LogKind, text: string): void {
  state.log.push({ tick: state.tick, kind, text })
  if (state.log.length > 400) state.log.splice(0, state.log.length - 400)
}

/** 战力分:装备/等级/默契之外的统一成长读数(单调即可,不求精确) */
export function powerScore(member: Member): number {
  const c = toCombatant(member)
  return Math.round(
    c.attack * 3 + c.maxHp * 0.4 + c.defense * 4 + c.critChance * 200 + (60 / c.attackInterval) * 2,
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
  const maxHp = Math.round(
    Math.max(1, base.maxHp + (mods.maxHp ?? 0)) +
      (member.level - 1) * job.growth.maxHp +
      member.attrs.str * 3 +
      (eq.maxHp ?? 0),
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
        (1 + member.attrs[job.attackAttr] * 0.05) +
        (eq.attack ?? 0)) *
        braveryAtkMult,
    ),
    defense: Math.round(
      Math.max(0, base.defense + (mods.defense ?? 0)) *
        cautionDefMult +
        (member.level - 1) * job.growth.defense +
        (eq.defense ?? 0),
    ),
    critChance: base.critChance + (mods.critChance ?? 0) + greedCrit + member.attrs.agi * 0.004 + (eq.critChance ?? 0),
    attackInterval: Math.max(
      6,
      Math.round(60 / (base.speed + (mods.speed ?? 0) + (eq.speed ?? 0))),
    ),
    cooldownLeft: 0,
    alive: true,
    memberId: member.id,
    skills: baseSpec.skills.map((def) => ({ def, cooldownLeft: 0 })),
    specId: baseSpec.id,
    counterMult: baseSpec.passive === 'counter' ? 0.3 : undefined,
    healReceived: loyaltyHeal,
    tauntedTicks: 0,
    position: hy ? hy.position : job.position,
    range: hy ? hy.range : job.range,
    role: hy ? hy.role : job.role,
    synergyIds: job.synergy,
    threat: {},
    lifesteal: eq.lifesteal,
    personality: member.personality,
  }
}

export function enemyToCombatant(def: EnemyDef): Combatant {
  return {
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
    skills: [],
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
): BattleState {
  const enc = dungeon.encounters.find((e) => e.id === encounterId)
  if (!enc) throw new Error(`未知遭遇战: ${encounterId}`)
  const combatants: Combatant[] = members.map(toCombatant)
  for (const gid of enc.enemyGroupIds) {
    for (const e of dungeon.enemyGroups[gid] ?? []) {
      combatants.push(enemyToCombatant(e))
    }
  }
  if (enc.bossId) {
    const def = dungeon.bosses[enc.bossId]
    const boss = enemyToCombatant(def)
    boss.boss = true
    boss.bossMechanics = def.mechanics
    boss.mech = {}
    const sumMech = def.mechanics.find((m) => m.kind === 'summon')
    if (sumMech) boss.summonPool = dungeon.enemyGroups[String(sumMech.params.groupId)] ?? []
    combatants.push(boss)
  }

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
  pushLog(state, 'system', `—— ${enc.name} 战斗开始 ——`)
  return state
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

function synergyDamageMult(state: BattleState, attacker: Combatant): number {
  if (attacker.team !== 'guild') return 1
  let mult = 1
  // 盾墙掩护：坦克存活时，持此词条者伤害 +15%
  if (
    attacker.synergyIds.includes('shield-wall') &&
    aliveOf(state, 'guild').some((a) => a.role === 'tank')
  ) {
    mult *= 1.15
  }
  return mult
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

function effectiveDefense(state: BattleState, target: Combatant): number {
  let def = target.defense
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
    target.threat[attacker.id] = (target.threat[attacker.id] ?? 0) + amount
  }
  // 对咏唱中的 boss 造成伤害计入打断阈值(所有可打断咏唱线:cast-buff/cast-heal)
  if (target.bossMechanics && target.mech) {
    for (const kind of ['cast-buff', 'cast-heal'] as const) {
      const rt = target.mech[kind]
      if (rt?.until !== undefined && state.tick < rt.until) {
        rt.taken = (rt.taken ?? 0) + amount
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
  pushLog(
    state,
    attacker.team,
    `${attacker.name} ${label}${target.name}，造成 ${amount}${opts?.crit ? '（暴击！）' : ''} 伤害`,
  )
  if (target.hp <= 0 && target.alive) {
    target.alive = false
    state.events.push({ tick: state.tick, type: 'death', targetId: target.id })
    pushLog(state, 'system', `☠ ${target.name} 倒下了`)
  }
}

function dealDamage(
  state: BattleState,
  attacker: Combatant,
  target: Combatant,
  mult: number,
  label: string,
): void {
  const variance = 0.85 + nextRandom(state) * 0.3
  const crit = nextRandom(state) < attacker.critChance
  let raw =
    effectiveAttack(state, attacker) *
    mult *
    variance *
    (crit ? 1.5 : 1) *
    synergyDamageMult(state, attacker)
  if (attacker.team === 'guild' && state.commands.focusId === target.id) {
    raw *= FOCUS_MULT
  }
  const dmg = Math.max(
    1,
    Math.round((raw * MITIGATION_K) / (MITIGATION_K + effectiveDefense(state, target))),
  )
  applyHit(state, attacker, target, dmg, label, {
    crit,
    ranged: attacker.range === 'ranged',
  })
  // 霜寒触摸(slow-touch 被动):命中概率减速目标——行动间隔加倍,持续可刷新
  const slowDef = attacker.bossMechanics?.find((m) => m.kind === 'slow-touch')
  if (slowDef && target.alive) {
    const chance = typeof slowDef.params.chance === 'number' ? slowDef.params.chance : 0.35
    if (battleRandom(state) < chance) {
      const ticks = typeof slowDef.params.ticks === 'number' ? slowDef.params.ticks : 30
      target.slowUntilTick = state.tick + ticks
      state.events.push({ tick: state.tick, type: 'slowed', targetId: target.id, amount: ticks })
      pushLog(state, 'enemy', `❄ ${target.name} 被【${slowDef.name}】冻结,行动变缓！`)
    }
  }
}

function actWith(c: Combatant, state: BattleState): void {
  const allies = aliveOf(state, c.team)
  const foes = aliveOf(state, c.team === 'guild' ? 'enemy' : 'guild')
  if (foes.length === 0) return
  const pool = allowedPool(c, foes)

  const ready = c.skills.find((s) => s.cooldownLeft <= 0)
  if (ready && useSkill(c, ready.def, allies, pool, state)) {
    ready.cooldownLeft = ready.def.cooldownTicks
    return
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
  if (target) dealDamage(state, c, target, 1.0, '攻击')
}

function useSkill(
  c: Combatant,
  skill: SkillDef,
  allies: Combatant[],
  pool: Combatant[],
  state: BattleState,
): boolean {
  switch (skill.effect) {
    case 'heavy-strike': {
      const target = pool.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b))
      dealDamage(state, c, target, 1.8, `释放【${skill.name}】命中`)
      return true
    }
    case 'heal-lowest': {
      const hurt = allies.filter((a) => a.hp / a.maxHp < 0.75)
      if (hurt.length === 0) return false
      const target = hurt.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b))
      // 治疗吞吐须覆盖 boss 基础压力:D15 加压轮后 3.0 倍;节奏改版(血池×1.5/战斗拉长)后
      // 牧师基础攻击 7.0 配 4.5 倍 ≈ 31/s,恢复 D15 校准的绝对吞吐,否则长战斗必崩盘
      const amount = Math.round(c.attack * 4.5 * (1 + (target.healReceived ?? 0)))
      target.hp = Math.min(target.maxHp, target.hp + amount)
      // 治疗仇恨：治疗量全额转化为威胁——坦克倒下后牧师是下一个目标
      for (const e of aliveOf(state, 'enemy')) {
        e.threat[c.id] = (e.threat[c.id] ?? 0) + amount
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
      // 真言盾:给最脆的人上吸收盾(吸收量按治疗者攻击定标)
      const target = allies.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b))
      const shield = Math.round(c.attack * 6)
      target.absorbShield = (target.absorbShield ?? 0) + shield
      state.events.push({ tick: state.tick, type: 'shielded', targetId: target.id, amount: shield })
      pushLog(state, 'guild', `${c.name} 释放【${skill.name}】，为 ${target.name} 挂上 ${shield} 点护盾`)
      return true
    }
    case 'curse-mark': {
      // 痛苦诅咒:目标受伤 +25%,持续 12s
      const target = pool.reduce((a, b) => (a.maxHp >= b.maxHp ? a : b))
      target.vulnUntilTick = state.tick + 120
      target.vulnMult = 1.25
      state.events.push({ tick: state.tick, type: 'cursed', targetId: target.id })
      pushLog(state, 'guild', `${c.name} 释放【${skill.name}】，${target.name} 成了全队的活靶子！`)
      return true
    }
    case 'frost-nova': {
      // 霜寒新星:全体敌人减速 + 轻伤
      let hit = 0
      for (const e of aliveOf(state, 'enemy')) {
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
      target.boundUntilTick = state.tick + 20
      state.events.push({ tick: state.tick, type: 'bound', targetId: target.id, amount: 20 })
      pushLog(state, 'guild', `${c.name} 的【${skill.name}】咬住了 ${target.name}！`)
      return true
    }
    case 'summon-pet': {
      // 召唤物(战狼/小鬼/契灵):每场一只,存活期间技能不可用(回落平砍)
      if (state.combatants.some((x) => x.petOf === c.id && x.alive)) return false
      const pet = summonPet(c)
      state.combatants.push(pet)
      state.events.push({ tick: state.tick, type: 'summoned', targetId: pet.id })
      pushLog(state, 'guild', `${c.name} 释放【${skill.name}】，${pet.name} 出现在战场上！`)
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

/** 召唤物:属性随召唤者成长,无 memberId(阵亡不进纪念堂) */
function summonPet(caster: Combatant): Combatant {
  const atk = Math.max(3, Math.round(caster.attack * 0.6))
  const hp = Math.round(caster.maxHp * 0.45)
  return {
    id: `p${++combatantSeq}`,
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

export function useHealPotion(state: BattleState): boolean {
  const cmd = state.commands
  if (state.status !== 'running' || cmd.healStock <= 0 || cmd.healCd > 0) return false
  const members = state.combatants.filter((c) => c.alive && c.team === 'guild')
  if (members.length === 0) return false
  cmd.healStock--
  cmd.healCd = POTION_CD_TICKS
  for (const m of members) {
    const amount = Math.round(m.maxHp * HEAL_PCT * (1 + (m.healReceived ?? 0)))
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
