import type { BattleState, DeadHero, DeathCause, DungeonDef, EncounterDef, Member } from './types'
import type { RunBuffDef } from '../data/guild-events'
import { DUNGEONS } from '../data/dungeons'
import { createBattle, POTION_STOCK, toCombatant } from './combat'
import { grantExp, xpNeeded } from './gen'
import { createRunCore, runDungeon, runMembers, syncRunParty, type RunCore } from './run-core'
import { generateMap, nodeById, nextOptions, type DungeonMap, type MapNode } from './dungeon-map'
import { enterNodeConditions, triggerAfterElite, conditionBattleMods, expireConditions } from './conditions'

// 远征状态机(U27① 改版):分层地图 → 逐节点选择 → 血量延续 → 战间歇整 → 通关/团灭/撤退。
// 每战之后在地图上选一条出边才能前进;没有「继续深入」。D11:战斗死亡 = 永久死亡。

/** 战间歇整：全队回复 30% 最大生命（仅幸存者——亡者不归，D11） */
export const REST_HEAL_PCT = 0.3

export type RunPhase = 'battle' | 'rest' | 'victory' | 'defeat' | 'retreated'

export interface DungeonRun extends RunCore {
  kind: 'dungeon'
  dungeonId: string
  phase: RunPhase
  /** phase === 'battle' 且战斗未结束时为当前战斗；rest(选路/休整)相保留已结束的引用供结算读取;
   *  刚出征还未选第一个节点时为 null */
  battle: BattleState | null
  /** 每趟随机生成的分层地图(R1.1) */
  map: DungeonMap
  /** 当前所在节点 id;'' = 还没踏出第一步(地图第 0 层待选) */
  nodeId: string
  /** 已走路径(节点 id,按序)——遭遇序列由地图+路径推出 */
  path: string[]
  /** 已开始的战斗场数(稀有猎杀「首场」判定用) */
  battlesFought: number
  /** 路况状态 id 集(U27②:不叠层,持续到本趟结束;R1.2) */
  conditions: string[]
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
  statisticsRecorded?: boolean
  witnessScarredIds?: string[]
  /** 远征内持续状态(事件给予,整次远征;乘数制 mods) */
  buffs: RunBuffDef[]
  /** 稀有猎杀(事件二期,WoW 式):首场遭遇敌方强化,奖励加厚,用后即逝 */
  rareHunt?: { mult: number; rewardMult: number }
  /** R5.1e(U33④):本趟已入账的金币/熟练度累计(撤退代价的基数;胜利/团灭不消费) */
  earnedGold?: number
  earnedMastery?: number
  /** R5.1e:撤退时结算的代价(本趟金币/熟练度各留一半,向下取整);团灭不产生 */
  retreatCost?: { gold: number; mastery: number; dungeonId: string }
  /** R4.3(U30):酒馆情报——真情报使本趟揭示档 +1(出发时从公会 intel 消费) */
  intelBonus?: number
  /** #4.2 装备维护:远征终局时算出、回城时扣款(可选字段,旧档零迁移) */
  maintenanceDue?: number
  /** #5.1 悬赏加码条款(自选可叠加;命名接缝:塔规则词缀用 clauses,远征条款用 bountyClauses) */
  bountyClauses?: string[]
  /** #5.1 急行军:整趟 tick 预算(超时即败) */
  hasteBudget?: number
  /** #5.1 带新人:出发时锁定的新人 id(其倒下则条款作废) */
  greenhornId?: string
  /** #5.2 快速通道:本趟走过暗道(沿途金币/经验减半,Boss 掉落照常) */
  fastLaneUsed?: boolean
}

/** 副本的 Boss 链遭遇(按 encounters 顺序):有变体(U28)的原型位由变体顶替——
 *  双 Boss 副本第二场 = 怪物猎人式变体;原 encounters 保留供 ⑲ 门禁直连单场调用 */
