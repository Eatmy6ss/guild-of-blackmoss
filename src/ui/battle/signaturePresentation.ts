import { SIGNATURE_SKILLS } from '../../data/signature'
import type { BattleState, Combatant } from '../../sim/types'

/** 仅解析显示与目标，释放仍经过useSignature。 */
export function signaturePresentation(battle: BattleState, member: Combatant, casterId?: string, focusId?: string) {
  const skill = SIGNATURE_SKILLS[member.specId ?? '']
  if (!skill) return null
  const foes = battle.combatants.filter(c => c.team === 'enemy' && c.alive)
  const focused = foes.find(c => c.id === focusId), caster = foes.find(c => c.id === casterId)
  const lowest = foes.reduce<Combatant | undefined>((a, b) => !a || b.hp / b.maxHp < a.hp / a.maxHp ? b : a, undefined)
  const interrupt = skill.effect.startsWith('interrupt')
  const target = interrupt ? caster : skill.targeting === 'enemy' ? focused ?? caster ?? lowest : undefined
  const remaining = Math.max(0, (battle.signatureCd?.[member.memberId ?? ''] ?? 0) - battle.tick)
  const stacks = skill.effect === 'detonate-burn' ? target?.burnStacks ?? 0 : 0
  const queued = battle.commands.signature, ownQueued = !!queued && queued.memberId === member.memberId
  const unavailable = battle.status !== 'running' || !member.alive || remaining > 0 || !!queued ||
    (skill.targeting === 'enemy' && !target) || (skill.effect === 'detonate-burn' && stacks === 0)
  const state = battle.status !== 'running' ? '战斗已结束' : !member.alive ? '已倒下' : remaining > 0 ? `冷却 ${(remaining / 10).toFixed(1)}秒` :
    ownQueued ? '已下令 · 推进后释放' : queued ? '等待已下达的招牌技释放' :
    interrupt && !target ? '等待敌方读条' : skill.targeting === 'enemy' && !target ? '没有存活敌人' :
    skill.effect === 'detonate-burn' && stacks === 0 ? '先在目标身上叠灼烧' : '可施放'
  const queuedTarget = queued?.targetId ? battle.combatants.find(c => c.id === queued.targetId || c.memberId === queued.targetId) : undefined
  const targetText = ownQueued ? queuedTarget?.name ?? '自身 / 全体目标' :
    skill.targeting === 'ally' ? '点名一位队友治疗与净化' : target ? `${interrupt ? '打断' : '目标'}：${target.name}${stacks ? ` · 灼烧${stacks}层` : ''}` :
    interrupt ? '暂无可打断的读条' : skill.targeting === 'enemy' ? '暂无敌方目标' :
    skill.targeting === 'self' ? '自身 / 召唤物' : '按技能作用于全体目标'
  return { skill, target, targetText, remaining, stacks, state, unavailable, ownQueued }
}
