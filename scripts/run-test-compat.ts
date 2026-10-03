/** 历史数值测试的临时解析视图。只委托生产函数，不实现另一份远征或结算。 */
import * as dungeon from '../src/sim/run'
import * as tower from '../src/sim/tower'
import { runDungeon, runMembers, runRng } from '../src/sim/run-core'
import type { Member, DungeonDef } from '../src/sim/types'
import type { Rng } from '../src/sim/rng'
import { DUNGEONS } from '../src/data/dungeons'

type ExistingRun = dungeon.DungeonRun | tower.TowerRun
type View<T> = T & { members: Member[]; dungeon: DungeonDef; rng: Rng }
const rosters = new WeakMap<ExistingRun, Member[]>()
const definitions = new WeakMap<ExistingRun, DungeonDef>()
function withDefinition<T>(def: DungeonDef | undefined, execute: () => T): T {
  if (!def) return execute()
  const index = DUNGEONS.findIndex(d => d.id === def.id), original = DUNGEONS[index]
  if (index < 0) throw new Error('测试副本 ID 未登记')
  DUNGEONS[index] = def
  try { return execute() } finally { DUNGEONS[index] = original }
}
function view<T extends ExistingRun>(run: T, roster: Member[]): View<T> {
  rosters.set(run, roster)
  let rngOverride: Rng | undefined
  Object.defineProperties(run, {
    members: { get: () => runMembers(run, roster) },
    dungeon: { get: () => run.kind === 'dungeon' ? definitions.get(run) ?? runDungeon(run) : undefined },
    rng: { get: () => rngOverride ?? runRng(run), set: (v: Rng) => { rngOverride = v } },
  })
  return run as View<T>
}
function roster(run: ExistingRun, explicit?: Member[]): Member[] {
  const members = explicit ?? rosters.get(run) ?? (run as Partial<View<ExistingRun>>).members
  if (!members) throw new Error('历史测试缺少解析名册，请显式传入')
  return members
}
export const createRun = (...args: Parameters<typeof dungeon.createRun>) => {
  const run = withDefinition(args[1], () => dungeon.createRun(...args))
  definitions.set(run, args[1])
  return view(run, args[0])
}
export const startTower = (...args: Parameters<typeof tower.startTower>) => view(tower.startTower(...args), args[0])
export const startStep = (run: dungeon.DungeonRun, seed: number, bonus = 0, members?: Member[]) => withDefinition(definitions.get(run), () => dungeon.startStep(run, seed, bonus, roster(run, members)))
/** R1.1:createRun 不再自动开战——沿地图前进直到开出第一场战斗(测试/门禁通用前处理)。 */
export const beginBattle = (run: dungeon.DungeonRun, seed: number, bonus = 0, members?: Member[]) => {
  for (let depth = 0; depth < 16; depth++) {
    const opts = dungeon.mapOptions(run)
    if (opts.length === 0) { startStep(run, seed, bonus, members); return run } // Boss 节点连战
    const node = opts.find(n => n.kind === 'battle' || n.kind === 'elite') ?? opts.find(n => n.kind === 'boss')
    if (!node) { dungeon.moveTo(run, opts[0]!.id); continue } // 非战斗层,继续走
    dungeon.moveTo(run, node.id)
    startStep(run, seed, bonus, members)
    return run
  }
  throw new Error('beginBattle:16 步内找不到战斗节点')
}
export const advanceRun = (run: dungeon.DungeonRun, members?: Member[]) => dungeon.advanceRun(run, roster(run, members))
export const retreatRun = (run: dungeon.DungeonRun, members?: Member[]) => dungeon.retreatRun(run, roster(run, members))
export const startTowerFloor = (run: tower.TowerRun, seed: number, members?: Member[]) => tower.startTowerFloor(run, seed, roster(run, members))
export const towerNext = (run: tower.TowerRun, seed: number, members?: Member[]) => tower.towerNext(run, seed, roster(run, members))
export const towerRest = (run: tower.TowerRun, pct?: number, members?: Member[]) => tower.towerRest(run, pct, roster(run, members))
export const settleTowerFloor = (run: tower.TowerRun, rng?: Rng, id?: () => string, members?: Member[]) => tower.settleTowerFloor(run, rng, id, roster(run, members))
export const towerMarkPermadeath = (run: tower.TowerRun, place: string, members?: Member[]) => tower.towerMarkPermadeath(run, place, roster(run, members))
