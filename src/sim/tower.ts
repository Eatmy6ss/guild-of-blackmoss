import type { BossDef, DungeonDef, EnemyDef, Member } from './types'
import { createBattle, POTION_STOCK } from './combat'
import type { BattleState } from './types'

// 黑苔高塔(M1 P1,宪法 Q4/Q5/Q6 定稿):
//   无限递增(敌人强度随层数线性上涨)、记录最高层;
//   分层残酷——1–4 层保护可用,5–8 层药水减半,9 层起保护失效(真死真损失);
//   挂机不禁止:队长 AI 的上限天然压胜率(打不过深层 boss)。
// 奖励逐层立即入账(金币/掉落),团灭只损失英雄——塔的残酷在保护失效,不在惩罚复杂度。

export const TOWER = {
  /** 每层强度倍率(相对第 1 层):1 + 0.15 × (层-1) */
  scalingPerFloor: 0.15,
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
} as const

export type TowerPhase = 'battle' | 'rest' | 'ended'

export interface TowerRun {
  floor: number
  phase: TowerPhase
  battle: BattleState | null
  /** 引用公会花名册的远征队成员(死亡=永久,与副本一致) */
  members: Member[]
  goldEarned: number
  result?: 'left' | 'defeated'
}

export function towerEnemyScale(floor: number): number {
  return 1 + TOWER.scalingPerFloor * (floor - 1)
}

export function towerGold(floor: number): number {
  return Math.round(TOWER.goldPerFloorBase * (1 + TOWER.goldScalingPerFloor * (floor - 1)))
}

export function towerFloorIsBoss(floor: number): boolean {
  return floor % TOWER.bossEvery === 0
}

/** 敌人按层数缩放(HP/攻击同步上涨,防御/速度不动——强度可读) */
function scaleEnemy(def: EnemyDef, floor: number): EnemyDef {
  const k = towerEnemyScale(floor)
  return {
    ...def,
    maxHp: Math.round(def.maxHp * k),
    attack: Math.round(def.attack * k),
  }
}

const BOSS_ROTATION: Array<(floor: number) => BossDef> = [
  (floor) => scaledBoss(BLACKMOSS_BOSSES.grush, floor),
  (floor) => scaledBoss(BLACKMOSS_BOSSES.talma, floor),
]

// 塔复用黑苔沼泽的敌人/boss 数据表(缩放后入场)——内容皆数据
import { BLACKMOSS } from '../data/dungeons'
const BLACKMOSS_BOSSES = BLACKMOSS.bosses

function scaledBoss(def: BossDef, floor: number): BossDef {
  const k = towerEnemyScale(floor)
  return { ...def, maxHp: Math.round(def.maxHp * k), attack: Math.round(def.attack * k) }
}

/** 生成某一层的战斗(复用 createBattle:威胁/站位/机制全继承) */
export function startTowerFloor(run: TowerRun, seed: number): void {
  const floor = run.floor
  const isBoss = towerFloorIsBoss(floor)
  const pool: EnemyDef[] = isBoss
    ? []
    : [FLOOR_POOL[(floor - 1) % FLOOR_POOL.length]].map((g) => g.map((e) => scaleEnemy(e, floor))).flat()
  const dungeon: DungeonDef = {
    id: `tower-${floor}`,
    name: `黑苔高塔·第 ${floor} 层`,
    size: 3,
    branches: [],
    enemyGroups: { tower: pool },
    bosses: isBoss ? { boss: BOSS_ROTATION[(Math.floor(floor / TOWER.bossEvery) - 1) % BOSS_ROTATION.length](floor) } : {},
    encounters: [
      isBoss
        ? { id: 'tower-boss', name: `守塔者(第 ${floor} 层)`, kind: 'boss', enemyGroupIds: [], bossId: 'boss' }
        : { id: 'tower-wave', name: `高塔徘徊者(第 ${floor} 层)`, kind: 'wave', enemyGroupIds: ['tower'] },
    ],
  }
  run.battle = createBattle(
    run.members.filter((m) => m.alive),
    dungeon,
    isBoss ? 'tower-boss' : 'tower-wave',
    seed + floor * 101,
    0,
    0,
    // 分层残酷:9 层起保护失效
    floor <= TOWER.protectUntilFloor,
  )
  // 5 层起药水减半
  if (floor >= TOWER.potionHalfFromFloor) {
    const b = run.battle!
    b.commands.healStock = Math.ceil(POTION_STOCK / 2) - 1
    b.commands.furyStock = Math.ceil(POTION_STOCK / 2) - 1
  }
  run.phase = 'battle'
}

const FLOOR_POOL: EnemyDef[][] = [
  // 第 1/4/7… 层:蛙人;2/5/8…:狼;3 层归 boss 层轮换占用前的水蛭留给非 3 倍数层
  BLACKMOSS.enemyGroups.frogs,
  BLACKMOSS.enemyGroups.wolves,
  BLACKMOSS.enemyGroups.leeches,
]

export function startTower(members: Member[], seed: number): TowerRun {
  const run: TowerRun = {
    floor: 1,
    phase: 'battle',
    battle: null,
    members: members.filter((m) => m.alive).slice(0, 3),
    goldEarned: 0,
  }
  startTowerFloor(run, seed)
  return run
}

/**
 * 塔层结算(在战斗终局后、下一层开始前调用):
 *   胜利 → 金币立即入账(返回金额)、记录层数、层间休整;
 *   撤退 → 塔结束(带着收益离开);团灭 → 塔结束(阵亡全款,由 markPermadeath 同款逻辑在外层登记)。
 * 返回 { gold, cleared }:gold 为本层入账金币;cleared 表示本层打通(可继续深入)。
 */
export function settleTowerFloor(run: TowerRun): { gold: number; cleared: boolean } {
  const b = run.battle
  if (!b || b.status === 'running') return { gold: 0, cleared: false }
  const gold = b.status === 'guild-win' ? towerGold(run.floor) : 0
  run.goldEarned += gold
  if (b.status === 'guild-win') {
    run.phase = 'rest'
    return { gold, cleared: true }
  }
  run.phase = 'ended'
  run.result = b.status === 'retreated' ? 'left' : 'defeated'
  return { gold, cleared: false }
}

/** 层间休整:幸存者回复(塔内比副本更紧);不推进层数——推进由 towerNext */
export function towerRest(run: TowerRun): void {
  for (const m of run.members) {
    if (!m.alive) continue
    const c = run.battle?.combatants.find((x) => x.memberId === m.id)
    const max = c?.maxHp ?? m.hp
    m.hp = Math.min(max, Math.max(m.hp, 0) + Math.round(max * TOWER.restHealPct))
  }
}

/** 深入下一层(层间休整界面点击后) */
export function towerNext(run: TowerRun, seed: number): void {
  run.floor += 1
  startTowerFloor(run, seed)
}

/** 塔内阵亡登记(与副本同款:倒地=永久牺牲) */
export function towerMarkPermadeath(run: TowerRun, dungeonName: string): Array<{ id: string; name: string; job: Member['job']; level: number; cause: string }> {
  const b = run.battle
  const dead: Array<{ id: string; name: string; job: Member['job']; level: number; cause: string }> = []
  if (!b) return dead
  for (const c of b.combatants) {
    if (c.team !== 'guild' || c.alive || !c.memberId) continue
    const m = run.members.find((x) => x.id === c.memberId)
    if (m && m.alive) {
      m.alive = false
      m.hp = 0
      dead.push({ id: m.id, name: m.name, job: m.job, level: m.level, cause: `陨落于${dungeonName}第 ${run.floor} 层` })
    }
  }
  return dead
}
