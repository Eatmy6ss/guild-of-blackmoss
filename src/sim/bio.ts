// R4.1 生平(U34,redesign §6):个人传记——每个人物的私人时间线。
// 公会大事记只留里程碑与公会大事(Q1/Q2 拍板),个人事件一律落这里。
// Q3 拍板:非永久条目 LRU 40 条;永久条目(加入/首杀/创伤/心愿/特性/阵亡)不占额度、不修剪。

import type { Member } from './types'

export type BioKind =
  | 'joined' | 'level-up' | 'training' | 'first-kill' | 'scar'
  | 'wish' | 'bond' | 'story' | 'trait' | 'fall' | 'heal'

export interface BioEntry {
  day: number
  kind: BioKind
  text: string
  /** 永久条目不受 LRU 上限约束、永不修剪(Q3 拍板) */
  permanent?: boolean
}

export const BIO_PERMANENT: readonly BioKind[] = ['joined', 'first-kill', 'scar', 'wish', 'trait', 'fall']
export const BIO_CAP = 40

const BIO_KINDS: readonly BioKind[] = ['joined', 'level-up', 'training', 'first-kill', 'scar', 'wish', 'bond', 'story', 'trait', 'fall', 'heal']

/** 唯一追加入口(账本纪律:调用方不裸写 bio 数组)。原地改写传入成员——结算侧已在克隆上操作。 */
export function appendBio(member: Pick<Member, 'bio'>, entry: BioEntry): void {
  const bio = [...(member.bio ?? []), entry]
  let excess = bio.filter((b) => !b.permanent).length - BIO_CAP
  for (let i = 0; excess > 0 && i < bio.length; ) {
    if (bio[i].permanent) { i++; continue }
    bio.splice(i, 1)
    excess--
  }
  member.bio = bio
}

/** 存档消毒:缺失/非法=undefined 合法(零迁移);非法 kind、非有限 day、非字符串或超长 text 的条目逐条丢弃 */
export function sanitizeBio(bio: unknown): BioEntry[] | undefined {
  if (!Array.isArray(bio)) return undefined
  const out = (bio as unknown[]).filter((e): e is BioEntry =>
    !!e && typeof e === 'object' &&
    BIO_KINDS.includes((e as BioEntry).kind) &&
    typeof (e as BioEntry).day === 'number' && Number.isFinite((e as BioEntry).day) &&
    typeof (e as BioEntry).text === 'string' && (e as BioEntry).text.length <= 400 &&
    ((e as BioEntry).permanent === undefined || typeof (e as BioEntry).permanent === 'boolean'),
  ).map((e) => (BIO_PERMANENT.includes(e.kind)
    ? { ...e, permanent: true }
    : { day: e.day, kind: e.kind, text: e.text }))
  return out.length ? out.slice(-200) : undefined
}
