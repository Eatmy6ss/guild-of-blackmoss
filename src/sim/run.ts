import type { BattleState, DeadHero, DungeonDef, Member, RouteNodeDef } from './types'
import type { RunBuffDef } from '../data/guild-events'
import { createBattle, POTION_STOCK, toCombatant } from './combat'
import { grantExp } from './gen'

// 远征状态机（D7/D11）：岔路 → 逐场战斗 → 血量延续 → 战间歇整 → 通关/团灭/撤退。
// D11：战斗死亡 = 永久死亡（markPermadeath），纪念堂接收亡者，休整不再复活亡者。

/** 战间歇整：全队回复 30% 最大生命（仅幸存者——亡者不归，D11） */
export const REST_HEAL_PCT = 0.3

export type RunPhase = 'battle' | 'rest' | 'victory' | 'defeat' | 'retreated'

export interface DungeonRun {
  dungeon: DungeonDef
  /** 本条路线的遭遇战序列（岔路决定） */
  steps: string[]
  stepIdx: number
  phase: RunPhase
  /** phase === 'battle' 且战斗未结束时为当前战斗；终局后保留引用供结算读取 */
  battle: BattleState | null
  /** 远征队成员引用（与公会花名册同对象，死亡即减员） */
  members: Member[]
  /** 纪念堂光环加成（创建远征时由公会状态带入） */
  auraBonus: number
  /** 公会层面的撤退保护开关（D13 修复接线：每场战斗以此初始化） */
  protectOn: boolean
  /** 携带药水（药水经济）：出征时从公会库存带出，逐场延续，回城退回剩余 */
  potions: { heal: number; fury: number }
  /** 挂机连刷(试玩反馈):跨战斗延续,rest 自动下一场,victory 自动重进同一副本 */
  autoMode?: boolean
  /** 特权训练仅作用于这次远征的所有胜场 */
  trainingExpMultiplier?: number
  witnessScarredIds?: string[]
  nodeIds: string[]
  eliteNow?: boolean
  /** 精英场次索引(反馈④:路线内 2-4 只精英,×1.25) */
  eliteAt: number[]
  /** 远征内持续状态(事件给予,整次远征;乘数制 mods) */
  buffs: RunBuffDef[]
  /** 稀有猎杀(事件二期,WoW 式):首场遭遇敌方强化,奖励加厚,用后即逝 */
  rareHunt?: { mult: number; rewardMult: number }
}

/** 岔路映射：险路打满全部遭遇（更多战斗=更多收获机会）；稳路跳过最后一段杂兵 */
/** 路线规格(试玩反馈④:路线要长,10-15 轮;精英 2-4 只;boss 恒压轴) */
export const ROUTE_SPEC = { MIN: 10, MAX: 15, ELITE_MIN: 2, ELITE_MAX: 4 } as const

/**
 * 路线生成:wave 池循环抽取拉长到目标长度(险路 12-15/稳路 10-12),随机场次标记精英(×1.25),
 * boss 恒压轴。此前按 encounters 数组顺序组路线,五张图的 boss 都曾被排在中途——远征永远打不到
 * (制作人实测"白霜没 boss"暴露;门禁直连单场调用测不出,⑲ 保留直连层)。
 */
