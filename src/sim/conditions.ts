// 路况状态机(U27②,redesign R1.2):纯函数,状态挂在 DungeonRun.conditions(id 集合,不叠层只刷新)。
// 触发率 = chance × 熟练度修正(0-34 档 ×1 / 60-79 档 ×0.75 / 80+ 档 ×0.5;R1.3 定档)。
// R5/U33①:危险地形在掷路况的同时当场给回报(terrainEntryReward),中性地形无回报。

import type { DungeonRun } from './run'
import type { MapNode } from './dungeon-map'
import type { Member, ItemInstance } from './types'
import { runRng } from './run-core'
import { CONDITION_BY_ID, type RouteCondition } from '../data/conditions'
import { terrainRewardOf } from '../data/terrain-rewards'
import { maxHpOf } from './gen'
import { rollWaveDrop } from './loot'
import { nodeById } from './dungeon-map'

/** 熟练度 → 触发率修正(与 R1.3 的四档表对齐;中两档 35-59 仍 ×1) */
export function conditionChanceMod(mastery: number): number {
  if (mastery >= 80) return 0.5
  if (mastery >= 60) return 0.75
  return 1
}

export function activeConditions(run: Pick<DungeonRun, 'conditions'>): RouteCondition[] {
  return (run.conditions ?? []).map((id) => CONDITION_BY_ID[id]).filter(Boolean)
}

export function hasCondition(run: Pick<DungeonRun, 'conditions'>, id: string): boolean {
  return (run.conditions ?? []).includes(id)
}

function addCondition(run: DungeonRun, id: string): boolean {
  // 同一状态不叠层,再次触发只刷新(集合语义)
  if (hasCondition(run, id)) return false
  run.conditions = [...(run.conditions ?? []), id]
  return true
}

function removeCondition(run: DungeonRun, id: string): void {
  run.conditions = (run.conditions ?? []).filter((c) => c !== id)
}

/** 精英权重(惊动):后续层生成/翻新时消费 */
export function eliteWeightMult(run: Pick<DungeonRun, 'conditions'>): number {
  let mult = 1
  for (const c of activeConditions(run)) mult *= c.map?.eliteWeight ?? 1
  return mult
}

/** 休整节点回复倍率(疲惫) */
export function restHealMult(run: Pick<DungeonRun, 'conditions'>): number {
  let mult = 1
  for (const c of activeConditions(run)) mult *= c.map?.restHeal ?? 1
  return mult
}

/** 迷雾揭示降级层数(迷途) */
export function revealPenaltyLayers(run: Pick<DungeonRun, 'conditions'>): number {
  let n = 0
  for (const c of activeConditions(run)) n += c.map?.revealPenalty ?? 0
  return n
}

/** 战斗乘区:我方 mods(与事件 runBuff 同通道,含火抗加算)+ 敌方 enemyMods(暴露攻击/阴寒减速) */
export function conditionBattleMods(run: Pick<DungeonRun, 'conditions'>): {
  mods: { atk?: number; def?: number; hp?: number; heal?: number; fireRes?: number }
  enemyMods: { atk?: number; spd?: number }
} {
  const mods: { atk?: number; def?: number; hp?: number; heal?: number; fireRes?: number } = {}
  const enemyMods: { atk?: number; spd?: number } = {}
  for (const c of activeConditions(run)) {
    if (c.battle) {
      for (const [k, v] of Object.entries(c.battle)) {
        if (k === 'enemy') {
          for (const [ek, ev] of Object.entries(c.battle.enemy ?? {})) {
            const key = ek as 'atk'
            enemyMods[key] = (enemyMods[key] ?? 1) * (ev as number)
          }
          continue
        }
        const key = k as 'atk' | 'def' | 'hp' | 'heal'
        mods[key] = (mods[key] ?? 1) * (v as number)
      }
    }
    // R5/U33① 好处面:火抗加算/敌方减速
    if (c.upside?.fireRes) mods.fireRes = (mods.fireRes ?? 0) + c.upside.fireRes
    if (c.upside?.enemySlow) enemyMods.spd = (enemyMods.spd ?? 1) * c.upside.enemySlow
  }
  return { mods, enemyMods }
}

/** 本趟经验倍率(疲惫 upside,R5.1b) */
export function conditionExpMult(run: Pick<DungeonRun, 'conditions'>): number {
  let mult = 1
  for (const c of activeConditions(run)) mult *= c.upside?.expMult ?? 1
  return mult
}

/** 掉落率倍率(暴露 upside,R5.1b) */
export function conditionDropMult(run: Pick<DungeonRun, 'conditions'>): number {
  let mult = 1
  for (const c of activeConditions(run)) mult *= c.upside?.dropMult ?? 1
  return mult
}

/** 按时消退(R5.1b/U33⑧②):'next-battle'=打完一场;'next-layer'=走过一层。
 *  返回被消退的状态名(调用方写「××消退」可见提示)。 */
export function expireConditions(run: DungeonRun, ev: 'next-battle' | 'next-layer'): string[] {
  const removed: string[] = []
  for (const c of activeConditions(run)) {
    if (c.expires === ev) {
      removeCondition(run, c.id)
      removed.push(c.name)
    }
  }
  return removed
}

