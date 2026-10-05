import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MapScreen } from './MapScreen'
import { createRun } from '../../sim/run'
import { generateMember } from '../../sim/gen'
import { BLACKMOSS } from '../../data/dungeons'
import { TERRAIN_NAMES } from '../../sim/dungeon-map'

// R1.3 组件级揭示验收(e2e M2 的姊妹断言)。U33③④ 修订后的口径:
// 档 0 = 迷雾起点:相邻一层只显示地形名(不显风味名/类型/内容),更远的层全盲;暗道档 <3 完全不渲染。

const TERRAIN_NAME_VALUES = Object.values(TERRAIN_NAMES)

function render(mastery: number, seed = 53) {
  const members = (['guard', 'priest', 'ranger'] as const).map((j, i) => generateMember(j, 5, 77 + i))
  const run = createRun(members, BLACKMOSS, seed)
  return renderToStaticMarkup(createElement(MapScreen, { run, mastery, drops: [], onChoose: () => {}, onRetreat: () => {} }))
}
const iconsOf = (html: string) => [...html.matchAll(/dg-icon[^>]*>([^<]*)</g)].map((m) => m[1]!)
const namesOf = (html: string) => [...html.matchAll(/dg-name[^>]*>([^<]*)</g)].map((m) => m[1]!)

describe('R1.3 组件级揭示验收(e2e M2 的姊妹断言)', () => {
  it('U33③ 迷雾起点:mastery 0 时相邻层显示地形名、更远层全盲;图标全 ❓,风味名零泄露', () => {
    const html = render(0)
    const icons = iconsOf(html)
    const names = namesOf(html)
    expect(icons.length).toBeGreaterThan(8)
    expect(icons.every((ic) => ic === '❓')).toBe(true)
    // 相邻层(入口=第 0 层)只显示地形名;其余全盲
    const terrainNames = names.filter((nm) => nm !== '未知岔路')
    expect(terrainNames.length, '相邻层应至少显示一个地形名').toBeGreaterThan(0)
    expect(terrainNames.every((nm) => TERRAIN_NAME_VALUES.includes(nm)), '地形名合法:' + terrainNames.join(',')).toBe(true)
    // 风味名零泄露(黑苔的风味名样本;SSR 不携带 encounter 名)
    expect(html).not.toContain('水蛭洼地')
    expect(html).not.toContain('狼群猎场')
    expect(html).not.toContain('药贩营地')
    expect(html).not.toContain('蛙人小径')
  })

  it('U33⑧④ 暗道不提前泄露:档 0/1/2 下暗道节点完全不渲染(无 🕳 无「???」),档 3 才可见', () => {
    // 多试几个 seed 找到生成含暗道的图
    let checked = 0
    for (let seed = 53; seed < 203 && checked < 5; seed++) {
      const html3 = render(80, seed)
      if (!namesOf(html3).some((nm) => nm === '未知岔路') && iconsOf(html3).some((ic) => ic === '🕳')) {
        // 该 seed 的图确有暗道(80 档可见)
        for (const t of [0, 1, 2]) {
          const html = render(t, seed)
          expect(iconsOf(html), `档 ${t} 不应出现暗道图标`).not.toContain('🕳')
          expect(namesOf(html), `档 ${t} 不应出现「???」`).not.toContain('???')
          expect(html, `档 ${t} 暗道路名不应泄露`).not.toContain('暗道')
        }
        checked++
      }
    }
    expect(checked, '150 个 seed 内应找到含暗道的图').toBeGreaterThan(0)
  })

  it('mastery 35(档 1)起显示路名与地形;类型仍盲', () => {
    const html = render(35)
    const names = namesOf(html)
    expect(names.some((nm) => nm !== '未知岔路'), '档 1 应见真路名').toBe(true)
    const nodes = [...html.matchAll(/class="dg-node([^"]*)"[\s\S]*?dg-icon[^>]*>([^<]*)</g)]
    const deeper = nodes.filter(([, cls]) => !cls.includes('available') && !cls.includes('current')).map(([, , ic]) => ic)
    expect(deeper.every((ic) => ic === '❓'), '非相邻层的类型应全盲').toBe(true)
  })

  it('mastery 80(档 3)时类型图标全亮,暗道可见', () => {
    const html = render(80)
    const icons = iconsOf(html)
    expect(icons.some((ic) => ic === '🕳'), '80 档应看见暗道').toBe(true)
    expect(icons.some((ic) => ic === '👑'), '80 档应看见 Boss').toBe(true)
    const names3 = namesOf(html)
    expect(names3.every((nm) => nm !== '未知岔路'), '档 3 全图不应有盲区').toBe(true)
    // 注意:事件节点的真图标就是 ❓,不能按「无问号」断言
  })
})