function routePlan(dungeon: DungeonDef, branchId: string, seed: number): { steps: string[]; eliteAt: number[] } {
  const branch = dungeon.branches.find((b) => b.id === branchId)
  const risky = branch ? branch.risk >= 2 : true
  const bosses = dungeon.encounters.filter((e) => e.kind === 'boss')
  const waves = dungeon.encounters.filter((e) => e.kind === 'wave')
  if (waves.length === 0 || bosses.length === 0) {
    // 数据异常兜底:原样全量(不应发生,⑲ 门禁把关)
    return { steps: dungeon.encounters.map((e) => e.id), eliteAt: [] }
  }
  const target = risky ? 12 + (Math.abs(seed) % 4) : 10 + (Math.abs(seed) % 3)
  const steps: string[] = []
  for (let i = 0; i < target - bosses.length; i++) {
    steps.push(waves[(Math.abs(seed) * 31 + i * 7) % waves.length].id)
  }
  // 精英标记:2-4 场(确定性抽取,分布在中前段)
  const eliteCount = ROUTE_SPEC.ELITE_MIN + (Math.abs(seed * 17 + 3) % (ROUTE_SPEC.ELITE_MAX - ROUTE_SPEC.ELITE_MIN + 1))
  const eliteAt: number[] = []
  const cap = Math.min(eliteCount, steps.length - 1)
  for (let i = 0; i < cap; i++) {
    const at = (Math.abs(seed * 13 + i * 29) % (steps.length - 1))
    if (!eliteAt.includes(at)) eliteAt.push(at)
  }
  return { steps: [...steps, ...bosses.map((b) => b.id)], eliteAt }
}

export function createRun(
  members: Member[],
  dungeon: DungeonDef,
  branchId: string,
  seed: number,
  auraBonus = 0,
  protectOn = true,
  potions = { heal: POTION_STOCK, fury: POTION_STOCK },
  autoMode = false,
): DungeonRun {
  const plan = routePlan(dungeon, branchId, seed)
  const run: DungeonRun = {
    dungeon,
    steps: plan.steps,
    stepIdx: 0,
    phase: 'battle',
    battle: null,
    // 编制随副本:3 人本照旧,团本(5 人)要求并允许更多人上阵(Q22 人本路线)
    members: members.filter((m) => m.alive).slice(0, dungeon.size),
    auraBonus,
    protectOn,
    potions,
    autoMode,
    nodeIds: [],
    eliteAt: plan.eliteAt,
    buffs: [],
  }
  startStep(run, seed)
  return run
}

export function startStep(run: DungeonRun, seed: number, manualBonus = 0): void {
  const isElite = run.eliteAt.includes(run.stepIdx)
  // 稀有猎杀:首场遭遇敌方强化(奖励倍率由结算层消费)
  const rareMult = run.rareHunt && run.stepIdx === 0 ? run.rareHunt.mult : 1
  // 远征内事件状态聚合:乘数连乘(反馈④事件大项)
  const mods: { atk?: number; def?: number; hp?: number; heal?: number } = {}
  for (const b of run.buffs ?? []) {
    for (const [k, v] of Object.entries(b.mods)) {
      const key = k as 'atk' | 'def' | 'hp' | 'heal'
      mods[key] = (mods[key] ?? 1) * (v as number)
    }
  }
  run.battle = createBattle(
    run.members.filter((m) => m.alive),
    run.dungeon,
    run.steps[run.stepIdx],
    seed,
    run.auraBonus,
    manualBonus,
    run.protectOn,
    run.potions,
    (run.eliteNow || isElite ? 1.25 : 1) * rareMult,
    Object.keys(mods).length > 0 ? mods : undefined,
  )
  for (const c of run.battle.combatants) {
    if (c.team === 'enemy' && !c.boss) c.elite = !!(run.eliteNow || isElite)
  }
  run.eliteNow = false
  run.battle.commands.autoMode = !!run.autoMode
  run.phase = 'battle'
}

/** 战斗结算：血量写回成员（倒地记 0，永久死亡由 markPermadeath 登记）；未用完的药水退回携带量 */
export function advanceRun(run: DungeonRun): void {
  const b = run.battle
  if (!b || b.status === 'running') return
  run.potions = { heal: b.commands.healStock, fury: b.commands.furyStock }
  for (const c of b.combatants) {
    if (!c.memberId) continue
    const m = run.members.find((x) => x.id === c.memberId)
    if (m) m.hp = c.alive ? c.hp : 0
  }
  if (b.status === 'guild-wipe') {
    run.phase = 'defeat'
    return
  }
  if (b.status === 'retreated') {
    run.phase = 'retreated'
    return
  }
  if (run.stepIdx >= run.steps.length - 1) {
    run.phase = 'victory'
    return
  }
  for (const m of run.members) {
    if (!m.alive) continue // 亡者不归（D11）：休整只惠及幸存者
    const max = toCombatant(m).maxHp
    m.hp = Math.min(max, Math.max(m.hp, 0) + Math.round(max * REST_HEAL_PCT))
  }
  run.stepIdx++
  run.phase = 'rest'
}

