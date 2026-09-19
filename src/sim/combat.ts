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
import { JOBS } from '../data/jobs'
import { processBossMechanics } from './mechanics'
import { runAutoAI } from './ai'
import { equipmentStats } from './loot'

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

export function initCommands(): BattleCommands {
  return {
    stance: 'standard',
    healStock: POTION_STOCK,
    furyStock: POTION_STOCK,
    healCd: 0,
    furyCd: 0,
    furyUntil: 0,
    protectRetreat: true,
    autoMode: false,
  }
}

/** 成员 → 战斗实体投影。装备加算（D10），数值公式占位，D13-14 平衡轮统一调 */
export function toCombatant(member: Member): Combatant {
  const job = JOBS[member.job]
  const eq = equipmentStats(member.equipment)
  const maxHp = Math.round(
    job.base.maxHp +
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
      ((job.base.attack + (member.level - 1) * job.growth.attack) *
        (1 + member.attrs[job.attackAttr] * 0.05) +
        (eq.attack ?? 0)),
    ),
    defense: Math.round(
      job.base.defense + (member.level - 1) * job.growth.defense + (eq.defense ?? 0),
    ),
    critChance: job.base.critChance + member.attrs.agi * 0.004 + (eq.critChance ?? 0),
    attackInterval: Math.max(
      6,
      Math.round(60 / (job.base.speed + (eq.speed ?? 0))),
    ),
    cooldownLeft: 0,
    alive: true,
    memberId: member.id,
    skills: job.skills.map((def) => ({ def, cooldownLeft: 0 })),
    tauntedTicks: 0,
    position: job.position,
    range: job.range,
    role: job.role,
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

  const state: BattleState = {
    tick: 0,
    combatants,
    log: [],
    status: 'running',
    rngState: seed | 0,
    events: [],
    commands: initCommands(),
    auraBonus,
    manualBonus,
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
  // 纪念堂光环 + 战术手册（D11）：死者的故事与公会的记忆化作力量
  const legacy = c.team === 'guild' ? 1 + (state.auraBonus ?? 0) + (state.manualBonus ?? 0) : 1
  return (c.attack + buff) * fury * stance * legacy
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
  target.hp = Math.max(0, target.hp - amount)
  // 吸血词条：攻击者按比例回血（静默，不产生事件）
  if (attacker.lifesteal && attacker.alive) {
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + Math.round(amount * attacker.lifesteal))
  }
  if (attacker.team === 'guild') {
    target.threat[attacker.id] = (target.threat[attacker.id] ?? 0) + amount
  }
  // 对咏唱中的 boss 造成伤害计入打断阈值
  if (target.bossMechanics) {
    const rt = target.mech?.['cast-buff']
    if (rt && rt.until !== undefined && state.tick < rt.until) {
      rt.taken = (rt.taken ?? 0) + amount
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
    // 团长集火优先（指挥台 D8-9），否则残血优先
    if (state.commands.focusId) {
      target = pool.find((f) => f.id === state.commands.focusId)
    }
    if (!target) {
      // 无集火时：优先击杀最弱目标（增援/残血怪），triage 式清理
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
      // 治疗吞吐须覆盖 boss 基础压力：D15 加压轮后 3.0 倍（~31/s）才撑得住机制尖峰
      const amount = Math.round(c.attack * 3.0)
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
      c.cooldownLeft = c.attackInterval
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
    const amount = Math.round(m.maxHp * HEAL_PCT)
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
