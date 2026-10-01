import { DUNGEONS } from '../data/dungeons'
import type { Member } from './types'
import type { ItemUid } from '../state/item-registry'
import { createStatefulRng, type Rng } from './rng'

/** 两种现有远征的持久数据；运行时的成员/地图/随机函数不放进对象。 */
export interface RunCore {
  schema: 1
  id: string
  seed: number
  rngState: number
  memberIds: string[]
  party: { memberId: string; hp: number }[]
  pendingLoot: { items: string[]; gold: number; starMarrow: number; exp: number }
  affixes: string[]
  clauses: string[]
  /** U22 预留:营地换装全队共享备用格(批次 3 消费);可选字段,旧档缺省兼容 */
  spares?: ItemUid[]
  /** U22 预留:已 roll 怪物词缀(按路线节点/塔层记录,进节点时确定供侦查揭示);批次 3 消费 */
  monsterAffixes?: Record<string, string[]>
}

export function createRunCore(members: Member[], seed: number): RunCore {
  return { schema: 1, id: crypto.randomUUID(), seed, rngState: seed >>> 0,
    memberIds: members.map(m => m.id), party: members.map(m => ({ memberId: m.id, hp: m.hp })),
    pendingLoot: { items: [], gold: 0, starMarrow: 0, exp: 0 }, affixes: [], clauses: [] }
}

export function runMembers(run: Pick<RunCore, 'memberIds'>, roster: Member[]): Member[] {
  return run.memberIds.map(id => {
    const member = roster.find(m => m.id === id)
    if (!member) throw new Error('远征队员已不在花名册：' + id)
    return member
  })
}

export function runDungeon(run: { dungeonId: string }) {
  const dungeon = DUNGEONS.find(d => d.id === run.dungeonId)
  if (!dungeon) throw new Error('未知副本：' + run.dungeonId)
  return dungeon
}

/** 每次抽样推进原数据中的位置；函数本身不进入存档。 */
export function runRng(run: Pick<RunCore, 'rngState'>): Rng {
  return () => {
    const rng = createStatefulRng(run.rngState), value = rng()
    run.rngState = rng.state()
    return value
  }
}

export function syncRunParty(run: RunCore, roster: Member[]): void {
  run.party = runMembers(run, roster).map(m => ({ memberId: m.id, hp: m.hp }))
}

/** 按需解析的视图，不是另一种远征对象或持久仓库。 */
export function resolveRun<T extends RunCore>(run: T, roster: Member[]) {
  return { members: runMembers(run, roster), dungeon: 'dungeonId' in run ? runDungeon(run as T & { dungeonId: string }) : undefined }
}
