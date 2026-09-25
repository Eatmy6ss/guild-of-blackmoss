// K06 个人心愿层(2026-09-25,U14):人物经营的具体抓手——
// 每位佣兵有自己的心愿(换更好的装备/再走一趟某个副本/爬塔到某层),
// 达成给士气奖励+编年史记录。心愿完成后可能立下新心愿,形成周期性的"人"的动力。
// 心愿全部可从现有状态推导检测(装备槽/首杀记录/塔纪录),不引入复杂模拟。

import type { Member } from './types'

export type WishKind = 'gear' | 'dungeon' | 'tower'

export interface Wish {
  kind: WishKind
  /** gear=槽位(weapon/armor) dungeon=副本 id tower=目标层数 */
  target: string
  /** 展示文案(生成时定稿,编年史引用) */
  text: string
}

/** 心愿生成池:装备/副本/塔按权重混合;副本池由调用方传入(该成员走过的图) */
export function rollWish(rng: () => number, opts: { slots?: string[]; dungeons?: { id: string; name: string }[]; towerBest: number; level: number }): Wish | null {
  if (rng() >= 0.5) return null // 一半的人没有明确心愿(朴素做人)
  const kinds: WishKind[] = ['gear', 'dungeon', 'tower']
  const weights = [3, opts.dungeons!.length > 0 ? 3 : 0, opts.towerBest > 0 ? 2 : 1]
  const total = weights.reduce((s, w) => s + w, 0)
  let x = rng() * total
  let kind: WishKind = 'gear'
  for (let i = 0; i < kinds.length; i++) {
    if (x < weights[i]!) { kind = kinds[i]!; break }
    x -= weights[i]!
  }
  if (kind === 'gear') {
    const slot = opts.slots && opts.slots.length > 0 ? opts.slots[Math.floor(rng() * opts.slots.length)]! : 'weapon'
    const label = slot === 'weapon' ? '一把更趁手的武器' : '一件更硬实的护甲'
    return { kind, target: slot, text: `想攒钱换${label}` }
  }
  if (kind === 'dungeon') {
    const dpool = opts.dungeons!
    const d = dpool[Math.floor(rng() * dpool.length)]!
    return { kind, target: d.id, text: `想再走一趟${d.name}` }
  }
  const floor = Math.max(3, opts.towerBest + 2 + Math.floor(rng() * 3))
  return { kind, target: String(floor), text: `想爬到高塔第 ${floor} 层看看` }
}

/** 心愿是否达成(纯状态推导) */
export function wishDone(m: Member, wish: Wish, ctx: { dungeonCleared: (id: string) => boolean; towerBest: number }): boolean {
  if (wish.kind === 'gear') {
    const eq = m.equipment[wish.target as 'weapon' | 'armor']
    return !!eq && eq.baseId.includes('-t2-')
  }
  if (wish.kind === 'dungeon') return ctx.dungeonCleared(wish.target)
  if (wish.kind === 'tower') return ctx.towerBest >= Number(wish.target)
  return false
}

/** 心愿达成奖励:士气 */
export const WISH_MORALE = 12
