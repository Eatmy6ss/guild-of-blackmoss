// U36(制作人 2026-10-06 情报新口径):情报=条目化记录,不是一次性开关。
// ①买完立刻告知获得了什么(具体文本,来自数据表或手写假话术);②进副本后地图上能看到已获
// 情报清单(假情报照常显示,验证后才标真伪);③分首领/杂兵两类;④同一副本条数上限;
// ⑤三档价格,越贵越可靠;⑥货源有限(每出发日补 1,上限 3)——不能无限买、不能天天买。
import { DUNGEONS } from '../data/dungeons'

export type IntelKind = 'boss' | 'mob'

export interface IntelEntry {
  /** 单调序号(公会级计数) */
  id: number
  dungeonId: string
  kind: IntelKind
  /** 情报文本(买的时候就知道内容;真伪要验证后才知道) */
  text: string
  real: boolean
  day: number
  /** 真情报的揭示收益已被某趟远征消耗(文本知识仍在) */
  revealUsedDay?: number
  /** 该副本走过一趟后验证:属实/假货(此前地图上一律不标真伪) */
  verified?: boolean
}

export interface IntelTier { id: string; name: string; gold: number; realChance: number; desc: string }

/** 三档价格(C4 占位):越贵越可靠 */
export const INTEL_TIERS: IntelTier[] = [
  { id: 'street', name: '街谈巷议', gold: 25, realChance: 0.6, desc: '便宜,十句里四句是吹的' },
  { id: 'veteran', name: '老兵见闻', gold: 60, realChance: 0.85, desc: '雇佣兵的亲身经历,大多可靠' },
  { id: 'royal', name: '官署密报', gold: 120, realChance: 1, desc: '王国的侦察记录,从不掺水' },
]

/** 货源:每出发日补 1 份,上限 3(C4 占位)——情报不能无限获取 */
export const INTEL_STOCK_CAP = 3
/** 同一副本最多同时挂着几条未验证情报 */
export const INTEL_PER_DUNGEON = 3

export function intelCountFor(entries: IntelEntry[], dungeonId: string): number {
  return entries.filter((e) => e.dungeonId === dungeonId).length
}

export function intelDungeonFull(entries: IntelEntry[], dungeonId: string): boolean {
  return intelCountFor(entries, dungeonId) >= INTEL_PER_DUNGEON
}

/** 展示清单:假的也照常显示(玩家自己判断;验证后才标真伪) */
export function intelForDungeon(entries: IntelEntry[], dungeonId: string): IntelEntry[] {
  return entries.filter((e) => e.dungeonId === dungeonId)
}

// ---- 文本生成:真情报全部来自数据表;假情报是手写的似是而非话术 ----

type DungeonData = {
  id: string
  name: string
  bosses: Record<string, { name: string; mechanics?: { name?: string }[] }>
  terrains: Record<string, { names: string[]; encounters: string[] }>
  encounters: { id: string; name: string; kind: string; enemyGroupIds: string[] }[]
  enemyGroups: Record<string, { name: string }[]>
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]!
}

function realBossText(d: DungeonData, rng: () => number): string {
  const bosses = Object.values(d.bosses)
  if (!bosses.length) return `${d.name}深处盘踞着一头大家伙。`
  const boss = pick(bosses, rng)
  const mech = boss.mechanics?.find((m) => m.name)?.name
  return mech
    ? `首领「${boss.name}」惯用「${mech}」——红条一亮就散开,咏唱可以被打断。`
    : `首领「${boss.name}」守在${d.name}最深处,蓄力极猛,护住治疗。`
}

function realMobText(d: DungeonData, rng: () => number): string {
  const waves = d.encounters.filter((e) => e.kind === 'wave')
  if (!waves.length) return `${d.name}的路上小怪成群,别恋战。`
  const enc = pick(waves, rng)
  const group = enc.enemyGroupIds.map((g) => d.enemyGroups[g]?.[0]?.name).find(Boolean) ?? enc.name
  const terrain = pick(Object.values(d.terrains).filter((t) => t.encounters.includes(enc.id)), rng)
  const place = terrain?.names?.[0] ?? d.name
  return `「${place}」一带常见「${group}」结群活动,数量不少,治疗要跟上。`
}

