import { describe, it, expect } from 'vitest'
import { GUILD_EVENTS } from '../data/guild-events'
import { DUNGEONS } from '../data/dungeons'
import { REGIONS } from '../data/regions'
import { ITEM_BASES } from '../data/items'
import { eventPool, consequenceFiresIn, consequenceOf, SECOND_ACT_IDS, eventCount } from './guild-events'
import type { TerrainId } from './dungeon-map'

// R1.4 事件分池·数据校验(U27④ / redesign R1.4 验收 / events-draft §2.4)

const TERRAINS: TerrainId[] = ['water', 'wild', 'road', 'camp', 'under', 'ruin', 'grave', 'sanctum', 'lava']
const DUNGEON_IDS = DUNGEONS.map((d) => d.id)
const REGION_IDS = REGIONS.map((r) => r.id)

const delayedTargets = (): { source: string; eventId: string; at: 'town' | 'dungeon'; dungeonId?: string }[] =>
  GUILD_EVENTS.flatMap((e) =>
    e.choices.flatMap((c) =>
      c.outcomes
        .map((o) => o.effects?.delayed)
        .filter(Boolean)
        .map((d) => ({ source: e.id, eventId: d!.eventId, at: d!.at, dungeonId: d!.dungeonId })),
    ),
  )

describe('R1.4 事件 scope 数据校验', () => {
  it('每个事件都有合法 scope;dungeon/terrain 引用真实 id', () => {
    for (const e of GUILD_EVENTS) {
      const s = e.scope
      expect(s, e.id).toBeDefined()
      if (s.kind === 'dungeon') {
        expect(s.ids.length, e.id).toBeGreaterThan(0)
        for (const id of s.ids) expect(DUNGEON_IDS, `${e.id} → ${id}`).toContain(id)
      } else if (s.kind === 'terrain') {
        expect(s.terrains.length, e.id).toBeGreaterThan(0)
        for (const t of s.terrains) expect(TERRAINS, `${e.id} → ${t}`).toContain(t)
        if (s.regions) for (const r of s.regions) expect(REGION_IDS, `${e.id} → ${r}`).toContain(r)
      }
    }
  })

  it('延迟链:目标存在、不自环、at 合法;dungeonId 限定真实副本', () => {
    const targets = delayedTargets()
    expect(targets.length).toBeGreaterThanOrEqual(15)
    for (const t of targets) {
      expect(GUILD_EVENTS.some((e) => e.id === t.eventId), `${t.source} → ${t.eventId}`).toBe(true)
      expect(t.eventId, `${t.source} 自环`).not.toBe(t.source)
      expect(['town', 'dungeon'], t.source).toContain(t.at)
      if (t.dungeonId !== undefined) {
        expect(t.at, t.source).toBe('dungeon')
        expect(DUNGEON_IDS, t.source).toContain(t.dungeonId)
      }
    }
  })

  it('标题带「幕」的事件都被至少一条 delayed 指向(无孤儿第二幕)', () => {
    const targeted = new Set(delayedTargets().map((t) => t.eventId))
    for (const e of GUILD_EVENTS) {
      if (e.title.includes('幕')) {
        expect(targeted.has(e.id), `${e.id} 是孤儿后续幕`).toBe(true)
      }
    }
  })

  it('cult-reckoning(新第三幕)只由 cult-vengeance 进入,不进随机池', () => {
    expect(SECOND_ACT_IDS.has('cult-reckoning')).toBe(true)
    expect(consequenceOf('cult-reckoning')).toEqual({ at: 'dungeon', dungeonId: 'dragonmaw' })
    expect(eventPool({ where: 'node', dungeonId: 'dragonmaw' }).some((e) => e.id === 'cult-reckoning')).toBe(false)
  })

  it('带 dungeonId 的链指向正确副本(events-draft §2.2 #3 #7 #10)', () => {
    expect(consequenceFiresIn('knight-chapel', 'ashfield')).toBe(true)
    expect(consequenceFiresIn('knight-chapel', 'blackmoss')).toBe(false)
    expect(consequenceFiresIn('egg-hatch', 'fireridge')).toBe(true)
    expect(consequenceFiresIn('egg-hatch', 'emberpass')).toBe(false)
    expect(consequenceFiresIn('cult-reckoning', 'dragonmaw')).toBe(true)
    // 不带 dungeonId 的 dungeon 档:任何副本的 event 节点都算
    expect(consequenceFiresIn('ghost-harvest', 'blackmoss')).toBe(true)
    expect(consequenceFiresIn('ghost-harvest', 'emberpass')).toBe(true)
    // town 档:不在副本节点触发
    expect(consequenceFiresIn('ransom-aftermath', 'blackmoss')).toBe(false)
  })

  it('回城池 = town 全集;节点池永不含 town(events-draft §2.3 warehouse-thief 落地)', () => {
    const town = eventPool({ where: 'town' })
    expect(town.every((e) => e.scope.kind === 'town')).toBe(true)
    expect(town.some((e) => e.id === 'warehouse-thief')).toBe(true)
    for (const d of DUNGEON_IDS) {
      expect(eventPool({ where: 'node', dungeonId: d }).some((e) => e.scope.kind === 'town'), d).toBe(false)
    }
  })

  it('每个副本「专属 + 本版图地形(region 级,R1.4 口径)」≥ 4;审定稿表格数字成立', () => {
    const regionOf = (id: string) => REGIONS.find((r) => [...r.main, ...r.side, r.finale].includes(id))?.id
    for (const d of DUNGEONS) {
      const own = GUILD_EVENTS.filter((e) => e.scope.kind === 'dungeon' && e.scope.ids.includes(d.id) && !SECOND_ACT_IDS.has(e.id))
      const terrain = GUILD_EVENTS.filter(
        (e) => e.scope.kind === 'terrain' && (!e.scope.regions || e.scope.regions.includes(regionOf(d.id) as never)) && !SECOND_ACT_IDS.has(e.id),
      )
      expect(own.length + terrain.length, `${d.id}: 专属 ${own.length} + 地形 ${terrain.length}`).toBeGreaterThanOrEqual(4)
    }
    // events-draft §1 表格抽点
    const ownOf = (id: string) => GUILD_EVENTS.filter((e) => e.scope.kind === 'dungeon' && e.scope.ids.includes(id))
    expect(ownOf('frostgrave').map((e) => e.id).sort()).toEqual(['fg-frozen-scout', 'fg-gravedigger', 'fg-ice-hand'])
    expect(ownOf('thornhold').map((e) => e.id).sort()).toEqual(['th-deserter-deal', 'th-old-banner'])
    expect(ownOf('dragonmaw').map((e) => e.id).sort()).toEqual(['cult-purge', 'cult-reckoning', 'cult-vengeance', 'dm-offering', 'dm-shed-scale'])
    expect(ownOf('scalehaven').map((e) => e.id).sort()).toEqual(['dragon-cult', 'sh-alms-table', 'sh-hymn'])
    expect(ownOf('emberpass').map((e) => e.id).sort()).toEqual(['dragon-cult', 'pilgrim-alms'])
  })

  it('新事件的 item 都存在于 ITEM_BASES(events-draft §2.4)', () => {
    const newIds = ['fg-ice-hand', 'fg-gravedigger', 'fg-frozen-scout', 'th-deserter-deal', 'th-old-banner', 'dm-offering', 'dm-shed-scale', 'sh-alms-table', 'sh-hymn', 'pp-roadstone', 'pp-borrowed-lamp', 'rm-knocking', 'af-silent-horn', 'bm-mud-peddler', 'fo-stubborn-blank', 'cult-reckoning']
    expect(newIds.length).toBe(16)
    for (const e of GUILD_EVENTS) {
      for (const c of e.choices) {
        for (const o of c.outcomes) {
          const item = o.effects?.item
          if (item) expect(ITEM_BASES[item], `${e.id} → ${item}`).toBeDefined()
        }
      }
    }
  })

  it('事件总数 = 89 + 16, encyclopedia 完整', () => {
    expect(eventCount()).toBe(89 + 16)
  })
})
