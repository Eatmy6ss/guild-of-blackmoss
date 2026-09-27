import type { BattleState, Combatant, MechanicKind } from './types'
import { MECHANIC_REGISTRY, mechanicIntents, type MechanicRuntime } from './mechanic-registry'

function runtime(self: Combatant, kind: MechanicKind): MechanicRuntime {
  self.mech ??= {}
  return self.mech[kind] ??= {}
}

/** Includes ordinary enemies with mechanisms; runtime shape and iteration order stay unchanged. */
export function processBossMechanics(state: BattleState): void {
  for (const self of state.combatants) {
    if (!self.alive || !self.bossMechanics) continue
    for (const def of self.bossMechanics) {
      MECHANIC_REGISTRY[def.kind].step({
        state, self, def, rt: runtime(self, def.kind),
        sibling: (kind) => runtime(self, kind),
      })
    }
  }
}

/** UI and AI consume the same intent declarations. */
export function bossIntents(state: BattleState): { telegraphing: boolean; casting: boolean; casterId?: string } {
  let telegraphing = false
  let casterId: string | undefined
  for (const self of state.combatants) {
    for (const intent of mechanicIntents(state, self)) {
      if (intent.type === 'telegraph') telegraphing = true
      if (casterId === undefined && intent.type === 'cast' && intent.interruptible) casterId = self.id
    }
  }
  return { telegraphing, casting: casterId !== undefined, casterId }
}
