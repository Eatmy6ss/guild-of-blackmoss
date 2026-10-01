// A9 说书人 A 步(U23):每趟远征回城后最多讲 1 条,挑本趟最强碰撞。
// 文本纪律(融合原则):事实句在前(只写账本里有的细节:人名/地点/机制/第几次),
// 收尾最多一句解读、且模板本身即由事实槽位构成——没有事实就没有故事(返回 null)。
// 模板在 src/data/story-templates.ts(手写,禁程序拼句);本模块只做碰撞识别与槽位填充,不读 App 状态。
import type { Fact, FactLedger } from './fact-ledger'
import { DUNGEONS } from '../data/dungeons'
import { TEMPLATES, type StorySlots, type StoryType } from '../data/story-templates'

export interface StoryEntry {
  type: StoryType
  text: string
  factIds: number[]
}

const dungeonName = (id?: string): string =>
  DUNGEONS.find((d) => d.id === id)?.name ?? '未知之地'

const bossName = (bossId?: string): string => {
  if (!bossId) return '首领'
  for (const d of DUNGEONS) {
    const b = d.bosses[bossId]
    if (b) return b.name
  }
  return bossId
}

/** 优先级即"最强"排序:延迟兑现(能证明的跨时间因果)> 首杀陪葬 > 创伤生还 > 遗物待赎 > 心愿 > 默契 */
const PRIORITY: StoryType[] = ['consequence-due', 'firstkill-death', 'scar-survive', 'relic-wait', 'wish-done', 'bond-star']

export function tellExpedition(ledger: Pick<FactLedger, 'facts'>, rng: () => number, startId = 0): StoryEntry | null {
  // startId=本趟远征第一笔事实的 id:碰撞类只查本趟,延迟兑现(跨时间因果)查全窗
  const slots: StorySlots = {}
  for (const type of PRIORITY) {
    const factIds = collide(type, type === 'consequence-due' ? ledger.facts : ledger.facts.filter((f) => f.id >= startId), slots)
    if (!factIds) continue
    const templates = TEMPLATES[type]
    const text = templates[Math.floor(rng() * templates.length) % templates.length](slots)
    return { type, text, factIds }
  }
  return null
}

/** 识别一类碰撞:返回涉及的账本事实 id 并填充槽位;不构成则 null */
function collide(type: StoryType, facts: Fact[], slots: StorySlots): number[] | null {
  const deaths = facts.filter((f) => f.kind === 'death')
  const nameOf = (f: Fact, i = 0): string => f.names?.[f.actors[i]] ?? f.actors[i] ?? '某人'
  const placeOf = (f: Fact): string => dungeonName(f.cause?.where.id)

  switch (type) {
    case 'consequence-due': {
      const due = facts.find((f) => f.kind === 'consequence-due' && (f.links?.length ?? 0) > 0)
      if (!due) return null
      const origin = facts.find((f) => f.id === due.links![0])
      slots.eventId = due.refs.eventId ?? ''
      slots.choiceDay = origin?.day ?? due.day
      slots.dueDay = due.day
      return [due.id, ...(due.links ?? [])]
    }
    case 'firstkill-death': {
      const kill = facts.find((f) => f.kind === 'first-kill')
      const dead = deaths.find((d) => d.cause?.where.id === kill?.refs.dungeonId)
      if (!kill || !dead) return null
      slots.boss = bossName(kill.refs.bossId)
      slots.place = dungeonName(kill.refs.dungeonId)
      slots.hero = nameOf(dead)
      slots.killer = nameOf(kill)
      return [kill.id, dead.id]
    }
    case 'scar-survive': {
      const scar = facts.find((f) => f.kind === 'scar')
      if (!scar) return null
      const scarred = scar.actors[0]
      if (deaths.some((d) => d.actors[0] === scarred)) return null // 人没了归遗物/死亡类,不这么讲
      slots.hero = nameOf(scar)
      slots.place = placeOf(scar)
      return [scar.id]
    }
    case 'relic-wait': {
      const bind = facts.find((f) => f.kind === 'relic-bind')
      const death = deaths.find((d) => d.actors[0] === bind?.actors[0])
      if (!bind || !death) return null
      slots.hero = nameOf(death)
      slots.place = placeOf(death)
      slots.itemUid = bind.refs.itemUid ?? ''
      return [bind.id, death.id]
    }
    case 'wish-done': {
      const wish = facts.find((f) => f.kind === 'wish-done')
      const victory = facts.some((f) => f.kind === 'first-kill' || f.kind === 'bond-star')
      if (!wish || !victory) return null
      slots.hero = nameOf(wish)
      return [wish.id]
    }
    case 'bond-star': {
      const bond = facts.find((f) => f.kind === 'bond-star')
      if (!bond || bond.actors.length < 2) return null
      slots.a = nameOf(bond, 0)
      slots.b = nameOf(bond, 1)
      return [bond.id]
    }
  }
}