/** 走上节点(R1.2):先按地形解除,再掷地形触发器与连战计数。返回本次新挂上的状态名(供界面提示)。
 *  R5/U33⑧:Boss 节点不掷路况(只保留解除);R5.1b:挂上湿透的当刻扣药(只扣一次,由触发分支内联)。 */
export function enterNodeConditions(run: DungeonRun, node: MapNode, mastery: number): string[] {
  const gained: string[] = []
  // 1) 解除:走到 clearedBy 地形
  for (const c of activeConditions(run)) {
    if (c.clearedBy?.includes(node.terrain)) removeCondition(run, c.id)
  }
  if (node.kind === 'boss') return gained // U33⑧:Boss 节点不掷路况
  // 2) 地形触发器
  const mod = conditionChanceMod(mastery)
  for (const c of Object.values(CONDITION_BY_ID)) {
    if (c.trigger !== 'terrain' || !c.from?.includes(node.terrain)) continue
    if (runRng(run)() < c.chance * mod) {
      if (addCondition(run, c.id)) {
        gained.push(c.name)
        // 挂上当刻的立即生效效果(湿透泡坏药水):只扣一次(U33⑧ bug①)
        const loss = c.map?.potionLoss ?? 0
        if (loss > 0 && run.potions.heal > 0) {
          run.potions = { ...run.potions, heal: Math.max(0, run.potions.heal - loss) }
        }
      }
    }
  }
  // 3) 连战计数(疲惫):路径尾部连续战斗节点数
  for (const c of Object.values(CONDITION_BY_ID)) {
    if (c.trigger !== 'battle-streak') continue
    const need = c.streak ?? 2
    let streak = 0
    for (let i = run.path.length - 1; i >= 0; i--) {
      const n = nodeById(run.map, run.path[i] ?? '')
      if (n && (n.kind === 'battle' || n.kind === 'elite')) streak++
      else break
    }
    if (streak >= need) {
      if (addCondition(run, c.id)) gained.push(c.name)
    }
  }
  return gained
}

/** 走上节点的地形回报(R5/U33①):危险地形当场给好处;中性地形无回报。
 *  治疗直接写 roster(与 retreatRun 同模式);祝福/物品由调用方入账(App 层持有公会状态)。
 *  水域的非战斗节点 25% 捞装备;战斗节点的掉落/熟练度倍率由 settlement 按 terrainRewardOf 消费。 */
export interface TerrainEntryResult {
  blessing: number
  healedNames: string[]
  item: ItemInstance | null
  notes: string[]
}

export function terrainEntryReward(
  run: DungeonRun,
  node: MapNode,
  roster: Member[],
  itemId?: () => string,
  rng?: () => number,
): TerrainEntryResult {
  const out: TerrainEntryResult = { blessing: 0, healedNames: [], item: null, notes: [] }
  const reward = terrainRewardOf(node.terrain)
  if (!reward) return out
  const rand = rng ?? runRng(run)
  if (reward.blessing) {
    out.blessing = reward.blessing
    out.notes.push(`英灵祝福 +${reward.blessing}(祭奠亡者)`)
  }
  if (reward.healPct) {
    for (const m of roster) {
      if (!m.alive) continue
      const max = maxHpOf(m)
      const before = m.hp
      m.hp = Math.min(max, m.hp + Math.round(max * reward.healPct))
      if (m.hp > before) out.healedNames.push(`${m.name} +${m.hp - before}`)
    }
    out.notes.push(`全体回复 ${Math.round(reward.healPct * 100)}% 生命${out.healedNames.length ? '(' + out.healedNames.join('、') + ')' : '(无人需要回复)'}`)
  }
  if (reward.lootChance && node.kind !== 'battle' && node.kind !== 'elite' && node.kind !== 'boss') {
    if (rand() < reward.lootChance) {
      out.item = rollWaveDrop(run.dungeonId, rand, false, 0, itemId)
      if (out.item) out.notes.push('水里捞到 1 件装备')
    }
  }
  return out
}

/** 精英战打完(惊动):挂状态 + 后续层精英权重翻倍的确定性落实(把未来层的战斗节点翻成精英)。
 *  写时克隆地图:settlement 对 run 是浅拷贝(common.map 与输入共享),原地改会穿透输入方(run-recovery 抓过)。 */
export function triggerAfterElite(run: DungeonRun): string | null {
  const cond = Object.values(CONDITION_BY_ID).find((c) => c.trigger === 'after-elite')
  if (!cond) return null
  const currentLayer = nodeById(run.map, run.nodeId)?.layer ?? 0
  const weight = cond.map?.eliteWeight ?? 2
  let flipped = 0
  let map = run.map
  for (const layer of map.layers) {
    for (const n of layer) {
      if (n.layer <= currentLayer) continue
      if (n.kind !== 'battle' || !n.encounterId) continue
      if (flipped === 0) {
        // 首次需要翻节点时才克隆(输入不变契约)
        map = { ...run.map, layers: run.map.layers.map((l) => l.map((x) => ({ ...x }))) }
      }
      const target = map.layers[n.layer]!.find((x) => x.id === n.id)!
      if (runRng(run)() < 1 / weight) {
        target.kind = 'elite'
        flipped++
      }
    }
  }
  if (flipped > 0) run.map = map
  return addCondition(run, cond.id) || flipped > 0 ? cond.name : null
}