const FAKE_BOSS_TEMPLATES = [
  (_d: DungeonData, wrong: string) => `首领「${wrong}」畏惧火焰——备几件火抗装,能省大力。(据传)`,
  (d: DungeonData, wrong: string) => `据说「${d.name}」深处的首领「${wrong}」血量不高,一波爆发就能带走。`,
  (_d: DungeonData, wrong: string) => `「${wrong}」不会主动追击,拖着打就是了。`,
]
const FAKE_MOB_TEMPLATES = [
  (_d: DungeonData, wrong: string) => `「${wrong}」不会主动攻击,放心从它们中间走过去。`,
  (_d: DungeonData, wrong: string) => `传闻「${wrong}」身上带着大量金币,击杀必掉好货。`,
  (_d: DungeonData, wrong: string) => `「${wrong}」怕大声响——扔块石头就能吓跑整群。`,
]

/** 张冠李戴用的"错误内容":优先拿别的副本的 boss/遭遇名 */
function wrongNames(dungeonId: string, rng: () => number): { boss: string; mob: string } {
  const others = (DUNGEONS as unknown as DungeonData[]).filter((d) => d.id !== dungeonId)
  const other = pick(others, rng)
  const boss = Object.values(other.bosses)[0]?.name ?? '无名巨兽'
  const wave = other.encounters.find((e) => e.kind === 'wave')
  const mob = (wave && wave.enemyGroupIds.map((g) => other.enemyGroups[g]?.[0]?.name).find(Boolean)) ?? wave?.name ?? '不明集群'
  return { boss, mob }
}

/** 买情报:按档位 roll 真伪并生成条目(调用方负责货源/上限/扣费) */
export function rollIntel(
  dungeonId: string, kind: IntelKind, tier: IntelTier, day: number, nextId: number, rng: () => number,
): IntelEntry {
  const d = DUNGEONS.find((x) => x.id === dungeonId) as unknown as (DungeonData | undefined)
  const real = rng() < tier.realChance
  const wrong = wrongNames(dungeonId, rng)
  let text: string
  if (!d) text = '关于那片地方的消息,含糊得像醉话。'
  else if (real) text = kind === 'boss' ? realBossText(d, rng) : realMobText(d, rng)
  else text = kind === 'boss' ? pick(FAKE_BOSS_TEMPLATES, rng)(d, wrong.boss) : pick(FAKE_MOB_TEMPLATES, rng)(d, wrong.mob)
  return { id: nextId, dungeonId, kind, text, real, day }
}

/** 出发消费:该副本存在未消耗的真情报 → 本趟揭示档 +1(只消耗一条;文本知识仍在) */
export function consumeIntelReveal(entries: IntelEntry[], dungeonId: string, day: number): { entries: IntelEntry[]; bonus: number } {
  const target = entries.find((e) => e.dungeonId === dungeonId && e.real && e.revealUsedDay === undefined)
  if (!target) return { entries, bonus: 0 }
  return {
    entries: entries.map((e) => (e.id === target.id ? { ...e, revealUsedDay: day } : e)),
    bonus: 1,
  }
}

/** 该副本远征结束:未验证条目全部验证(亲眼见过了);返回验证通知 */
export function verifyIntelFor(entries: IntelEntry[], dungeonId: string): { entries: IntelEntry[]; notes: string[] } {
  const pending = entries.filter((e) => e.dungeonId === dungeonId && e.verified === undefined)
  if (!pending.length) return { entries, notes: [] }
  const notes = pending.map((e) => `情报验证:「${e.text.slice(0, 24)}${e.text.length > 24 ? '…' : ''}」——${e.real ? '属实。' : '是假货,那贩子早跑了。'}`)
  return { entries: entries.map((e) => (e.dungeonId === dungeonId && e.verified === undefined ? { ...e, verified: true } : e)), notes }
}

/** 存档消毒:逐条校验,非法丢弃;空=undefined */
export function sanitizeIntelEntries(raw: unknown): IntelEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out = (raw as unknown[]).filter((e): e is IntelEntry =>
    !!e && typeof e === 'object' &&
    Number.isSafeInteger((e as IntelEntry).id) &&
    typeof (e as IntelEntry).dungeonId === 'string' && (e as IntelEntry).dungeonId.length > 0 &&
    ((e as IntelEntry).kind === 'boss' || (e as IntelEntry).kind === 'mob') &&
    typeof (e as IntelEntry).text === 'string' && (e as IntelEntry).text.length > 0 && (e as IntelEntry).text.length <= 300 &&
    typeof (e as IntelEntry).real === 'boolean' &&
    typeof (e as IntelEntry).day === 'number' && Number.isFinite((e as IntelEntry).day),
  )
  return out.length ? out.slice(-60) : undefined
}
