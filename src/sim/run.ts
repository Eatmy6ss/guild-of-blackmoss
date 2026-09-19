import type { BattleState, DeadHero, DungeonDef, Member } from './types'
import { createBattle, toCombatant } from './combat'

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
}

/** 岔路映射：险路打满全部遭遇（更多战斗=更多收获机会）；稳路跳过最后一段杂兵 */
function routeSteps(dungeon: DungeonDef, branchId: string): string[] {
  const all = dungeon.encounters.map((e) => e.id)
  const branch = dungeon.branches.find((b) => b.id === branchId)
  if (!branch || branch.risk >= 2) return all
  const waves = dungeon.encounters.filter((e) => e.kind === 'wave')
  const dropped = waves[waves.length - 1]
  return dropped ? all.filter((id) => id !== dropped.id) : all
}

export function createRun(
  members: Member[],
  dungeon: DungeonDef,
  branchId: string,
  seed: number,
  auraBonus = 0,
  protectOn = true,
): DungeonRun {
  const run: DungeonRun = {
    dungeon,
    steps: routeSteps(dungeon, branchId),
    stepIdx: 0,
    phase: 'battle',
    battle: null,
    members: members.filter((m) => m.alive).slice(0, 3),
    auraBonus,
    protectOn,
  }
  startStep(run, seed)
  return run
}

export function startStep(run: DungeonRun, seed: number, manualBonus = 0): void {
  run.battle = createBattle(
    run.members.filter((m) => m.alive),
    run.dungeon,
    run.steps[run.stepIdx],
    seed,
    run.auraBonus,
    manualBonus,
    run.protectOn,
  )
  run.phase = 'battle'
}

/** 战斗结算：血量写回成员（倒地记 0，永久死亡由 markPermadeath 登记） */
export function advanceRun(run: DungeonRun): void {
  const b = run.battle
  if (!b || b.status === 'running') return
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
