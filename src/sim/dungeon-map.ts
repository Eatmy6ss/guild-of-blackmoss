// 副本分层地图(U27①,redesign R1.1):每趟随机生成,删除固定路线/岔路/「继续深入」。
// 纯函数,不读 App 状态;确定性:同 seed 同图(createRng,不用 Math.random)。
// 生成约束:3 人本 5 层 / 5 人本 6 层 + 末层 Boss;每层 2–3 节点;每节点 ≥1 入边 ≥1 出边;
// 任意节点可通 Boss;全图 ≥1 精英 ≥1 休整;Boss 前一层 ≥1 非战斗节点。

import { createRng, type Rng } from './rng'
import type { DungeonDef } from './types'
import { CONDITION_BY_ID } from '../data/conditions'

/** 地形词表(事件分池草案 §1,九类) */
export type TerrainId = 'water' | 'wild' | 'road' | 'camp' | 'under' | 'ruin' | 'grave' | 'sanctum' | 'lava'

export const TERRAIN_NAMES: Record<TerrainId, string> = {
  water: '水域',
  wild: '林野',
  road: '道路',
  camp: '营地',
  under: '地下',
  ruin: '废墟',
  grave: '墓地',
  sanctum: '圣所',
  lava: '熔岩',
}

export type MapNodeKind = 'battle' | 'elite' | 'event' | 'rest' | 'treasure' | 'secret' | 'boss'

export interface MapNode {
  id: string
  layer: number
  terrain: TerrainId
  kind: MapNodeKind
  /** battle/elite/boss:必须是该副本 encounters 里存在的 id */
  encounterId?: string
  /** U30 补:事件节点绑定固定事件(节点 desc 承诺的内容固定兑现;空=从池里抽) */
  eventId?: string
  /** 风味名,从该副本该地形的名表抽取 */
  name: string
  /** secret(暗道):只有高熟练度可见;走过它跳过一层并开出额外收获(R1.3 消费 hidden) */
  hidden?: boolean
}

export interface DungeonMap {
  seed: number
  layers: MapNode[][]
  edges: [string, string][]
}

export function nodeById(map: DungeonMap, nodeId: string): MapNode | undefined {
  for (const layer of map.layers) {
    const n = layer.find((x) => x.id === nodeId)
    if (n) return n
  }
  return undefined
}

/** 当前可选的下一批节点:空路径 = 第 0 层;否则当前节点的出边(暗道的出边由生成器指向跳层) */
export function nextOptions(map: DungeonMap, nodeId: string): MapNode[] {
  if (!nodeId) return [...(map.layers[0] ?? [])]
  const outs = map.edges.filter(([a]) => a === nodeId).map(([, b]) => b)
  const opts = outs.map((id) => nodeById(map, id)).filter(Boolean) as MapNode[]
  return opts
}

/** 挂机选路(U27①,逻辑住 sim 层不放 App;R5.1f/U33⑧⑤ 修订):
 *  - 读完整揭示档位(含迷途降档——挂机不再看穿迷途);
 *  - 暗道与迷雾同规:档 3 才可见(迷途显形除外),挂机不偷看、不选不可见节点;
 *  - 档位够(tier>0)时优先宝箱,其次能解除当前路况的地形;血少休整/事件,血多精英;
 *  - 低档盲选(只在可见节点里随机)。 */
export function autoPickNode(
  options: MapNode[],
  opts: { tier: number; avgHp: number; rng: Rng; conditions?: string[]; lostReveals?: boolean },
): MapNode | null {
  if (options.length === 0) return null
  const visible = options.filter((o) => !(o.kind === 'secret' && opts.tier < 3 && !opts.lostReveals))
  const pool = visible.length > 0 ? visible : options
  if (opts.tier > 0) {
    const byKind = (k: MapNodeKind) => pool.find((o) => o.kind === k)
    const treasure = byKind('treasure')
    if (treasure) return treasure
    const clearers = pool.filter((o) => (opts.conditions ?? []).some((id) => CONDITION_BY_ID[id]?.clearedBy?.includes(o.terrain)))
    if (clearers.length > 0) return clearers[Math.floor(opts.rng() * clearers.length)]!
    if (opts.avgHp < 0.5) {
      const pick1 = byKind('rest') ?? byKind('event')
      if (pick1) return pick1
    } else if (opts.avgHp > 0.7) {
      const pick1 = byKind('elite')
      if (pick1) return pick1
    }
  }
  return pool[Math.floor(opts.rng() * pool.length)] ?? null
}

