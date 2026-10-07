import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MapScreen } from './MapScreen'
import { createRun } from '../../sim/run'
import { generateMember } from '../../sim/gen'
import { BLACKMOSS } from '../../data/dungeons'
import { TERRAIN_NAMES } from '../../sim/dungeon-map'

// 2026-10-07 用户修订：低熟练度未探索全盲，随着熟练度逐步看清近处；情报可临时提前一档。

const TERRAIN_NAME_VALUES = Object.values(TERRAIN_NAMES)

function mapRun(seed = 53) {
  const members = (['guard', 'priest', 'ranger'] as const).map((j, i) => generateMember(j, 5, 77 + i))
  return createRun(members, BLACKMOSS, seed)
}
function render(mastery: number, seed = 53, options: { run?: ReturnType<typeof mapRun>; revealBonus?: number } = {}) {
  return renderToStaticMarkup(createElement(MapScreen, {
    run: options.run ?? mapRun(seed), mastery, revealBonus: options.revealBonus,
    drops: [], onChoose: () => {}, onRetreat: () => {},
  }))
}
const iconsOf = (html: string) => [...html.matchAll(/dg-icon[^>]*>([^<]*)</g)].map((m) => m[1]!)
const namesOf = (html: string) => [...html.matchAll(/dg-name[^>]*>([^<]*)</g)].map((m) => m[1]!)

describe('R1.3 组件级揭示验收(e2e M2 的姊妹断言)', () => {
  it.each([0, 1, 34])('低熟练度 %s：当前可选与远处路线都为问号，不透出地形、路名或首领样式', mastery => {
    const html = render(mastery)
    const icons = iconsOf(html)
    const names = namesOf(html)
    expect(icons.length).toBeGreaterThan(8)
    expect(icons.every((ic) => ic === '❓')).toBe(true)
    expect(names.every(nm => nm === '未知岔路')).toBe(true)
    expect(html).toMatch(/class="dg-node available masked"[^>]*title="未知岔路/)
    expect(html).not.toMatch(/class="dg-node[^"]*boss/)
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
        for (const t of [0, 35, 60]) {
          const html = render(t, seed)
          expect(iconsOf(html), `档 ${t} 不应出现暗道图标`).not.toContain('🕳')
          expect(namesOf(html), `档 ${t} 不应出现「???」`).not.toContain('???')
          expect(namesOf(html).some(n => n.includes('暗道')), `熟练度 ${t} 不应泄露暗道路名`).toBe(false)
        }
        checked++
      }
    }
    expect(checked, '150 个 seed 内应找到含暗道的图').toBeGreaterThan(0)
  })

  it('mastery 35：邻近路线有类型，第二层只知地形，更远仍未知', () => {
    const html = render(35)
    const names = namesOf(html)
    expect(names.some((nm) => nm !== '未知岔路'), '档 1 应见真路名').toBe(true)
    const nodes = [...html.matchAll(/class="dg-node([^"]*)"[\s\S]*?dg-icon[^>]*>([^<]*)</g)]
    const deeper = nodes.filter(([, cls]) => !cls.includes('available') && !cls.includes('current')).map(([, , ic]) => ic)
    expect(deeper.every((ic) => ic === '❓'), '非相邻层的类型应全盲').toBe(true)
    expect(names.some(n => TERRAIN_NAME_VALUES.includes(n)), '第二层应有地形线索').toBe(true)
    expect(names.some(n => n === '未知岔路'), '不提前透露远层路名').toBe(true)
  })

  it('mastery 60：前两层能看具体路线，远层仍未知', () => {
    const run = mapRun()
    const html = render(60, 53, { run })
    const names = namesOf(html)
    const visibleNodes = run.map.layers.flat().filter(n => n.kind !== 'secret')
    expect(names).toEqual(visibleNodes.map(n => n.layer <= 1 ? n.name : '未知岔路'))
    expect(html).not.toMatch(/class="dg-node[^"]*boss/)
  })

  it('低熟练度带情报可提前看邻近选项，但不全图透视且不改永久熟练度', () => {
    const run = mapRun(), before = structuredClone(run)
    const html = render(0, 53, { run, revealBonus: 1 })
    expect(namesOf(html)).toEqual(namesOf(render(35, 53, { run })))
    expect(namesOf(html)).toContain('未知岔路')
    expect(html).toContain('本趟提前揭示一档')
    expect(html).toContain('熟练度 0')
    expect(run).toEqual(before)
  })

  it('走过的普通路线与暗道不会重新蒙住；迷途仍遮住前方可选路线', () => {
    const run = mapRun()
    const secret = run.map.layers.flat().find(n => n.kind === 'secret')!
    run.path = [secret.id]; run.nodeId = secret.id
    const known = render(0, 53, { run })
    expect(namesOf(known)).toContain(secret.name)
    expect(iconsOf(known)).toContain('🕳')
    run.path = [run.map.layers[0][0].id]; run.nodeId = run.path[0]
    run.conditions = ['lost']
    const lost = render(80, 53, { run })
    const available = [...lost.matchAll(/class="dg-node available([^"]*)"[^>]*title="([^"]*)"/g)]
    expect(available.length).toBeGreaterThan(0)
    expect(available.every(([, cls, title]) => cls.includes('masked') && title.startsWith('未知岔路'))).toBe(true)
    expect(namesOf(lost)).toContain(run.map.layers[0][0].name)
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
