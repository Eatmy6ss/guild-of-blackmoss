import { rollDrop, createLootRng } from './loot'
import { ITEM_BASES } from '../data/items'
import { BLACKMOSS, RUSTMINE, DUNGEONS } from '../data/dungeons'
import type { BossDef, DungeonDef, EnemyDef, ItemInstance, Member } from './types'
import { createBattle, POTION_STOCK } from './combat'
import type { BattleState } from './types'
import { scaleEnemy, towerEnemyScale, TOWER_SCALING_PER_FLOOR } from './difficulty'
import type { Rng } from './rng'
import { createRunCore, runMembers, syncRunParty, type RunCore } from './run-core'
import { markPermadeath } from './run'
import { towerSegment, rollSegmentRules, hasRule } from './tower-rule'
export { towerEnemyScale } from './difficulty'

// 黑苔高塔(批次 3/U38 改造:主菜赌局化):
//   无限递增、记录最高层;分层残酷——1–4 层保护可用,5–8 层药水减半,9 层起保护失效;
//   **下塔才结算**(#3.1):金币/掉落累计进 pendingLoot,离开时兑现,团灭损失大部分(U38:C4 占位只保 20%);
//   **禁挂机**(A4/#3.1):autoMode 已删除,塔只能手动爬(塔纪录本就只认手动)。
//   内容池全版图(#3.1):低层版图一怪组,深层解锁版图二;全部经 difficulty.scaleEnemy,不在本文件写缩放。

export const TOWER = {
  /** 每层强度倍率(相对第 1 层):1 + 0.15 × (层-1) */
  scalingPerFloor: TOWER_SCALING_PER_FLOOR,
  /** boss 层间隔 */
  bossEvery: 3,
  /** 保护可用层数上限(9 层起保护失效) */
  protectUntilFloor: 8,
  /** 药水减半层数起点 */
  potionHalfFromFloor: 5,
  /** 每层胜利金币 = 基础 30 × (1 + 0.25 × (层-1)) */
  goldPerFloorBase: 30,
  goldScalingPerFloor: 0.25,
  /** 层间休整回复(比副本的 30% 更紧) */
  restHealPct: 0.2,
  /** K03 大秘境(2026-09-25):每层胜利经验 = 20 + 8 × 层 */
  expPerFloorBase: 20,
  expScalingPerFloor: 8,
} as const

/** 每层胜利经验(K03):奖励曲线随层数增长,贴合「装等到位去刷大秘境」的挑战循环 */
export function towerExp(floor: number): number {
  return TOWER.expPerFloorBase + TOWER.expScalingPerFloor * (floor - 1)
}

/** 塔掉落装备的纪元:前 5 层 T1,6–11 层 T2,12 层起 T3 */
export function towerItemTier(floor: number): number {
  if (floor >= 12) return 3
  return floor >= 6 ? 2 : 1
}

export type TowerPhase = 'battle' | 'rest' | 'ended'

export interface TowerRun extends RunCore {
  kind: 'tower'
  floor: number
  phase: TowerPhase
  battle: BattleState | null
  goldEarned: number
  /** 携带药水(药水经济):进塔时从公会库存带出,逐层延续,离开时退回剩余 */
  potions: { heal: number; fury: number }
  /** #3.1 下塔才结算:装备掉落暂存(金币/经验/星髓走 RunCore.pendingLoot);离开时兑现 */
  pendingDrops?: ItemInstance[]
  /** B3-2:当前段规则词缀(进段 roll,段=3 层)与历史(收手界面用) */
  segmentIndex?: number
  segmentRules?: import('./tower-rule').TowerRuleId[]
  ruleHistory?: Record<number, import('./tower-rule').TowerRuleId[]>
  /** 遗物安葬 2.0:本层已投保(阵亡装备免赎回费) */
  insuredFloor?: boolean
  /** 休整时购买的下一层保障，进入指定层时生效 */
  insuredNextFloor?: number
  witnessScarredIds?: string[]
  result?: 'left' | 'defeated'
}

export function towerGold(floor: number): number {
  return Math.round(TOWER.goldPerFloorBase * (1 + TOWER.goldScalingPerFloor * (floor - 1)))
}

export function towerFloorIsBoss(floor: number): boolean {
  return floor % TOWER.bossEvery === 0
}