function weightedTerrain(dungeon: DungeonDef, rng: Rng): TerrainId {
  const entries = Object.entries(dungeon.terrains) as [TerrainId, { weight: number; names: string[]; encounters: string[] }][]
  const total = entries.reduce((s, [, t]) => s + t.weight, 0)
  let r = rng() * total
  for (const [id, t] of entries) {
    r -= t.weight
    if (r <= 0) return id
  }
  return entries[entries.length - 1]![0]
}

const pickOf = <T,>(rng: Rng, arr: T[]): T => arr[Math.floor(rng() * arr.length)]!

interface GenNode extends MapNode {
  out: string[]
}

/** 预计行程层(主体层+Boss 层;与 generateMap 的层数规则同源——口粮计价/#4.6 时间口径共用) */
export function plannedLayers(dungeon: DungeonDef): number {
  return (dungeon.size === 3 ? 5 : 6) + 1
}

/** 生成一张分层地图。同 seed 同图;保证项由确定性收尾补丁落实。 */
export function generateMap(dungeon: DungeonDef, seed: number): DungeonMap {
  const rng = createRng(seed >>> 0)
  const bodyLayers = dungeon.size === 3 ? 5 : 6
  const bossSeq = dungeon.encounters.filter((e) => e.kind === 'boss')
  const bossEnc = bossSeq[0]?.id ?? dungeon.encounters[dungeon.encounters.length - 1]!.id
  const layers: GenNode[][] = []
  for (let l = 0; l < bodyLayers; l++) {
    const count = 2 + Math.floor(rng() * 2) // 2–3
    const layer: GenNode[] = []
    for (let i = 0; i < count; i++) {
      const terrain = weightedTerrain(dungeon, rng)
      const def = dungeon.terrains[terrain]!
      layer.push({
        id: `L${l}-${i}`,
        layer: l,
        terrain,
        kind: 'battle',
        name: def.names.length > 0 ? pickOf(rng, def.names) : TERRAIN_NAMES[terrain],
        out: [],
      })
    }
    // 护栏:每层保底 1 个可战斗地形节点,否则该层可能全非战斗、全图可能凑不出 elite
    if (!layer.some((n) => (dungeon.terrains[n.terrain]?.encounters.length ?? 0) > 0)) {
      const battleTerrain = (Object.entries(dungeon.terrains) as [TerrainId, { weight: number; names: string[]; encounters: string[] }][])
        .filter(([, t]) => t.encounters.length > 0)
        .sort((a, b) => b[1].weight - a[1].weight)[0]
      if (battleTerrain) {
        const n = layer[0]!
        n.terrain = battleTerrain[0]
        n.name = battleTerrain[1].names.length > 0 ? pickOf(rng, battleTerrain[1].names) : TERRAIN_NAMES[n.terrain]
      }
    }
    layers.push(layer)
  }
  layers.push([{
    id: `L${bodyLayers}-0`,
    layer: bodyLayers,
    terrain: weightedTerrain(dungeon, rng),
    kind: 'boss',
    encounterId: bossEnc,
    name: bossSeq.length > 1 ? `${dungeon.name}·王座` : (bossSeq[0]?.name ?? '深处'),
    out: [],
  }])

  const flat = layers.flat()
  const canBattle = (n: GenNode) => (dungeon.terrains[n.terrain]?.encounters.length ?? 0) > 0

  // —— 非战斗节点铺点(R1.5 pacing:一趟 1–2 层非战斗)——
  for (const layer of layers) {
    if (rng() >= 0.45) continue
    const n = layer[Math.floor(rng() * layer.length)]!
    if (n.kind === 'battle') n.kind = rng() < 0.5 ? 'rest' : 'event'
  }
  // —— 精英 ×1、暗道 ×1、宝箱 ×0-1:都落在可战斗地形的战斗节点上 ——
  const battlePool = () => flat.filter((n) => n.kind === 'battle' && canBattle(n))
  const assignKind = (kind: MapNodeKind) => {
    const pool = battlePool()
    if (pool.length === 0) return
    const n = pickOf(rng, pool)
    n.kind = kind
    n.encounterId = undefined
    if (kind === 'secret') n.hidden = true
  }
  assignKind('elite')
  assignKind('secret')
  if (rng() < 0.6) assignKind('treasure')
  // 战斗/精英节点补遭遇;不可战斗地形上的残留战斗节点降级为休整
  for (const n of flat) {
    if (n.kind !== 'battle' && n.kind !== 'elite') continue
    const encs = dungeon.terrains[n.terrain]?.encounters ?? []
    if (encs.length === 0) { n.kind = 'rest'; n.encounterId = undefined; continue }
    n.encounterId = pickOf(rng, encs)
  }

  // —— U30 补:event 节点绑定固定事件(草案 §4.3「绑定」项)——
  // 新地图节点没有旧 id,按「风味名」绑定:名字来自各地形名表,摇到即固定兑现该事件
  const NODE_EVENT_BINDINGS: Record<string, string> = {
    '路边圣龛': 'dragon-cult',
    '施舍台': 'dragon-cult',
    '渊底低语': 'soul-trade',
  }
  for (const layer of layers) {
    for (const n of layer) {
      if (n.kind === 'event' && NODE_EVENT_BINDINGS[n.name]) n.eventId = NODE_EVENT_BINDINGS[n.name]
    }
  }

  // —— 兜底保证:≥1 elite ≥1 rest;Boss 前一层 ≥1 非战斗 ——
  if (!flat.some((n) => n.kind === 'elite')) {
    const b = flat.find((n) => n.kind === 'battle' && canBattle(n))
    if (b) {
      b.kind = 'elite'
      b.encounterId = pickOf(rng, dungeon.terrains[b.terrain]!.encounters)
    }
  }
  if (!flat.some((n) => n.kind === 'rest')) {
    const b = flat.find((n) => n.kind === 'battle')
    if (b) { b.kind = 'rest'; b.encounterId = undefined }
  }
  const preBoss = layers[bodyLayers - 1]!
  if (preBoss.every((n) => n.kind === 'battle' || n.kind === 'elite')) {
    const b = preBoss.find((n) => n.kind === 'battle') ?? preBoss.find((n) => n.kind === 'elite')
    if (b) { b.kind = 'rest'; b.encounterId = undefined }
  }

  // —— 连边:每节点 1–2 条出边;暗道跳层;下一层每节点 ≥1 入边;末层无出边 ——
  const edges: [string, string][] = []
  const outOf = new Map<string, string[]>()
  for (let l = 0; l < layers.length - 1; l++) {
    const cur = layers[l]!
    const nxt = layers[l + 1]!
    const incoming = new Set<string>()
    for (const n of cur) {
      // 暗道:出边跳过下一层(倒数第二层的暗道直接接 Boss 层)
      const skip = n.kind === 'secret' && l + 2 <= layers.length - 1
      const targets = skip ? layers[l + 2]! : nxt
      const degree = 1 + Math.floor(rng() * 2)
      const shuffled = [...targets].sort(() => rng() - 0.5)
      const picks = shuffled.slice(0, Math.min(degree, shuffled.length))
      outOf.set(n.id, picks.map((t) => t.id))
      for (const t of picks) {
        edges.push([n.id, t.id])
        incoming.add(t.id)
      }
    }
    for (const t of nxt) {
      if (!incoming.has(t.id)) {
        // 回填入边时避开暗道:暗道的出边必须保持跳层语义
        const pool = cur.filter((n) => n.kind !== 'secret')
        const from = pickOf(rng, pool.length > 0 ? pool : cur)
        outOf.get(from.id)!.push(t.id)
        edges.push([from.id, t.id])
        incoming.add(t.id)
      }
    }
  }

  const mapLayers: MapNode[][] = layers.map((layer) => layer.map(({ out: _out, ...n }) => n))
  return { seed: seed >>> 0, layers: mapLayers, edges }
}
