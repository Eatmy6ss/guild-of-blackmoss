import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MapScreen } from './MapScreen'
import { createRun } from '../../sim/run'
import { generateMember } from '../../sim/gen'
import { BLACKMOSS } from '../../data/dungeons'

describe('R1.3 组件级揭示验收(e2e M2 的姊妹断言)', () => {
  it('mastery 0 时整节点全盲(制作人 2026-10-04 定稿):图标全 ❓,名字全是「未知岔路」,地形不显示', () => {
    const members = (['guard', 'priest', 'ranger'] as const).map((j, i) => generateMember(j, 5, 77 + i))
    const run = createRun(members, BLACKMOSS, 53)
    const html = renderToStaticMarkup(createElement(MapScreen, { run, mastery: 0, drops: [], onChoose: () => {}, onRetreat: () => {} }))
    const icons = [...html.matchAll(/dg-icon[^>]*>([^<]*)</g)].map((m) => m[1]!)
    const names = [...html.matchAll(/dg-name[^>]*>([^<]*)</g)].map((m) => m[1]!)
    expect(icons.length).toBeGreaterThan(8)
    expect(icons.every((ic) => ic === '❓')).toBe(true)
    expect(names.every((nm) => nm === '未知岔路')).toBe(true)
    expect(html).not.toContain('水域')
    expect(html).not.toContain('林野')
  })
  it('mastery 35(档 1)起显示路名与地形;类型仍盲', () => {
    const members = (['guard', 'priest', 'ranger'] as const).map((j, i) => generateMember(j, 5, 77 + i))
    const run = createRun(members, BLACKMOSS, 53)
    const html = renderToStaticMarkup(createElement(MapScreen, { run, mastery: 35, drops: [], onChoose: () => {}, onRetreat: () => {} }))
    const names = [...html.matchAll(/dg-name[^>]*>([^<]*)</g)].map((m) => m[1]!)
    expect(names.some((nm) => nm !== '未知岔路'), '档 1 应见真路名').toBe(true)
    const nodes = [...html.matchAll(/class="dg-node([^"]*)"[\s\S]*?dg-icon[^>]*>([^<]*)</g)]
    // 档 1 口径(R1.3 表):相邻一层(入口层=下一层)的类型可见,更深层全盲
    const visible = nodes.filter(([, cls]) => cls.includes('available')).map(([, , ic]) => ic)
    void visible
    const deeper = nodes.filter(([, cls]) => !cls.includes('available') && !cls.includes('current')).map(([, , ic]) => ic)
    expect(deeper.every((ic) => ic === '❓'), '非相邻层的类型应全盲').toBe(true)
  })
  it('mastery 80(档 3)时类型图标全亮,暗道可见', () => {
    const members = (['guard', 'priest', 'ranger'] as const).map((j, i) => generateMember(j, 5, 77 + i))
    const run = createRun(members, BLACKMOSS, 53)
    const html = renderToStaticMarkup(createElement(MapScreen, { run, mastery: 80, drops: [], onChoose: () => {}, onRetreat: () => {} }))
    const icons = [...html.matchAll(/dg-icon[^>]*>([^<]*)</g)].map((m) => m[1]!)
    expect(icons.some((ic) => ic === '🕳'), '80 档应看见暗道').toBe(true)
    expect(icons.some((ic) => ic === '👑'), '80 档应看见 Boss').toBe(true)
    const names3 = [...html.matchAll(/dg-name[^>]*>([^<]*)</g)].map((m) => m[1]!)
    expect(names3.every((nm) => nm !== '未知岔路'), '档 3 全图不应有盲区').toBe(true)
    // 注意:事件节点的真图标就是 ❓,不能按「无问号」断言
  })
})