export function bossSequence(dungeon: DungeonDef): EncounterDef[] {
  const bosses = dungeon.encounters.filter((e) => e.kind === 'boss')
  const variants = new Map(bosses.filter((e) => e.bossVariantOf).map((e) => [e.bossVariantOf!, e] as const))
  return bosses.filter((e) => !e.bossVariantOf).map((e) => variants.get(e.id) ?? e)
}

/** Boss 节点的下一场:按已打完的 boss 遭遇推进一步;全部打完返回 null */
export function nextBossEncounter(run: DungeonRun): string | null {
  const seq = bossSequence(runDungeon(run))
  const last = run.battle?.encounterId
  const idx = last ? seq.findIndex((e) => e.id === last) + 1 : 0
  return seq[idx]?.id ?? null
}

export function currentNode(run: DungeonRun): MapNode | null {
  return run.nodeId ? nodeById(run.map, run.nodeId) ?? null : null
}

/** 地图上当前可选的下一批节点(空路径=第 0 层;暗道跳层边已含其中) */
export function mapOptions(run: DungeonRun): MapNode[] {
  const opts = nextOptions(run.map, run.nodeId)
  // #5.1 深潜:禁走暗道,逐层推进(UI 选路与挂机 autoPickNode 共用此口;moveTo 兜底守卫)
  if (run.bountyClauses?.includes('deepdive')) return opts.filter((n) => n.kind !== 'secret')
  return opts
}

export function createRun(
  members: Member[],
  dungeon: DungeonDef,
  seed: number,
  auraBonus = 0,
  protectOn = true,
  potions = { heal: POTION_STOCK, fury: POTION_STOCK },
  autoMode = false,
  buffs: RunBuffDef[] = [],
  rareHunt?: { mult: number; rewardMult: number },
): DungeonRun {
  const run: DungeonRun = {
    ...createRunCore(members.filter(m => m.alive).slice(0, dungeon.size), seed),
    kind: 'dungeon', dungeonId: dungeon.id,
    phase: 'rest',
    battle: null,
    map: generateMap(dungeon, seed),
    nodeId: '',
    path: [],
    battlesFought: 0,
    conditions: [],
    auraBonus,
    protectOn,
    potions,
    autoMode,
    buffs: [...buffs],
    ...(rareHunt ? { rareHunt } : {}),
  }
  return run
}

/** 踏上一个节点(必须是与当前节点的出边,或空路径时的第 0 层)。
 *  落地即掷路况(U27②):按地形解除/触发,连战计数;开战/事件由调用方接。
 *  R5.1b:走过一层后,'next-layer' 类状态(迷途)自动消退(先消退再掷新触发,重触发会重新亮起)。 */
export function moveTo(run: DungeonRun, nodeId: string, mastery = 0): MapNode | null {
  const opts = mapOptions(run)
  // #5.1 深潜兜底:即使旧存档/直呼绕过 mapOptions,暗道也不可进
  const target = run.map && nodeById(run.map, nodeId)
  if (run.bountyClauses?.includes('deepdive') && target?.kind === 'secret') return null
  const node = opts.find((n) => n.id === nodeId)
  if (!node) return null
  expireConditions(run, 'next-layer')
  // #5.2 快速通道:满熟练(MASTER 80+)走暗道=主动直捣,沿途金币/经验减半(结算消费;Boss 与掉落不减);
  // 低熟练经迷途显形误入暗道是意外收获,不罚(计划的快速通道是满熟练者的主动选择)
  if (node.kind === 'secret' && mastery >= MASTERY.MASTER) run.fastLaneUsed = true
  run.nodeId = node.id
  run.path.push(node.id)
  enterNodeConditions(run, node, mastery)
  return node
}