/**
 * 永久死亡登记（D11）：战斗中倒地的远征队员从花名册划去，进入纪念堂。
 * 在 advanceRun 之后、下一次 startStep 之前调用。
 */
export function markPermadeath(run: DungeonRun): DeadHero[] {
  const b = run.battle
  if (!b) return []
  const dead: DeadHero[] = []
  for (const c of b.combatants) {
    if (c.team !== 'guild' || c.alive || !c.memberId) continue
    const m = run.members.find((x) => x.id === c.memberId)
    if (m && m.alive) {
      m.alive = false
      m.hp = 0
      dead.push({
        id: m.id,
        name: m.name,
        job: m.job,
        level: m.level,
        cause: `陨落于${run.dungeon.name}`,
      })
    }
  }
  return dead
}

/**
 * M1 P0 成长发放:胜场经验 + 终局默契。在 advanceRun/markPermadeath 之后调用
 * (阵亡者被 markPermadeath 划去,天然不参与)。App 的 settleBattleEnd 调用,smoke 可直接测。
 */
export function settleGrowth(run: DungeonRun, expMult = 1): void {
  const b = run.battle
  if (!b) return
  if (b.status === 'guild-win') {
    const enc = run.dungeon.encounters.find((e) => e.id === run.steps[run.stepIdx])
    // 试玩反馈④:经验获取收紧——路线拉长到 10-15 场后 波16/boss90 保持"三轮通关升一级"总账
    // (一轮 11 波×16+90=266,三轮 798 ≥ xpNeeded(5)=750,两轮 532 < 750)
    // 难度递增改版(2026-09-25,U08+制作人拍板):经验降档锚定"一副本刷 5-6 遍升一级"
    // 一轮 ~11 波×11+60=181;xpNeeded 750→1200 → 每级 4.1-6.6 遍,前期稍快上手、后期自然放缓
    const exp = enc?.kind === 'boss' ? 60 : 11
    const expected = run.dungeon.expectedLevel
    const over = expected !== undefined
      ? Math.max(0, run.members.reduce((s, m) => s + m.level, 0) / Math.max(1, run.members.length) - expected)
      : 0
    const underMult = over >= 10 ? 0.05 : over >= 7 ? 0.2 : over >= 4 ? 0.5 : 1
    for (const c of b.combatants) {
      if (c.team !== 'guild' || !c.alive || !c.memberId) continue
      const m = run.members.find((x) => x.id === c.memberId)
      if (m?.alive) grantExp(m, Math.round(exp * expMult * (run.trainingExpMultiplier ?? 1) * underMult))
    }
  }
  if (run.phase === 'victory' || run.phase === 'defeat' || run.phase === 'retreated') {
    const survivors = run.members.filter((m) => m.alive)
    for (let i = 0; i < survivors.length; i++) {
      for (let j = i + 1; j < survivors.length; j++) {
        const p = survivors[i]
        const q = survivors[j]
        p.bonds[q.id] = (p.bonds[q.id] ?? 0) + 1
        q.bonds[p.id] = (q.bonds[p.id] ?? 0) + 1
      }
    }
  }
}

/** 撤退（休整界面直接回城）：幸存者保留现状 */
export function retreatRun(run: DungeonRun): void {
  for (const m of run.members) {
    if (m.alive && m.hp <= 0) m.hp = 1
  }
  run.phase = 'retreated'
}

