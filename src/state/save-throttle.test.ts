import { describe, expect, test } from 'vitest'
import { combatSaveDue, COMBAT_SAVE_INTERVAL_MS } from './save'

// A13 回归:战斗中的存档频率决策(审计 #9——每 tick 写一次的旧行为由此收紧)
describe('A13 存档节流', () => {
  test('战斗中:节流窗内不写,到窗即写', () => {
    const t0 = 1_000_000
    expect(combatSaveDue(t0 + COMBAT_SAVE_INTERVAL_MS - 1, t0)).toBe(false)
    expect(combatSaveDue(t0 + COMBAT_SAVE_INTERVAL_MS, t0)).toBe(true)
    expect(combatSaveDue(t0 + COMBAT_SAVE_INTERVAL_MS * 3 + 1, t0)).toBe(true)
  })

  test('首写(无上次时间)立即写;钟倒退不误判', () => {
    expect(combatSaveDue(5_000, 0)).toBe(true)
    expect(combatSaveDue(1_000, 5_000)).toBe(false)
  })
})
