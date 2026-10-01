import { describe, expect, test } from 'vitest'
import { createBattle, executeSignature } from './combat'
import { runAutoAI } from './ai'
import { generateMember } from './gen'
import { BLACKMOSS } from '../data/dungeons'

function aiBattle(personality = { caution: 50, bravery: 50, greed: 50, loyalty: 50 }) {
  const members = [generateMember('guard', 5, 1), generateMember('mage', 5, 2)]
  members[0].spec = 'guard-ironwall'
  members[0].personality = personality as typeof members[0]['personality']
  members[1].spec = undefined as unknown as typeof members[1]['spec']
  members[1].personality = personality as typeof members[1]['personality']
  const state = createBattle(members, BLACKMOSS, 'enc-frogs', 4242)
  state.commands.autoMode = true
  const enemy = state.combatants.find((c) => c.team === 'enemy' && c.alive)!
  return { state, enemy }
}

describe('A7 挂机 AI 适配招牌技', () => {
  test('打断系:有人读条 AI 自动交招牌,断言 taken 被置阈值', () => {
    const { state, enemy } = aiBattle()
    enemy.bossMechanics = [{ id: 'tc', kind: 'cast-buff', name: '测试咏唱', params: { breakDamage: 100, castTicks: 50, everyTicks: 200, firstTick: 10 } }]
    enemy.mech = { 'cast-buff': { until: state.tick + 50, taken: 0 } }
    state.tick = ((state.tick / 5) | 0) * 5 + 5 // 落在 5tick 决策点
    const before = state.tick
    runAutoAI(state)
    expect(state.commands.signature).toBeTruthy() // AI 交了招牌指令
    executeSignature(state, state.commands.signature!) // stepBattle 消费(与真实管线一致)
    expect(enemy.mech!['cast-buff'].taken).toBe(100)
    expect(state.tick).toBeGreaterThanOrEqual(before)
  })

  test('引爆系:层数 <3 不交,≥3 自动引爆', () => {
    const { state, enemy } = aiBattle()
    state.tick = ((state.tick / 5) | 0) * 5 + 5
    enemy.burnStacks = 1
    runAutoAI(state)
    expect(state.commands.signature).toBeUndefined() // 层数不足,AI 不交引爆
    enemy.burnStacks = 4
    runAutoAI(state)
    expect(state.commands.signature?.skillId).toBe('sig-fire-detonate')
    executeSignature(state, state.commands.signature!)
    expect(enemy.burnStacks ?? 0).toBeLessThanOrEqual(1)
  })
})
