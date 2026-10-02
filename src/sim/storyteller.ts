// A9 说书人 A 步(U23):每趟远征回城后最多讲 1 条,挑本趟最强碰撞。
// 文本纪律(融合原则):事实句在前(只写账本里有的细节:人名/地点/机制/第几次),
// 收尾最多一句解读、且模板本身即由事实槽位构成——没有事实就没有故事(返回 null)。
// 模板在 src/data/story-templates.ts(手写,禁程序拼句);本模块只做碰撞识别与槽位填充,不读 App 状态。
import type { Fact, FactLedger } from './fact-ledger'
import { DUNGEONS } from '../data/dungeons'
import { GUILD_EVENTS } from '../data/guild-events'
import { TEMPLATES, type StorySlots, type StoryType } from '../data/story-templates'

const dungeonName = (id?: string): string => {
  if (id === 'tower') return '黑苔高塔'
  return DUNGEONS.find((d) => d.id === id)?.name ?? '未知之地'
}

const bossName = (bossId?: string): string => {
  if (!bossId) return '首领'
  for (const d of DUNGEONS) {
    const b = d.bosses[bossId]
    if (b) return b.name
  }
  return bossId
}

/** 优先级即"最强"排序:延迟兑现(能证明的跨时间因果)> 首杀陪葬 > 创伤生还 > 遗物待赎 > 心愿 > 默契 */
const PRIORITY: StoryType[] = ['consequence-due', 'firstkill-death', 'firstkill-fallen', 'scar-survive', 'relic-wait', 'wish-done', 'bond-star']

export interface StoryEntry {
  type: StoryType
  text: string
  factIds: number[]
  /** U26⑥:本次用掉的模板下标(App 经 markTold 记入账本 recentTemplates) */
  templateIdx: number
}

export function tellExpedition(ledger: Pick<FactLedger, 'facts' | 'recentTemplates'>, rng: () => number, window: { fromId: number; startId: number } = { fromId: 0, startId: 0 }): StoryEntry | null {
  // 普通碰撞只认本趟尚未讲过的事实；延迟兑现可发生在出发前，源选择查完整历史。
  const slots: StorySlots = {}
  for (const type of PRIORITY) {
    const factIds = collide(type, type === 'consequence-due' ? ledger.facts :
      ledger.facts.filter((f) => f.id >= Math.max(window.fromId, window.startId)), slots, window.fromId)
    if (!factIds) continue
    const templates = TEMPLATES[type]
    // U26⑥ Q4-B:同类排除最近用过的 2 个下标
    const recent = (ledger.recentTemplates?.[type] ?? []).filter((i) => i < templates.length)
    const candidates = templates.map((_, i) => i).filter((i) => !recent.includes(i))
    if (candidates.length === 0) continue
    const templateIdx = candidates[Math.floor(rng() * candidates.length) % candidates.length]
    const text = templates[templateIdx](slots)
    return { type, text, factIds, templateIdx }
  }
  return null
}

/** 识别一类碰撞:返回涉及的账本事实 id 并填充槽位;不构成则 null */
function collide(type: StoryType, facts: Fact[], slots: StorySlots, fromId: number): number[] | null {
  const deaths = facts.filter((f) => f.kind === 'death')
  const nameOf = (f: Fact, i = 0): string => f.names?.[f.actors[i]] ?? f.actors[i] ?? '某人'
  const placeOf = (f: Fact): string => dungeonName(f.cause?.where?.id ?? f.refs.dungeonId)

  switch (type) {
    case 'consequence-due': {
      for (const due of facts.filter((f) => f.kind === 'consequence-due' && f.id >= fromId)) {
        if (!Number.isSafeInteger(due.day) || due.day < 1) continue
        const origin = facts.find((f) => due.links?.includes(f.id) && f.id < due.id &&
          f.kind === 'event-choice' && !!f.refs.eventId &&
          Number.isSafeInteger(f.day) && f.day >= 1 && f.day <= due.day &&
          GUILD_EVENTS.find((e) => e.id === f.refs.eventId)?.choices.some((choice) =>
            choice.outcomes.some((outcome) => outcome.effects?.delayed?.eventId === due.refs.eventId)))
        const evDef = GUILD_EVENTS.find((e) => e.id === due.refs.eventId)
        if (!origin || !evDef) continue // 缺失、错误种类或未来来源不能补造选择日期。
        slots.eventTitle = evDef.title.replace(/^第.幕·/, '')
        slots.choiceDay = origin.day
        slots.dueDay = due.day
        return [due.id, origin.id]
      }
      return null
    }
    case 'firstkill-death': {
      // U26⑤:Boss 战当场阵亡(同副本同 encounter)。旧事实缺 encounter 不配对(冒充同场)
      for (const kill of facts.filter((f) => f.kind === 'first-kill')) {
        if (kill.refs.encounter === undefined) continue
        const dead = deaths.find((d) => d.cause?.where.id === kill.refs.dungeonId && d.refs.encounter === kill.refs.encounter)
        if (!dead) continue
        slots.boss = bossName(kill.refs.bossId)
        slots.place = dungeonName(kill.refs.dungeonId)
        slots.hero = nameOf(dead)
        slots.killer = nameOf(kill)
        return [kill.id, dead.id]
      }
      return null
    }
    case 'firstkill-fallen': {
      // U26⑤:首杀之前阵亡(同副本,encounter 更小);旧事实缺 encounter 只允许配 fallen
      for (const kill of facts.filter((f) => f.kind === 'first-kill')) {
        const dead = deaths.find((d) => d.cause?.where.id === kill.refs.dungeonId &&
          (d.refs.encounter === undefined || kill.refs.encounter === undefined || d.refs.encounter < kill.refs.encounter))
        if (!dead) continue
        slots.boss = bossName(kill.refs.bossId)
        slots.place = dungeonName(kill.refs.dungeonId)
        slots.hero = nameOf(dead)
        slots.killer = nameOf(kill)
        return [kill.id, dead.id]
      }
      return null
    }
    case 'scar-survive': {
      // U26⑥ Q4-C:创伤只讲「本场濒死后生还」或「第 2/3 条伤疤」;旧事实缺标记不讲
      const scar = facts.find((f) => f.kind === 'scar' && f.actors.length > 0 &&
        Number.isSafeInteger(f.refs.scarNth) && (f.refs.scarNth ?? 0) >= 1 &&
        ((f.refs.nearDeath === true) || (f.refs.scarNth ?? 0) >= 2))
      if (!scar) return null
      const scarred = scar.actors[0]
      if (deaths.some((d) => d.actors[0] === scarred)) return null // 人没了归遗物/死亡类,不这么讲
      slots.hero = nameOf(scar)
      slots.place = placeOf(scar)
      slots.nth = scar.refs.scarNth
      return [scar.id]
    }
    case 'relic-wait': {
      const bind = facts.find((f) => f.kind === 'relic-bind')
      const death = deaths.find((d) => d.actors[0] === bind?.actors[0])
      if (!bind || !death) return null
      slots.hero = nameOf(death)
      slots.place = placeOf(death)
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
      // U26⑥ Q4-C:默契只在首次升星或 3★ 时讲;旧事实缺 stars 不讲
      const bond = facts.find((f) => f.kind === 'bond-star' && (f.refs.stars === 1 || f.refs.stars === 3))
      if (!bond || bond.actors.length < 2) return null
      slots.a = nameOf(bond, 0)
      slots.b = nameOf(bond, 1)
      slots.stars = bond.refs.stars
      return [bond.id]
    }
  }
}