/** 返回公会：幸存者满血重整 */
export function resetAfterRun(members: Member[]): void {
  for (const m of members) {
    if (m.alive) m.hp = toCombatant(m).maxHp
  }
}


// ===== 逐段选路(宪法 v3.3 修正案·熟练度迷雾)=====

/** 熟练度阈值:类型揭示/全揭示/直捣 boss */
/** 熟练度阈值(2026-09-25 难度递增改版:一次远征 ~10-17 熟练,制作人定调"一副本刷 5-6 遍最好"——
 *  35≈2.5-3 遍识类型、60≈4.5-6 遍全揭示、80≈5-8 遍直捣 boss;熟练度=长期经营,快不得) */
export const MASTERY = { KIND: 35, FULL: 60, BOSS_DIRECT: 80 } as const

export type RevealLevel = 'hidden' | 'kind' | 'full'

export function revealLevel(mastery: number): RevealLevel {
  if (mastery >= MASTERY.FULL) return 'full'
  if (mastery >= MASTERY.KIND) return 'kind'
  return 'hidden'
}

/** 岔口选项:未踏过的节点抽 2-3 个(确定性);踏满 3 个节点后只剩 boss */
export function junctionOptions(run: DungeonRun, seed: number, count = 4): RouteNodeDef[] {
  const unvisited = run.dungeon.routeNodes.filter((n) => !run.nodeIds.includes(n.id))
  if (unvisited.length <= count) return [...unvisited]
  // K05 关系表(U13):与已踏节点有边相连者优先入选(最多占 2 席)——
  // 「蛙人哨兵旁常伴水蛭洼地」的地理记忆成立;关系表=边列表,可升级为固定地图连边(U13 分期)
  const rel = run.dungeon.routeRelations ?? []
  const neighbors = new Set<string>()
  for (const [a, b] of rel) {
    if (run.nodeIds.includes(a)) neighbors.add(b)
    if (run.nodeIds.includes(b)) neighbors.add(a)
  }
  const linked = unvisited.filter((n) => neighbors.has(n.id))
  const rest = unvisited.filter((n) => !neighbors.has(n.id))
  const picked: RouteNodeDef[] = []
  let x = seed * 2654435761 + run.nodeIds.length * 97
  const take = (from: RouteNodeDef[], want: number) => {
    for (let i = 0; i < want && from.length > 0; i++) {
      x = (x * 1103515245 + 12345) | 0
      const idx = Math.abs(x) % from.length
      picked.push(from.splice(idx, 1)[0]!)
    }
  }
  take(linked, Math.min(2, linked.length))
  take(rest, count - picked.length)
  take(linked, count - picked.length)
  return picked
}

/** 应用节点选择:返回节点类型;battle/elite 改写下一场遭遇;event/rest 不发生战斗
 *  (F02 修复 2026-09-25:选路发生在 rest 相,advanceRun 已把 stepIdx 指向「下一场待打」——
 *   改写/消耗都应作用于 steps[stepIdx] 本位,此前 +1 一格造成「选蛙人打狼群」错位) */
export function applyNodeChoice(run: DungeonRun, nodeId: string): 'battle' | 'elite' | 'event' | 'rest' | 'treasure' | null {
  const node = run.dungeon.routeNodes.find((n) => n.id === nodeId)
  if (!node || run.nodeIds.includes(node.id)) return null
  run.nodeIds.push(node.id)
  if (node.kind === 'battle' || node.kind === 'elite') {
    if (node.encounterId && run.steps[run.stepIdx] !== undefined) {
      run.steps[run.stepIdx] = node.encounterId
    }
    run.eliteNow = node.kind === 'elite'
    return node.kind
  }
  // 事件/休整节点:消耗即将开打的这场战斗的位次(少打一场,以事件/休整代之;不吞压轴 boss)
  if (run.steps.length > 1 && run.stepIdx < run.steps.length - 1) {
    run.steps.splice(run.stepIdx, 1)
  }
  return node.kind
}
