import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RosterScreen } from './screens/RosterScreen'
import { HexStat } from './screens/HexStat'
import { generateMember } from '../sim/gen'
import type { Member } from '../sim/types'

// U35 花名册改版:直开档案+切换条+右下略缩图/六维雷达;嵌入模式无关闭按钮。

const squad = (): Member[] => {
  const a = generateMember('guard', 5, 61)
  const b = generateMember('ranger', 4, 62)
  a.alive = true; b.alive = true
  return [a, b]
}
const noop = () => {}
const base = {
  battle: null, run: null, expedition: [], inventory: [], expeditionIds: [],
  onEquip: noop, onEnter: noop, onLeave: noop,
  gold: 200, busy: false, today: 3, trainingLevel: 1, onLearnFamily: noop, onBack: noop,
}

describe('U35 花名册改版', () => {
  it('一打开即人物档案:切换条+档案主区(嵌入无关闭钮)+右下略缩图+六维雷达', () => {
    const html = renderToStaticMarkup(createElement(RosterScreen, { members: squad(), ...base }))
    expect(html).toContain('roster-tab')
    expect(html).toContain('roster-side')
    expect(html).toContain('member-card')
    expect(html).toContain('hexstat')
    expect(html).toContain('属性') // 档案主区(MemberPanel)直开
    expect(html).not.toContain('✕ 关闭(Esc)') // 嵌入模式
  })

  it('全员阵亡:占位文案不崩', () => {
    const dead = squad().map((m) => ({ ...m, alive: false }))
    const html = renderToStaticMarkup(createElement(RosterScreen, { members: dead, ...base }))
    expect(html).toContain('名册空空如也')
  })

  it('HexStat:六维标签与数值渲染,数值封顶 max', () => {
    const m = squad()[0]!
    m.attrs = { ...m.attrs, str: 99 }
    const html = renderToStaticMarkup(createElement(HexStat, { member: m }))
    for (const label of ['力量', '敏捷', '智力', '体质', '精神', '幸运']) expect(html).toContain(label)
    expect(html).toContain('99') // 99>12 也按实际数值显示(封顶只在多边形比例)
  })
})