export function startStep(run: DungeonRun, seed: number, manualBonus = 0, roster: Member[] = []): void {
  const node = currentNode(run)
  if (!node) throw new Error('远征尚未踏上任何节点')
  // Boss 节点依次连战:encounter 由 boss 序列推进;普通节点读 node.encounterId
  const encounterId = node.kind === 'boss'
    ? nextBossEncounter(run)
    : node.encounterId
  if (!encounterId) throw new Error(`节点 ${node.id} 没有可用的遭遇`)
  const isElite = node.kind === 'elite'
  // 稀有猎杀:首场遭遇敌方强化(奖励倍率由结算层消费)
  const rareMult = run.rareHunt && run.battlesFought === 0 ? run.rareHunt.mult : 1
  // 远征内事件状态聚合:乘数连乘(反馈④事件大项)
  const mods: { atk?: number; def?: number; hp?: number; heal?: number } = {}
  for (const b of run.buffs ?? []) {
    for (const [k, v] of Object.entries(b.mods)) {
      const key = k as 'atk' | 'def' | 'hp' | 'heal'
      mods[key] = (mods[key] ?? 1) * (v as number)
    }
  }
  // 路况状态战斗乘区(U27②):我方走同一乘区,敌方走 difficultyAttack 通道
  const cond = conditionBattleMods(run)
  for (const [k, v] of Object.entries(cond.mods)) {
    const key = k as 'atk' | 'def' | 'hp' | 'heal'
    mods[key] = (mods[key] ?? 1) * (v as number)
  }
  run.battlesFought++
  run.battle = createBattle(
    runMembers(run, roster).filter((m) => m.alive),
    runDungeon(run),
    encounterId,
    seed,
    run.auraBonus,
    manualBonus,
    run.protectOn,
    // #5.1 轻装:途中事件给的药水留在 run.potions(回城照退),但战斗内库存恒 0=不可用
    run.bountyClauses?.includes('lightload') ? { heal: 0, fury: 0 } : run.potions,
    { elite: isElite, rareHunt: rareMult },
    Object.keys(mods).length > 0 ? mods : undefined,
    Object.keys(cond.enemyMods).length > 0 ? cond.enemyMods : undefined,
  )
  run.battle.commands.autoMode = !!run.autoMode
  run.battle.encounterId = encounterId
  run.phase = 'battle'
}

/** 战斗结算：血量写回成员（倒地记 0，永久死亡由 markPermadeath 登记）；未用完的药水退回携带量 */
export function advanceRun(run: DungeonRun, roster: Member[] = []): void {
  const b = run.battle
  if (!b || b.status === 'running') return
  run.potions = { heal: b.commands.healStock, fury: b.commands.furyStock }
  for (const c of b.combatants) {
    if (!c.memberId) continue
    const m = runMembers(run, roster).find((x) => x.id === c.memberId)
    if (m) m.hp = c.alive ? c.hp : 0
  }
  syncRunParty(run, roster)
  if (b.status === 'guild-wipe') {
    run.phase = 'defeat'
    return
  }
  if (b.status === 'retreated') {
    run.phase = 'retreated'
    applyRetreatCost(run)
    return
  }
  const node = currentNode(run)
  // 惊动(U27②):任何精英节点打完触发,后续层精英权重 ×2
  if (b.status === 'guild-win' && node?.kind === 'elite') triggerAfterElite(run)
  // R5.1b:打完一场后,'next-battle' 类状态(暴露)自动消退
  expireConditions(run, 'next-battle')
  // 通关判定:Boss 节点且 boss 序列已打完(U27①:全部 boss 在同一节点依次连战)
  if (node?.kind === 'boss' && nextBossEncounter(run) === null) {
    run.phase = 'victory'
    return
  }
  for (const m of runMembers(run, roster)) {
    if (!m.alive) continue // 亡者不归（D11）：休整只惠及幸存者
    const max = toCombatant(m).maxHp
    m.hp = Math.min(max, Math.max(m.hp, 0) + Math.round(max * REST_HEAL_PCT))
  }
  syncRunParty(run, roster)
  run.phase = 'rest'
}

