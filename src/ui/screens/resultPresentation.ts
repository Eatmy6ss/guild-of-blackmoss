import { bondStars } from '../../sim/gen'
import type { Member } from '../../sim/types'
import type { DungeonRun } from '../../sim/run'
import type { RunUIState } from '../../sim/run-state'
import type { FactLedger } from '../../sim/fact-ledger'

export type GrowthSnapshot = RunUIState['growthSnapshot'][string]

/** 只读本趟水位；旧档没有水位时不把历史首杀/心愿冒充本趟成果。 */
export function resultFacts(run: Pick<DungeonRun, 'dungeonId'>, ledger: FactLedger) {
  if (ledger.expeditionStart === undefined) return []
  return ledger.facts.filter(f => f.id >= ledger.expeditionStart! && (!f.refs.dungeonId || f.refs.dungeonId === run.dungeonId))
}

export function resultBonds(member: Member, survivors: Member[], before?: GrowthSnapshot): string[] {
  if (!member.alive) return []
  return survivors.filter(m => m.id !== member.id).flatMap(m => {
    const stars = bondStars(member.bonds[m.id] ?? 0)
    if (!stars) return []
    const previous = before ? bondStars(before.bonds[m.id] ?? 0) : undefined
    return [`与${m.name}默契 ${previous !== undefined && previous !== stars ? previous + ' → ' : ''}${stars} 星`]
  })
}
