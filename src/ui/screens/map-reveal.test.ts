import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MapScreen } from './MapScreen'
import { createRun } from '../../sim/run'
import { generateMember } from '../../sim/gen'
import { BLACKMOSS } from '../../data/dungeons'

describe('R1.3 组件级揭示验收(e2e M2 的姊妹断言)', () => {
  it('mastery 0 时未走节点的图标必须全是 ❓(图标即情报,不许泄露)', () => {
    const members = (['guard', 'priest', 'ranger'] as const).map((j, i) => generateMember(j, 5, 77 + i))
    const run = createRun(members, BLACKMOSS, 53)
    const html = renderToStaticMarkup(createElement(MapScreen, { run, mastery: 0, drops: [], onChoose: () => {}, onRetreat: () => {} }))
    const icons = [...html.matchAll(/dg-icon[^>]*>([^<]*)</g)].map((m) => m[1]!)
    console.log('ICONS:', JSON.stringify(icons))
    expect(icons.length).toBeGreaterThan(8)
    expect(icons.every((ic) => ic === '❓')).toBe(true)
  })
  it('mastery 80(档 3)时类型图标全亮,暗道可见', () => {
    const members = (['guard', 'priest', 'ranger'] as const).map((j, i) => generateMember(j, 5, 77 + i))
    const run = createRun(members, BLACKMOSS, 53)
    const html = renderToStaticMarkup(createElement(MapScreen, { run, mastery: 80, drops: [], onChoose: () => {}, onRetreat: () => {} }))
    const icons = [...html.matchAll(/dg-icon[^>]*>([^<]*)</g)].map((m) => m[1]!)
    expect(icons.some((ic) => ic === '🕳'), '80 档应看见暗道').toBe(true)
    expect(icons.some((ic) => ic === '👑'), '80 档应看见 Boss').toBe(true)
    // 注意:事件节点的真图标就是 ❓,不能按「无问号」断言
  })
})