/**
 * 永久死亡登记（D11）：战斗中倒地的远征队员从花名册划去，进入纪念堂。
 * 在 advanceRun 之后、下一次 startStep 之前调用。
 */
/** 死因渲染(U22 对齐):唯一把 DeathCause 变成碑文文本的地方;smoke 7a 依赖碑文含地名 */
export function renderDeathCause(dc: DeathCause): string {
  const place = dc.where.source === 'tower'
    ? `黑苔高塔第 ${dc.where.floor ?? '?'} 层`
    : DUNGEONS.find((d) => d.id === dc.where.id)?.name ?? dc.where.id
  return `陨落于${place}` + (dc.affixes?.length ? `(死于${dc.affixes.join('/')}词缀之手)` : '')
}

export function markPermadeath(
  run: { members: Member[]; battle: BattleState | null; dungeon?: DungeonDef; kind?: 'dungeon' | 'tower'; dungeonId?: string; floor?: number },
  place = run.dungeon?.name ?? '未知之地',
): DeadHero[] {
  const b = run.battle
  if (!b) return []
  const where: DeathCause['where'] = run.kind === 'tower'
    ? { source: 'tower', id: 'tower', floor: run.floor }
    : { source: 'dungeon', id: run.dungeonId ?? run.dungeon?.id ?? place }
  const death: DeathCause = { kind: 'battle', where }
  const dead: DeadHero[] = []
  for (const c of b.combatants) {
    if (c.team !== 'guild' || c.alive || !c.memberId) continue
    const m = run.members.find((x) => x.id === c.memberId)
    if (m && m.alive) {
      m.alive = false
      m.hp = 0
      // B3-4 死因写入词缀(U22 编年史第 1 步):被词缀敌击杀 → affixes 填充+碑文可见
      const withAffix = { ...death, affixes: c.deathAffixes }
      dead.push({
        id: m.id,
        name: m.name,
        job: m.job,
        level: m.level,
        cause: renderDeathCause(withAffix),
        death: withAffix,
        // R4.1 生平:阵亡瞬间的传记快照(纪念堂读;此后成员自身的 bio 不再增长)
        bio: m.bio ? [...m.bio] : undefined,
      })
    }
  }
  return dead
}

/**
 * M1 P0 成长发放:胜场经验 + 终局默契。在 advanceRun/markPermadeath 之后调用
 * (阵亡者被 markPermadeath 划去,天然不参与)。App 的 settleBattleEnd 调用,smoke 可直接测。
 */
export interface GrowthResult {
  experience: { memberId: string; amount: number; fromLevel: number; toLevel: number }[]
  bonds: { a: string; b: string; amount: number }[]
}

interface GrowthRun {
  members: Member[]
  battle: BattleState | null
  phase: string
  dungeon?: DungeonDef
  trainingExpMultiplier?: number
  /** R5.1c(U33②):精英节点胜场经验 ×2(节点的遭遇本体是普通 wave,精英属性在节点上) */
  elite?: boolean
}

