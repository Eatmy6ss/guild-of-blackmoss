import type { BattleState, Combatant } from '../../sim/types'
import { MECHANIC_REGISTRY, optionalMechanicParam } from '../../sim/mechanic-registry'

/** 表现只读模拟中的窗口；刷新、暂停和倍速都使用同一战斗时钟。 */
export function mechanicWindows(battle: BattleState, unit: Combatant) {
  if (!unit.alive || battle.status !== 'running') return []
  return (unit.bossMechanics ?? []).flatMap(def => {
    const rt = unit.mech?.[def.kind]
    if (!rt || rt.until === undefined) return []
    const spec = MECHANIC_REGISTRY[def.kind]
    const intent = spec.intent({ tick: battle.tick, self: unit, def, rt })
    if (intent.type !== 'cast' && intent.type !== 'telegraph') return []
    const total = optionalMechanicParam(def, 'castTicks') ?? optionalMechanicParam(def, 'telegraphTicks') ?? 1
    const remaining = Math.max(0, rt.until - battle.tick)
    const interruptible = intent.type === 'cast' && intent.interruptible
    return [{ kind: def.kind, name: def.name, counter: spec.counter, remaining, total,
      progress: Math.max(0, Math.min(1, 1 - remaining / total)),
      dangerCircle: intent.type === 'telegraph' || def.kind === 'breath-charge', interruptible,
      breakDamage: interruptible ? intent.breakDamage : undefined, taken: interruptible ? intent.taken : undefined }]
  }).sort((a, b) => a.remaining - b.remaining)
}

export function combatantBadges(unit: Combatant, tick: number): string[] {
  if (!unit.alive) return []
  const badges: string[] = []
  if ((unit.absorbShield ?? 0) > 0) badges.push(`护盾 ${Math.ceil(unit.absorbShield!)}`)
  if ((unit.burnStacks ?? 0) > 0) badges.push(`灼烧 ${unit.burnStacks}层`)
  else if ((unit.burnUntilTick ?? 0) > tick) badges.push('灼烧')
  if ((unit.boundUntilTick ?? 0) > tick) badges.push('束缚')
  if ((unit.vulnUntilTick ?? 0) > tick) badges.push(`易伤 +${Math.round(((unit.vulnMult ?? 1) - 1) * 100)}%`)
  if ((unit.slowUntilTick ?? 0) > tick) badges.push('减速')
  if ((unit.fearUntilTick ?? 0) > tick) badges.push('龙威')
  if ((unit.invulnUntilTick ?? 0) > tick) badges.push('无敌')
  return badges
}
