import { rollDrop, createLootRng } from './loot'
import { ITEM_BASES } from '../data/items'
import { BLACKMOSS, RUSTMINE } from '../data/dungeons'
import type { BossDef, DungeonDef, EnemyDef, ItemInstance, Member } from './types'
import { createBattle, POTION_STOCK } from './combat'
import type { BattleState } from './types'
import { scaleEnemy, towerEnemyScale, TOWER_SCALING_PER_FLOOR } from './difficulty'
import type { Rng } from './rng'
import { createRunCore, runMembers, syncRunParty, type RunCore } from './run-core'
import { markPermadeath } from './run'
export { towerEnemyScale } from './difficulty'

// 黑苔高塔(M1 P1,宪法 Q4/Q5/Q6 定稿):
//   无限递增(敌人强度随层数线性上涨)、记录最高层;
//   分层残酷——1–4 层保护可用,5–8 层药水减半,9 层起保护失效(真死真损失);
//   挂机不禁止:队长 AI 的上限天然压胜率(打不过深层 boss)。
// 奖励逐层立即入账(金币/掉落),团灭只损失英雄——塔的残酷在保护失效,不在惩罚复杂度。

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
  /** 挂机连刷(试玩反馈):跨层延续,rest 自动深入下一层 */
  autoMode?: boolean
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

const BOSS_ROTATION: { boss: BossDef; groups: DungeonDef['enemyGroups'] }[] = [
  { boss: BLACKMOSS.bosses.grush, groups: BLACKMOSS.enemyGroups },
  { boss: BLACKMOSS.bosses.talma, groups: BLACKMOSS.enemyGroups },
  { boss: RUSTMINE.bosses.delveanchor, groups: RUSTMINE.enemyGroups },
]

/** 生成某一层的战斗(复用 createBattle:威胁/站位/机制全继承) */
export function startTowerFloor(run: TowerRun, seed: number, roster: Member[] = []): void {
  const floor = run.floor
  const isBoss = towerFloorIsBoss(floor)
  // 普通层独立计数,避免第三组永远被每三层一次的 Boss 占用。
  const waveIndex = floor - 1 - Math.floor(floor / TOWER.bossEvery)
  const pool: EnemyDef[] = isBoss
    ? []
    : FLOOR_POOL[waveIndex % FLOOR_POOL.length].map((e) => towerFloorScale(e, floor))
  const entry = BOSS_ROTATION[(Math.floor(floor / TOWER.bossEvery) - 1) % BOSS_ROTATION.length]
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
    enemyGroups,
    bosses: isBoss ? { boss: towerFloorScale(entry.boss, floor) } : {},
    encounters: [
      isBoss
        ? { id: 'tower-boss', name: `守塔者(第 ${floor} 层)`, kind: 'boss', enemyGroupIds: [], bossId: 'boss' }
        : { id: 'tower-wave', name: `高塔徘徊者(第 ${floor} 层)`, kind: 'wave', enemyGroupIds: ['tower'] },
    ],
  }
  // 药水经济:本层从携带库存中支取;5 层起每场可用减半(深层药力稀薄,残酷分层)
  const alloc = {
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
  run.battle.commands.autoMode = !!run.autoMode
  run.phase = 'battle'
}

const FLOOR_POOL: EnemyDef[][] = [
  // 跳过 Boss 层:1/5/10… 蛙人,2/7/11… 狼,4/8/13… 水蛭。
  BLACKMOSS.enemyGroups.frogs,
  BLACKMOSS.enemyGroups.wolves,
  BLACKMOSS.enemyGroups.leeches,
]

export function startTower(members: Member[], seed: number, potions = { heal: POTION_STOCK, fury: POTION_STOCK }): TowerRun {
  const run: TowerRun = {
    ...createRunCore(members.filter(m => m.alive).slice(0, 3), seed),
    kind: 'tower',
    floor: 1,
    phase: 'battle',
    battle: null,
    goldEarned: 0,
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
    return { gold, cleared: true, exp, drops }
  }
  run.phase = 'ended'
  run.result = b.status === 'retreated' ? 'left' : 'defeated'
  return { gold, cleared: false, exp: 0, drops: [] }
}

/** 层间休整:幸存者回复(塔内比副本更紧);不推进层数——推进由 towerNext
 *  F05 修复(2026-09-25):接通疗养所加成(towerRestHealPct),不再吃固定常量 */
export function towerRest(run: TowerRun, healPct: number = TOWER.restHealPct, roster: Member[] = []): void {
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
