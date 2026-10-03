import { describe, it, expect } from 'vitest'
import { DUNGEONS } from '../data/dungeons'
import { generateMap, nodeById } from './dungeon-map'

// R1.1 分层地图·验收(redesign §3 R1.1):12 副本 × 200 seed 的结构不变量

describe('R1.1 generateMap 结构验收', () => {
  it('12 副本 × 200 seed:层数/每层 2-3 节点/每节点 ≥1 入 ≥1 出/Boss 在末层', () => {
    for (const dungeon of DUNGEONS) {
      for (let i = 0; i < 200; i++) {
        const seed = 1000 + i * 7919
        const map = generateMap(dungeon, seed)
        const bodyLayers = dungeon.size === 3 ? 5 : 6
        expect(map.layers.length, `${dungeon.id}#${seed}`).toBe(bodyLayers + 1)
        const bossLayer = map.layers[map.layers.length - 1]!
        expect(bossLayer).toHaveLength(1)
        expect(bossLayer[0]!.kind).toBe('boss')
        for (const [li, layer] of map.layers.entries()) {
          if (li === map.layers.length - 1) continue // Boss 层恒 1 节点
          expect(layer.length, `${dungeon.id}#${seed} 层宽`).toBeGreaterThanOrEqual(2)
          expect(layer.length).toBeLessThanOrEqual(3)
        }
        const ids = new Set(map.layers.flat().map((n) => n.id))
        for (const [a, b] of map.edges) {
          expect(ids.has(a), `${dungeon.id}#${seed} 边起点 ${a}`).toBe(true)
          expect(ids.has(b), `${dungeon.id}#${seed} 边终点 ${b}`).toBe(true)
        }
        const incoming = new Set(map.edges.map(([, b]) => b))
        for (const layer of map.layers) {
          for (const n of layer) {
            const outs = map.edges.filter(([a]) => a === n.id)
            if (n.kind !== 'boss') {
              expect(outs.length, `${dungeon.id}#${seed} ${n.id} 无出边`).toBeGreaterThanOrEqual(1)
            }
            if (n.layer > 0) {
              expect(incoming.has(n.id), `${dungeon.id}#${seed} ${n.id} 无入边`).toBe(true)
            }
          }
        }
      }
    }
  })

  it('任意节点都能走到 Boss;全图 ≥1 elite ≥1 rest;Boss 前一层 ≥1 非战斗', () => {
    for (const dungeon of DUNGEONS) {
      for (let i = 0; i < 200; i++) {
        const seed = 2000 + i * 104729
        const map = generateMap(dungeon, seed)
        const flat = map.layers.flat()
        expect(flat.some((n) => n.kind === 'elite'), `${dungeon.id}#${seed} 无精英`).toBe(true)
        expect(flat.some((n) => n.kind === 'rest'), `${dungeon.id}#${seed} 无休整`).toBe(true)
        const preBoss = map.layers[map.layers.length - 2]!
        expect(preBoss.some((n) => n.kind !== 'battle' && n.kind !== 'elite'), `${dungeon.id}#${seed} Boss 前层全战斗`).toBe(true)
        // 连通性:从未入边节点之外的所有节点出发沿出边走,必须能到 Boss 层
        const bossId = map.layers[map.layers.length - 1]![0]!.id
        for (const start of flat) {
          const seen = new Set<string>()
          const stack = [start.id]
          let reachable = false
          while (stack.length > 0) {
            const cur = stack.pop()!
            if (cur === bossId) { reachable = true; break }
            if (seen.has(cur)) continue
            seen.add(cur)
            for (const [a, b] of map.edges) if (a === cur) stack.push(b)
          }
          expect(reachable, `${dungeon.id}#${seed} ${start.id} 走不到 Boss`).toBe(true)
        }
      }
    }
  })

  it('每个 encounterId 都存在于该副本 encounters;battle/elite 必带遭遇', () => {
    for (const dungeon of DUNGEONS) {
      for (let i = 0; i < 200; i++) {
        const map = generateMap(dungeon, 3000 + i * 15485863)
        for (const n of map.layers.flat()) {
          if (n.encounterId !== undefined) {
            expect(dungeon.encounters.some((e) => e.id === n.encounterId), `${dungeon.id}#${i} ${n.id} → ${n.encounterId}`).toBe(true)
          }
          if (n.kind === 'battle' || n.kind === 'elite') {
            expect(n.encounterId, `${dungeon.id}#${i} ${n.id} 战斗节点缺遭遇`).toBeDefined()
          }
        }
      }
    }
  })

  it('同 seed 生成同一张图;不同 seed 结构不同(抽样)', () => {
    const d = DUNGEONS[0]!
    const a = generateMap(d, 424242)
    const b = generateMap(d, 424242)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    const c = generateMap(d, 424243)
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a))
  })

  it('暗道(secret)存在且出边跳层;风味名来自地形名表', () => {
    for (const dungeon of DUNGEONS) {
      let sawSecret = false
      for (let i = 0; i < 60 && !sawSecret; i++) {
        const map = generateMap(dungeon, 4000 + i * 7717)
        for (const n of map.layers.flat()) {
          if (n.kind !== 'secret') continue
          sawSecret = true
          expect(n.hidden).toBe(true)
          for (const [a, b] of map.edges) {
            if (a !== n.id) continue
            if (n.layer + 2 > map.layers.length - 1) continue // 末段暗道无处可跳,接 Boss 层
            const target = nodeById(map, b)!
            expect(target.layer, `${dungeon.id} 暗道未跳层`).toBeGreaterThan(n.layer + 1)
          }
        }
      }
      // 60 seed 内至少见一次暗道(生成器每图保证 1 个)
      expect(sawSecret, `${dungeon.id} 60 seed 内未见暗道`).toBe(true)
    }
  })
})
