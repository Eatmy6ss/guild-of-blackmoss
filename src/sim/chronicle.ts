import type { Member } from './types'
import { moraleLabel } from './morale'
import { bondStars } from './gen'

// 模拟灵魂层·第二层:编年史(M1 P2)——"讲给别人听的故事"的实体容器。
// 数据表驱动的事件池 + 从状态触发;只追加不修改,存档持久化。

export interface ChronicleEntry {
  /** 单调递增序号(存档还原用) */
  seq: number
  day: number
  text: string
}

export type ChronicleSink = (text: string) => void

let seqCounter = 0

export function resetChronicle(): void {
  seqCounter = 0
}

/** 恢复存档后的序号续接 */
export function seedChronicle(existing: ChronicleEntry[]): void {
  seqCounter = existing.reduce((max, e) => Math.max(max, e.seq), 0)
}

function make(day: number, text: string): ChronicleEntry {
  seqCounter += 1
  return { seq: seqCounter, day, text }
}

// ---- 事件生成器(状态 → 故事文本)----

export function chronicleBattleVictory(day: number, floor: string, survivors: Member[]): ChronicleEntry {
  const names = survivors.map((m) => m.name).join('、')
  return make(day, `远征队在${floor}奏凯而归(${names})。`)
}

export function chronicleHeroFall(day: number, name: string, job: string, place: string): ChronicleEntry {
  return make(day, `${name}(${job})陨落于${place}。酒馆里那晚没有人说话。`)
}

export function chronicleFirstKill(day: number, boss: string, killer: Member): ChronicleEntry {
  return make(day, `${killer.name} 亲手斩下了${boss}的首级——公会的旗上多了一道疤。`)
}

export function chronicleLevelUp(day: number, m: Member, level: number): ChronicleEntry {
  return make(day, `${m.name} 成长到了 Lv${level},在靶场上待到深夜。`)
}

export function chronicleBondStar(day: number, a: Member, b: Member, stars: number): ChronicleEntry {
  return make(day, `${a.name} 与 ${b.name} 的默契升到了 ${'★'.repeat(stars)}——生死之交又深了一分。`)
}

export function chronicleRecruit(day: number, m: Member, path: string): ChronicleEntry {
  return make(day, `${m.name} 经由${path}加入了公会。`)
}

export function chronicleAbandon(day: number, left: Member[]): ChronicleEntry {
  const names = left.map((m) => m.name).join('、')
  return make(day, `撤退的号角响起,${names} 被留在了身后。有些人回来了,有些东西没有。`)
}

export function chronicleFeast(day: number, spent: number): ChronicleEntry {
  return make(day, `会长开了一场庆功宴,花了 ${spent} 金。笑声重新回到了酒馆。`)
}

export function chronicleRefusal(day: number, refusers: Member[]): ChronicleEntry {
  const names = refusers.map((m) => `${m.name}(${moraleLabel(m)})`).join('、')
  return make(day, `出击的清晨,${names} 没有出现在集合点。士气需要一场胜利或一场宴会来修复。`)
}

export function chronicleBuilding(day: number, name: string, level: number): ChronicleEntry {
  return make(day, `公会的${name}升到了 ${level} 级——炉火与锤声整夜未熄。`)
}

export function chronicleTowerRecord(day: number, floor: number): ChronicleEntry {
  return make(day, `远征队踏入了黑苔高塔第 ${floor} 层——公会的最高纪录被刷新。`)
}

export function chronicleWipeRebuild(day: number): ChronicleEntry {
  return make(day, `团灭之后,公会的旗重新升了起来。酒馆又挂出了招募告示。`)
}

/** 成员卡士气摘要(与默契星同行的读数) */
export function moraleReadout(m: Member): string {
  const stars = Object.values(m.bonds ?? {}).reduce((s, n) => s + bondStars(n), 0)
  const starStr = stars > 0 ? '★'.repeat(Math.min(6, stars)) : '无'
  return `士气 ${m.morale ?? 60}(${moraleLabel(m)}) · 默契 ${starStr}`
}