/** 敌人按层数缩放(HP/攻击同步上涨,防御/速度不动——强度可读) */
function towerFloorScale<T extends EnemyDef>(def: T, floor: number): T {
  return { ...scaleEnemy(def, towerEnemyScale(floor)), defense: def.defense, difficultyScaled: true }
}

// #3.1 全版图内容池:随层数解锁(低层版图一,深层版图二;全部走 scaleEnemy)
const D = { BLACKMOSS, RUSTMINE } as const
void D
const BOSS_ROTATION: { boss: BossDef; groups: DungeonDef['enemyGroups']; fromFloor: number }[] = [
  { boss: BLACKMOSS.bosses.grush, groups: BLACKMOSS.enemyGroups, fromFloor: 1 },
  { boss: BLACKMOSS.bosses.talma, groups: BLACKMOSS.enemyGroups, fromFloor: 3 },
  { boss: RUSTMINE.bosses.delveanchor, groups: RUSTMINE.enemyGroups, fromFloor: 6 },
  ...Object.values(DUNGEONS)
    .filter((d) => !['blackmoss', 'rustmine'].includes(d.id))
    .flatMap((d) => Object.values(d.bosses).map((boss) => ({ boss, groups: d.enemyGroups, fromFloor: boss.mechanics.length >= 2 ? 9 : 6 }))),
]

/** #3.1 单一来源:某一层用哪组 raw 定义(boss 或杂兵组)——startTowerFloor 与测试共用,不再各写轮换 */
export function towerEncounterRaw(floor: number): { kind: 'boss'; entry: (typeof BOSS_ROTATION)[number] } | { kind: 'wave'; group: EnemyDef[] } {
  if (towerFloorIsBoss(floor)) {
    const bossPool = BOSS_ROTATION.filter((e) => e.fromFloor <= floor)
    return { kind: 'boss', entry: bossPool[(Math.floor(floor / TOWER.bossEvery) - 1) % bossPool.length]! }
  }
  const waveIndex = floor - 1 - Math.floor(floor / TOWER.bossEvery)
  const pool = floorPool(floor)
  return { kind: 'wave', group: pool[waveIndex % pool.length]! }
}

/** 生成某一层的战斗(复用 createBattle:威胁/站位/机制全继承) */
export function startTowerFloor(run: TowerRun, seed: number, roster: Member[] = []): void {
  const floor = run.floor
  // B3-2:进新段 roll 规则词缀(1–2 条,层数越高越多)
  const segment = towerSegment(floor)
  if (run.segmentIndex !== segment) {
    run.segmentIndex = segment
    const lootRngSeg = createLootRng((run.seed ?? 0) * 131 + segment * 613)
    run.segmentRules = rollSegmentRules(segment, () => lootRngSeg())
    run.ruleHistory = { ...(run.ruleHistory ?? {}), [segment]: run.segmentRules }
  }
  const rules = run.segmentRules
  const enc = towerEncounterRaw(floor)
  const isBoss = enc.kind === 'boss'
  const entry = enc.kind === 'boss' ? enc.entry : BOSS_ROTATION[0]! // wave 层不消费 entry(类型收窄垫片)
  const pool: EnemyDef[] = enc.kind === 'wave'
    ? enc.group.map((e) => towerFloorScale(e, floor))
    : []
  const enemyGroups: DungeonDef['enemyGroups'] = { tower: pool }
  if (isBoss) {
    for (const mechanic of entry.boss.mechanics) {
      if (mechanic.kind !== 'summon') continue
      const groupId = String(mechanic.params.groupId)
      enemyGroups[groupId] = entry.groups[groupId].map((e) => towerFloorScale(e, floor))
    }
  }
  const dungeon: DungeonDef = {
    id: `tower-${floor}`,
    name: `黑苔高塔·第 ${floor} 层`,
    rating: 1,
    size: 3,
    terrains: {},
    ...(hasRule(rules, 'scorching') ? { env: 'heat' as const } : {}),
    enemyGroups,
    bosses: isBoss ? { boss: towerFloorScale(entry.boss, floor) } : {},
    encounters: [
      isBoss
        ? { id: 'tower-boss', name: `守塔者(第 ${floor} 层)`, kind: 'boss', enemyGroupIds: [], bossId: 'boss' }
        : { id: 'tower-wave', name: `高塔徘徊者(第 ${floor} 层)`, kind: 'wave', enemyGroupIds: ['tower'] },
    ],
  }
  // 药水经济:本层从携带库存中支取;5 层起每场可用减半(深层药力稀薄,残酷分层)
  const alloc = hasRule(rules, 'no-potion')
    ? { heal: 0, fury: 0 }
    : {
        heal: floor >= TOWER.potionHalfFromFloor ? Math.min(run.potions.heal, Math.max(1, Math.floor(run.potions.heal / 2))) : run.potions.heal,
        fury: floor >= TOWER.potionHalfFromFloor ? Math.min(run.potions.fury, Math.max(1, Math.floor(run.potions.fury / 2))) : run.potions.fury,
      }
  run.potions = { heal: run.potions.heal - alloc.heal, fury: run.potions.fury - alloc.fury }
  run.battle = createBattle(
    runMembers(run, roster).filter((m) => m.alive),
    dungeon,
    isBoss ? 'tower-boss' : 'tower-wave',
    seed + floor * 101,
    0,
    0,
    // 分层残酷:9 层起保护失效
    floor <= TOWER.protectUntilFloor,
    alloc,
    { towerFloor: floor },
  )
  // B3-2 规则接线:残血开局(60% C4)/治疗减半(healTakenMod,#2.7 独立乘区)
  if (hasRule(rules, 'low-start')) {
    for (const c of run.battle.combatants) {
      if (c.team === 'guild' && c.alive) c.hp = Math.max(1, Math.round(c.maxHp * 0.6))
    }
  }
  if (hasRule(rules, 'half-heal')) {
    for (const c of run.battle.combatants) {
      if (c.team === 'guild') c.healTakenMod = (c.healTakenMod ?? 1) * 0.5
    }
  }
  run.phase = 'battle'
}

