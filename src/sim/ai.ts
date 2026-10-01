import type { BattleState, Combatant } from './types'
import { mechanicIntents } from './mechanic-registry'
import { orderRetreat, pushLog, setFocus, setStance, useFuryPotion, useHealPotion, useSignature } from './combat'
import { SIGNATURE_SKILLS } from '../data/signature'

// 挂机 AI（D12）：队长性格代打。与手动指挥台共用同一套指令函数（Q27 红利），
// 只是执行者从玩家换成队长性格。每 5 tick 决策一次（0.5 秒节奏）。
//
// 性格 → 打法映射：
//   谨慎：AOE 蓄力切分散、队友危险切收缩、低血交治疗药、劣势下撤退令
//   勇猛：平时推进、狂暴时爆发药对拼、不轻易撤退
//   贪婪：优先击杀增援（掉落载体）
//   忠诚/其他：基础集火与保护行为

function aliveOf(state: BattleState, team: 'guild' | 'enemy'): Combatant[] {
  return state.combatants.filter((c) => c.alive && c.team === team)
}

export function runAutoAI(state: BattleState): void {
  if (!state.commands.autoMode || state.status !== 'running') return
  if (state.tick % 5 !== 0) return

  const captain = aliveOf(state, 'guild')[0]
  if (!captain || !captain.personality) return
  const p = captain.personality

  const foes = aliveOf(state, 'enemy')
  const allies = aliveOf(state, 'guild')
  if (foes.length === 0 || allies.length === 0) return

  const boss = foes.find((f) => f.boss)
  const adds = foes.filter((f) => !f.boss)
  const intentions = foes.map(foe => ({ foe, intents: mechanicIntents(state, foe) }))
  const telegraphing = intentions.some(({ intents }) => intents.some(it => it.type === 'telegraph'))
  const caster = intentions.find(({ intents }) => intents.some(it => it.type === 'cast' && it.interruptible))?.foe
  const casting = !!caster
  const enraged = boss?.mech?.['enrage']?.fired === 1

  const lowest = allies.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b))
  const lowestPct = lowest.hp / lowest.maxHp

  // ---- 阵型 ----
  if (telegraphing) {
    setStance(state, p.caution >= 50 ? 'spread' : 'standard')
  } else if (lowestPct < 0.4 && p.caution >= 55) {
    setStance(state, 'tighten')
  } else if (p.bravery >= 70 || (enraged && p.bravery >= 40)) {
    setStance(state, 'advance')
  } else if (p.caution >= 65) {
    setStance(state, 'tighten')
  } else {
    setStance(state, 'standard')
  }

  // ---- 集火 ----
  if (caster && p.caution >= 45) {
    setFocus(state, caster.id) // 打断咏唱
  } else if (adds.length > 0) {
    const weakest = adds.reduce((a, b) => (a.hp <= b.hp ? a : b))
    setFocus(state, weakest.id) // 增援是掉落载体，优先清理
  } else if (!casting) {
    setFocus(state, undefined) // 回落自动索敌
  }

  // ---- 道具 ----
  const healThreshold = (p.caution / 100) * 0.6 // 谨慎的队长更早交药
  if (lowestPct < healThreshold) useHealPotion(state)
  if (enraged && p.bravery >= 40) useFuryPotion(state)

  // ---- 招牌技能(A7/#1.5):全员共用同一决策系统——AI 只调 useSignature,与手动同构 ----
  // 时机纪律:打断系=有人读条就交( 与"集火打断"同窗口);引爆系=攒到 3 层以上才放(攒还是放);
  // 圣疗=点名最残队友;其余输出技=对当前集火目标释放。
  for (const ally of allies) {
    if (!ally.memberId || !ally.specId) continue
    const skill = SIGNATURE_SKILLS[ally.specId]
    if (!skill) continue
    const cd = state.signatureCd?.[ally.memberId] ?? 0
    if (state.tick < cd) continue
    if (skill.effect.startsWith('interrupt')) {
      if (casting) useSignature(state, ally.memberId, caster!.id)
    } else if (skill.effect === 'detonate-burn') {
      const stacks = caster?.burnStacks ?? foes.reduce((a, f) => Math.max(a, f.burnStacks ?? 0), 0)
      const best = foes.find((f) => (f.burnStacks ?? 0) === stacks && (f.burnStacks ?? 0) > 0)
      if (stacks >= 3 && best) useSignature(state, ally.memberId, best.id)
    } else if (skill.effect === 'heal-target-cleanse') {
      if (lowestPct < 0.5) useSignature(state, ally.memberId, lowest.memberId)
    } else if (skill.targeting === 'enemy') {
      const target = state.commands.focusId ? foes.find((f) => f.id === state.commands.focusId) ?? caster ?? foes[0] : caster ?? foes[0]
      if (target) useSignature(state, ally.memberId, target.id)
    } else {
      useSignature(state, ally.memberId)
    }
  }

  // ---- 撤退（仅保护关闭时由性格决定；保护开启时系统兜底）----
  // 谨慎的队长：队友阵亡即撤（不喂更多人头），或有人濒危
  const someoneDead = state.combatants.some((c) => c.team === 'guild' && !c.alive)
  if (
    !state.commands.protectRetreat &&
    p.caution >= 65 &&
    (someoneDead || lowestPct < 0.25)
  ) {
    orderRetreat(state)
    pushLog(state, 'guild', `${captain.name}：「兄弟们，撤——这不是送死的地方！」`)
  }
}
