import { describe, expect, it } from 'vitest'
import { DUNGEONS } from './dungeons'
import { ROUTE_CONDITIONS } from './conditions'
import { TERRAIN_REWARDS, terrainRewardOf } from './terrain-rewards'
import { terrainEntryReward } from '../sim/conditions'
import { generateMap, type MapNode } from '../sim/dungeon-map'
import { createRng } from '../sim/rng'
import { generateMember } from '../sim/gen'
import type { Member } from '../sim/types'

// R5.1a 验收(U33①):每个副本 ≥2 种风险地形;地形回报当场兑现(祝福/回复/捞装备);
// 战斗节点倍率(掉落 ×1.5/熟练 ×2)由 settlement 消费——settlement 侧断言在 settlement.test.ts。

const RISK_TERRAINS = new Set(ROUTE_CONDITIONS.filter((c) => c.trigger === 'terrain' && c.from).flatMap((c) => c.from!))

describe('风险地形覆盖(R5.1a/U33①)', () => {
  it('每个副本至少 2 种风险地形', () => {
    expect(DUNGEONS.length).toBe(12)
    for (const d of DUNGEONS) {
      const risks = (Object.keys(d.terrains) as (keyof typeof d.terrains)[]).filter((t) => RISK_TERRAINS.has(t))
      expect(risks.length, `${d.id} 风险地形不足:${risks.join(',')}`).toBeGreaterThanOrEqual(2)
    }
  })

  it('回报表覆盖四类风险地形且描述非空', () => {
    for (const t of ['water', 'wild', 'grave', 'camp'] as const) {
      const r = terrainRewardOf(t)
      expect(r, `地形 ${t} 缺回报`).toBeDefined()
      expect(r!.desc.length).toBeGreaterThan(4)
    }
    // 中性地形无回报
    expect(terrainRewardOf('road')).toBeUndefined()
    expect(terrainRewardOf('lava')).toBeUndefined()
    expect(TERRAIN_REWARDS.sanctum).toBeUndefined()
  })
})

function fakeRun(dungeonId: string, seed: number) {
  const map = generateMap({ ...DUNGEONS[0], id: dungeonId }, seed)
  return { kind: 'dungeon', dungeonId, id: 't1', map, path: [], nodeId: '', conditions: [] as string[], potions: { heal: 2, fury: 1 }, rng: createRng(seed) } as never
}

function roster(n = 2): Member[] {
  return (['guard', 'priest'] as const).slice(0, n).map((job, i) => {
    const m = generateMember(job, 5, 700 + i)
    m.hp = Math.round(m.hp * 0.4) // 受伤状态,回血可见
    return m
  })
}

function nodeOf(terrain: string, kind: MapNode['kind'] = 'rest'): MapNode {
  return { id: 'T', layer: 0, terrain: terrain as MapNode['terrain'], kind, name: '测试节点' }
}

describe('terrainEntryReward(R5.1a)', () => {
  it('墓地:祝福 +2,不改血量', () => {
    const run = fakeRun('blackmoss', 42)
    const mem = roster()
    const out = terrainEntryReward(run, nodeOf('grave'), mem)
    expect(out.blessing).toBe(2)
    expect(out.item).toBeNull()
    expect(out.notes.join()).toContain('祝福 +2')
  })

  it('营地:全队回 15% 最大生命', () => {
    const run = fakeRun('blackmoss', 43)
    const mem = roster()
    const out = terrainEntryReward(run, nodeOf('camp'), mem)
    expect(out.healedNames.length).toBe(2)
    expect(out.notes.join()).toContain('15%')
    for (const m of mem) expect(m.hp).toBeGreaterThan(Math.round(m.hp * 0.4) - 1)
  })

  it('水域非战斗节点:25% 捞一件装备(rng 钉死两侧)', () => {
    const hit = fakeRun('blackmoss', 44)
    const outHit = terrainEntryReward(hit, nodeOf('water'), roster(), undefined, () => 0.1)
    expect(outHit.item).not.toBeNull()
    const miss = fakeRun('blackmoss', 45)
    const outMiss = terrainEntryReward(miss, nodeOf('water'), roster(), undefined, () => 0.9)
    expect(outMiss.item).toBeNull()
  })

  it('水域战斗节点:入口不捞装备(掉落 ×1.5 归 settlement)', () => {
    const run = fakeRun('blackmoss', 46)
    const out = terrainEntryReward(run, nodeOf('water', 'battle'), roster(), undefined, () => 0.1)
    expect(out.item).toBeNull()
  })

  it('道路/熔岩:无回报', () => {
    const run = fakeRun('blackmoss', 47)
    const mem = roster()
    for (const t of ['road', 'lava']) {
      const out = terrainEntryReward(run, nodeOf(t), mem)
      expect(out.blessing).toBe(0)
      expect(out.item).toBeNull()
      expect(out.healedNames.length).toBe(0)
    }
  })
})
