import { describe, expect, it } from 'vitest'
import { backTargetOf, type Screen } from './screens'

// R5.2b 验收(U33⑦):go/back 跳转表——每个 Screen 都有返回目标,back 逐级返回不存在死循环。
// 特例(map/battle/tower 自环)是设计形态:远征屏族的 Esc 由 App 层特判(撤退确认/无效),不走通用返回。

const ALL_SCREEN_VALUES: Screen[] = [
  'title', 'hall', 'roster', 'member', 'tavern', 'warehouse', 'base', 'kingdom',
  'chronicle', 'memorial', 'manual', 'expedition', 'statistics',
  'map', 'battle', 'result', 'tower',
  'smithy', 'infirmary', 'training', 'shrine',
]

describe('go/back 跳转表(R5.2b)', () => {
  it('每个 Screen 的返回目标都是合法 Screen', () => {
    for (const s of ALL_SCREEN_VALUES) {
      const t = backTargetOf(s)
      expect(ALL_SCREEN_VALUES, `${s} 的返回目标 ${t} 非法`).toContain(t)
    }
  })

  it('back 逐级返回必达固定点(hall/title),不存在死循环(远征屏族除外——Esc 特判)', () => {
    for (const s of ALL_SCREEN_VALUES) {
      if (s === 'map' || s === 'battle' || s === 'tower') continue // 自环=设计形态,见下一条
      let cur: Screen = s
      let steps = 0
      while (cur !== 'hall' && cur !== 'title' && steps <= 8) {
        cur = backTargetOf(cur)
        steps++
      }
      expect(['hall', 'title'], `${s} 经 ${steps} 步 back 未达固定点(停在 ${cur})`).toContain(cur)
      expect(steps).toBeLessThanOrEqual(4)
    }
  })

  it('跳转表:member→roster;statistics→chronicle;result→hall;功能坞屏→hall', () => {
    expect(backTargetOf('member')).toBe('roster')
    expect(backTargetOf('statistics')).toBe('chronicle')
    expect(backTargetOf('result')).toBe('hall')
    expect(backTargetOf('roster')).toBe('hall')
    expect(backTargetOf('chronicle')).toBe('hall')
    expect(backTargetOf('title')).toBe('title')
  })

  it('远征屏族自环是设计形态(map/battle/tower 的 Esc 由 App 特判)', () => {
    expect(backTargetOf('map')).toBe('map')
    expect(backTargetOf('battle')).toBe('battle')
    expect(backTargetOf('tower')).toBe('tower')
  })
})
