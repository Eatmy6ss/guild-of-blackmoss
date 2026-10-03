import { describe, it, expect } from 'vitest'
import { nextBattleSpeed, speedIntervalMs, parseBattleSpeed } from './speed'

// R1.5 节奏:倍速 1/2/3 循环(U27⑩;单场时长数值不动,C4)

describe('R1.5 战斗倍速', () => {
  it('按钮循环 1→2→3→1', () => {
    expect(nextBattleSpeed(1)).toBe(2)
    expect(nextBattleSpeed(2)).toBe(3)
    expect(nextBattleSpeed(3)).toBe(1)
  })
  it('间隔 = TICK_MS / 倍速', () => {
    expect(speedIntervalMs(1, 100)).toBe(100)
    expect(speedIntervalMs(2, 100)).toBe(50)
    expect(speedIntervalMs(3, 100)).toBeCloseTo(33.333, 3)
  })
  it('持久化解析:未知值回落 1×', () => {
    expect(parseBattleSpeed('2')).toBe(2)
    expect(parseBattleSpeed('3')).toBe(3)
    expect(parseBattleSpeed('1')).toBe(1)
    expect(parseBattleSpeed(null)).toBe(1)
    expect(parseBattleSpeed('4')).toBe(1)
  })
})
