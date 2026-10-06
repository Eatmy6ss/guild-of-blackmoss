import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemberPanel } from './screens/MemberPanel'
import { MemorialScreen } from './screens/MemorialScreen'
import type { DeadHero } from '../sim/types'
import { generateMember } from '../sim/gen'

// R4.1 生平(U34):呈现层 SSR 探针——档案页传记时间线与纪念堂摘录的渲染契约。

const cap = generateMember('guard', 5, 42)
cap.name = '铁壁'
cap.bio = [
  { day: 1, kind: 'joined', text: '经由酒馆传闻加入了公会。', permanent: true },
  { day: 9, kind: 'level-up', text: '成长到了 Lv9,在靶场上待到深夜。' },
]

describe('R4.1 生平渲染(U34)', () => {
  it('档案页:生平栏倒序渲染,永久条目带 ⚑', () => {
    const html = renderToStaticMarkup(createElement(MemberPanel, {
      member: cap, members: [cap], onClose: () => {},
    }))
    expect(html).toContain('生平')
    expect(html).toContain('bio-entry')
    expect(html).toContain('⚑')
    expect(html.indexOf('Lv9')).toBeLessThan(html.indexOf('加入了公会')) // 倒序:D9 在 D1 前
  })

  it('无生平成员:占位文案,不渲染 bio-list', () => {
    const bare = generateMember('ranger', 3, 43)
    const html = renderToStaticMarkup(createElement(MemberPanel, {
      member: bare, members: [bare], onClose: () => {},
    }))
    expect(html).not.toContain('bio-list')
    expect(html).toContain('还没有值得记下的经历')
  })

  it('纪念堂:阵亡快照的永久条目摘录;无 bio 老档不渲染', () => {
    const hero: DeadHero = {
      id: cap.id, name: cap.name, job: cap.job, level: 5,
      cause: '陨落于黑苔沼泽', bio: cap.bio,
    }
    const html = renderToStaticMarkup(createElement(MemorialScreen, { memorial: [hero], onBack: () => {} }))
    expect(html).toContain('memorial-bio')
    expect(html).toContain('加入了公会')
    const bare: DeadHero = { id: 'x', name: '旧档者', job: 'mage', level: 2, cause: '陨落于黑苔沼泽' }
    const html2 = renderToStaticMarkup(createElement(MemorialScreen, { memorial: [bare], onBack: () => {} }))
    expect(html2).not.toContain('memorial-bio')
  })
})