// #3.1 杂兵池:低层版图一组,9 层起混入版图二组(纯数据;缩放统一走 towerFloorScale)
const FLOOR_POOL_EARLY: EnemyDef[][] = [
  BLACKMOSS.enemyGroups.frogs,
  BLACKMOSS.enemyGroups.wolves,
  BLACKMOSS.enemyGroups.leeches,
]
const FLOOR_POOL_DEEP: EnemyDef[][] = [
  ...FLOOR_POOL_EARLY,
  ...Object.values(DUNGEONS)
    .filter((d) => !['blackmoss', 'rustmine'].includes(d.id))
    .flatMap((d) => Object.values(d.enemyGroups).filter((g) => g.length > 0)),
]
function floorPool(floor: number): EnemyDef[][] {
  return floor >= 9 ? FLOOR_POOL_DEEP : FLOOR_POOL_EARLY
}

export function startTower(members: Member[], seed: number, potions = { heal: POTION_STOCK, fury: POTION_STOCK }): TowerRun {
  const run: TowerRun = {
    ...createRunCore(members.filter(m => m.alive).slice(0, 3), seed),
    kind: 'tower',
    floor: 1,
    phase: 'battle',
    battle: null,
    goldEarned: 0,
    pendingDrops: [],
    potions,
  }
  startTowerFloor(run, seed, members)
  return run
}

/**
 * 塔层结算(在战斗终局后、下一层开始前调用):
 *   胜利 → 金币立即入账(返回金额)、记录层数、层间休整;
 *   撤退 → 塔结束(带着收益离开);团灭 → 塔结束(阵亡全款,由 markPermadeath 同款逻辑在外层登记)。
 * 返回 { gold, cleared }:gold 为本层入账金币;cleared 表示本层打通(可继续深入)。
 */