/** 塔层传入原有经验和共同经历边界；两种来源共享参战、种族经验和默契发放。 */
export function settleGrowth(run: GrowthRun, expMult = 1, floorReward?: { exp: number; bonds: boolean }): GrowthResult {
  const result: GrowthResult = { experience: [], bonds: [] }
  const b = run.battle
  if (!b) return result
  if (b.status === 'guild-win') {
    const enc = run.dungeon?.encounters.find((e) => e.id === b.encounterId)
    // V1 难度二轮收紧(2026-09-26):威胁升档但不降收益;经验只收紧为波9/Boss50。
    // R5/U33②:精英经验 ×2 = 18(C4 占位;精英属性在节点 kind,由结算层传入 elite)。
    const exp = floorReward?.exp ?? (enc?.kind === 'boss' ? 50 : run.elite ? 18 : 9)
    const expected = floorReward ? undefined : run.dungeon?.expectedLevel
    const over = expected !== undefined
      ? Math.max(0, run.members.reduce((s, m) => s + m.level, 0) / Math.max(1, run.members.length) - expected)
      : 0
    const underMult = over >= 10 ? 0.05 : over >= 7 ? 0.2 : over >= 4 ? 0.5 : 1
    for (const c of b.combatants) {
      if (c.team !== 'guild' || !c.alive || !c.memberId) continue
      const m = run.members.find((x) => x.id === c.memberId)
      if (m?.alive) {
        const fromLevel = m.level
        const beforeExp = m.exp
        const amount = Math.round(exp * expMult * (run.trainingExpMultiplier ?? 1) * underMult)
        grantExp(m, amount)
        let earned = m.exp - beforeExp
        for (let level = fromLevel; level < m.level; level++) earned += xpNeeded(level)
        result.experience.push({ memberId: m.id, amount: earned, fromLevel, toLevel: m.level })
      }
    }
  }
  if (floorReward?.bonds || run.phase === 'victory' || run.phase === 'defeat' || run.phase === 'retreated') {
    const survivors = run.members.filter((m) => m.alive)
    for (let i = 0; i < survivors.length; i++) {
      for (let j = i + 1; j < survivors.length; j++) {
        const p = survivors[i]
        const q = survivors[j]
        p.bonds[q.id] = (p.bonds[q.id] ?? 0) + 1
        q.bonds[p.id] = (q.bonds[p.id] ?? 0) + 1
        result.bonds.push({ a: p.id, b: q.id, amount: 1 })
      }
    }
  }
  return result
}

/** R5.1e(U33④):撤退代价——本趟已获得的金币和熟练度只保留一半(向下取整),装备照拿,药水照退。
 *  团灭不在此列(走 defeat 原逻辑)。战斗中撤离与休整回城两条路都在此收口。 */
export function applyRetreatCost(run: DungeonRun): { gold: number; mastery: number } {
  const gold = Math.floor((run.earnedGold ?? 0) / 2)
  const mastery = Math.floor((run.earnedMastery ?? 0) / 2)
  run.retreatCost = { gold, mastery, dungeonId: run.dungeonId }
  return run.retreatCost
}

/** 撤退（休整界面直接回城）：幸存者保留现状;R5.1e 撤退代价在此结算 */
export function retreatRun(run: DungeonRun, roster: Member[] = []): void {
  for (const m of runMembers(run, roster)) {
    if (m.alive && m.hp <= 0) m.hp = 1
  }
  syncRunParty(run, roster)
  run.phase = 'retreated'
  applyRetreatCost(run)
}

/** 返回公会：幸存者满血重整 */
export function resetAfterRun(members: Member[]): void {
  for (const m of members) {
    if (m.alive) m.hp = toCombatant(m).maxHp
  }
}


// ===== 熟练度迷雾(宪法 v3.3 修正案;R1.3 扩为四档+暗道)=====

/** 熟练度阈值(R1.3 四档,redesign §3 表):
 *  0-34 未探索节点全盲;35-59 相邻层类型+前两层地形;
 *  60-79 前两层类型+节点内容+路况提示(触发率 ×0.75);80+ 全图类型+暗道可见(触发率 ×0.5)。
 *  直捣 boss 已随固定路线删除(R1.1),其职能由暗道接替。 */
export const MASTERY = { KIND: 35, FULL: 60, MASTER: 80 } as const

export type RevealTier = 0 | 1 | 2 | 3

/** 揭示档位:revealBonus=酒馆情报的本趟临时侦察(每点 +1 档);penalty=迷途的临时降档 */
export function revealTier(mastery: number, revealBonus = 0, revealPenalty = 0): RevealTier {
  const base = mastery >= MASTERY.MASTER ? 3 : mastery >= MASTERY.FULL ? 2 : mastery >= MASTERY.KIND ? 1 : 0
  return Math.max(0, Math.min(3, base + revealBonus - revealPenalty)) as RevealTier
}
