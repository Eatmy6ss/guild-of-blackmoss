// 成员卡的三行描述(U29 R2-5 单点化,原 App.tsx 内联函数)
import type { Member } from '../../sim/types'

export function attrsLine(m: Member): string {
  const a = m.attrs
  return `力${a.str} 敏${a.agi} 智${a.int} 体${a.vit} 精${a.spr} 运${a.lck}`
}

export function personalityLine(m: Member): string {
  const p = m.personality
  return `勇猛${p.bravery} 谨慎${p.caution} 贪婪${p.greed} 忠诚${p.loyalty}`
}

export function natureLine(m: Member): string {
  const n = m.nature
  const best = (['str', 'agi', 'int'] as const).reduce((a, b) => (n.caps[a] >= n.caps[b] ? a : b))
  return `天性上限：${best === 'str' ? '力' : best === 'agi' ? '敏' : '智'}${n.caps[best]}`
}
