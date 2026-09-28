import { expect, test } from 'vitest'
import { BLACKMOSS } from '../data/dungeons'
import { createBattle, stepBattle } from './combat'
import { generateMember } from './gen'

// Exercise real TypeScript module loading (including combat/AI/registry cycles) in Node.
// This is an integration check, not a win-rate or balance target.
test('真实遭遇可在无浏览器环境完成，结束后不再推进且不修改出征成员', () => {
  const members = (['guard', 'priest', 'ranger'] as const)
    .map((job, index) => generateMember(job, 5, 270927 + index))
  const before = structuredClone(members)
  const battle = createBattle(members, BLACKMOSS, BLACKMOSS.encounters[0].id, 270927)

  for (let step = 0; step < 2000 && battle.status === 'running'; step++) stepBattle(battle)

  expect(battle.status).not.toBe('running')
  expect(battle.events.some(event => event.type === 'damage')).toBe(true)
  expect(battle.combatants.every(unit => Number.isFinite(unit.hp))).toBe(true)
  expect(members).toEqual(before)

  const finished = structuredClone(battle)
  stepBattle(battle)
  expect(battle).toEqual(finished)
})