export function settleTowerFloor(run: TowerRun, rng?: Rng, itemId?: () => string, roster: Member[] = []): { gold: number; cleared: boolean; exp: number; drops: ItemInstance[] } {
  const b = run.battle
  if (!b || b.status === 'running') return { gold: 0, cleared: false, exp: 0, drops: [] }
  const gold = b.status === 'guild-win' ? towerGold(run.floor) : 0
  run.goldEarned += gold
  // 未用完的药水退回携带量(团灭也一样:没喝掉的还在袋子里)
  run.potions = { heal: run.potions.heal + b.commands.healStock, fury: run.potions.fury + b.commands.furyStock }
  // F04 修复(2026-09-25):战末血量写回 member——否则层间休整/下一层都拿进层时的旧值,
  // 每层满血开局,跨层消耗的紧张感完全失效(审查算例:255max 战末 10,休整 20% 应 61)
  for (const c of b.combatants) {
    if (!c.memberId) continue
    const m = runMembers(run, roster).find((x) => x.id === c.memberId)
    if (m) m.hp = c.alive ? c.hp : 0
  }
  syncRunParty(run, roster)
  if (b.status === 'guild-win') {
    run.phase = 'rest'
    // K03 大秘境奖励(2026-09-25):经验曲线+装备掉落——boss 层必掉,普通层 10%;
    // 奖励厚于普通本是「装等到位来挑战」的循环锚
    const exp = towerExp(run.floor)
    const drops: ItemInstance[] = []
    const isBoss = towerFloorIsBoss(run.floor)
    const lootRng = rng ?? createLootRng((run.seed ?? 0) * 31 + run.floor * 977)
    if (isBoss || lootRng() < 0.1) {
      const tier = towerItemTier(run.floor)
      const pool = Object.values(ITEM_BASES).filter((x) => x.tier === tier)
      if (pool.length > 0) {
        const base = pool[Math.floor(lootRng() * pool.length)]!
        drops.push(rollDrop(base.id, lootRng, { qualityBias: isBoss ? 0.15 : 0, id: itemId?.() }))
      }
    }
    // #3.1 下塔才结算:金币/掉落进 pending(返回值仅供小结/通知,不再立即入账)
    run.pendingLoot.gold += gold
    run.pendingLoot.exp += exp
    run.pendingDrops = [...(run.pendingDrops ?? []), ...drops]
    return { gold, cleared: true, exp, drops }
  }
  run.phase = 'ended'
  run.result = b.status === 'retreated' ? 'left' : 'defeated'
  return { gold, cleared: false, exp: 0, drops: [] }
}

/** 层间休整:幸存者回复(塔内比副本更紧);不推进层数——推进由 towerNext
 *  F05 修复(2026-09-25):接通疗养所加成(towerRestHealPct),不再吃固定常量 */
export function towerRest(run: TowerRun, healPct: number = TOWER.restHealPct, roster: Member[] = []): void {
  // B3-2 无营地:本段休整不回复
  if (hasRule(run.segmentRules, 'no-camp')) return
  for (const m of runMembers(run, roster)) {
    if (!m.alive) continue
    const c = run.battle?.combatants.find((x) => x.memberId === m.id)
    const max = c?.maxHp ?? m.hp
    m.hp = Math.min(max, Math.max(m.hp, 0) + Math.round(max * healPct))
  }
}

/** 深入下一层(层间休整界面点击后) */
export function towerNext(run: TowerRun, seed: number, roster: Member[] = []): void {
  run.floor += 1
  run.insuredFloor = run.insuredNextFloor === run.floor
  delete run.insuredNextFloor
  startTowerFloor(run, seed, roster)
}

/**
 * #3.1 下塔兑现:领取累计战利品。mult=1 正常离开;团灭 0.2(C4 占位,「损失大部分」)。
 */
export function claimPendingLoot(run: TowerRun, mult = 1): { gold: number; exp: number; drops: ItemInstance[] } {
  const gold = Math.round(run.pendingLoot.gold * mult)
  const exp = Math.round(run.pendingLoot.exp * mult)
  const drops = mult >= 1 ? (run.pendingDrops ?? []) : (run.pendingDrops ?? []).slice(0, Math.floor((run.pendingDrops ?? []).length * mult))
  run.pendingLoot.gold = 0
  run.pendingLoot.exp = 0
  run.pendingDrops = []
  return { gold, exp, drops }
}

/** 兼容旧脚本入口；阵亡判定只有 run.markPermadeath 一份。 */
export function towerMarkPermadeath(run: TowerRun, dungeonName: string, roster: Member[] = []): Array<{ id: string; name: string; job: Member['job']; level: number; cause: string }> {
  return markPermadeath({ ...run, members: runMembers(run, roster) }, `${dungeonName}第 ${run.floor} 层`)
}

/** 下一层投保：重复购买、非休整、资金不足均不扣款。 */
export function insureNextTowerFloor(run: TowerRun, gold: number): number {
  const target = run.floor + 1
  const premium = target * 40
  if (run.phase !== 'rest' || run.insuredNextFloor === target || gold < premium) return 0
  run.insuredNextFloor = target
  return premium
}
