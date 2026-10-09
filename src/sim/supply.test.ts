import { describe, expect, it } from 'vitest'
import { rationCost, maintenanceCost, RATION_PER_HEAD_PER_LAYER } from './supply'
import { BLACKMOSS } from '../data/dungeons'
import { plannedLayers } from './dungeon-map'

// #4.2 出征补给成本(IMPLEMENTATION-PLAN §7):口粮=人数×预计行程层;维护=场数×幸存者,铁匠铺减免。

describe('#4.2 出征补给', () => {
  it('rationCost:人数×层数×单价;零人/零层为 0', () => {
    expect(rationCost(3, plannedLayers(BLACKMOSS))).toBe(3 * plannedLayers(BLACKMOSS) * RATION_PER_HEAD_PER_LAYER)
    expect(rationCost(0, 6)).toBe(0)
    expect(rationCost(3, 0)).toBe(0)
  })

  it('plannedLayers:与 generateMap 层数规则同源(#7.2 加长后 3 人本 8 层/5 人本 10 层)', () => {
    expect(plannedLayers(BLACKMOSS)).toBe(8)
  })

  it('maintenanceCost:场数×幸存者×单价,铁匠铺每级 −15%;团灭(0 幸存)为 0', () => {
    expect(maintenanceCost(7, 3, 0)).toBe(42)
    expect(maintenanceCost(7, 3, 1)).toBe(36) // 42×0.85=35.7→36
    expect(maintenanceCost(7, 3, 3)).toBe(23) // 42×0.55=23.1→23
    expect(maintenanceCost(7, 0, 0)).toBe(0)
    expect(maintenanceCost(0, 3, 0)).toBe(0)
  })
})
