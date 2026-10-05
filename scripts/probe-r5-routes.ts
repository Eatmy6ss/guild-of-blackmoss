// R5.1 探针 worker(由 probe-r5-routes.ts esbuild 打包后运行)。
// 走真实 sim(moveTo/enterNodeConditions/triggerAfterElite),语义随代码走。
// REWARDS_LIVE:R5.1a 落地后置 true——折算表里的地形回报/精英回报项生效(改动前=0)。
import { BLACKMOSS, RUSTMINE } from '../src/data/dungeons'
import { generateMap, nextOptions } from '../src/sim/dungeon-map'
import { moveTo } from '../src/sim/run'
import { triggerAfterElite } from '../src/sim/conditions'
import { createRng } from '../src/sim/rng'

const REWARDS_LIVE = false

// —— 金等价折算表(探针仪器,前后一致;HANDOFF 记录)——
const ITEM_V = 120
const BLESSING_V = 25
const HEAL_V = 30
const MASTERY_V = 10
const EXP_V = 1
const CHILL_COST = 8
const EXPOSED_COST = 15
const SOAKED_COST = 60
const TIRED_COST = 20
const LOST_COST = 15
const ELITE_HARD = 20
const STARTLE_FLIP_COST = 10
const ELITE_PREMIUM = 30 /*金×2*/ + 9 * EXP_V /*验×2*/ + MASTERY_V /*熟练+2 而非 +1*/ + 15 /*品质下限*/
const GRAVE_REWARD = 2 * BLESSING_V
const CAMP_REWARD = HEAL_V
const WATER_BATTLE = 0.5 * (0.12 * ITEM_V)
const WATER_NONBATTLE = 0.25 * ITEM_V
const WILD_BATTLE = MASTERY_V
const SOAKED_UPSIDE = 10
const CHILL_UPSIDE = 5
const EXPOSED_UPSIDE = 0.12 * ITEM_V
const TIRED_UPSIDE = 10
const LOST_UPSIDE = 5

const RISK_TERRAINS = new Set(['water', 'wild', 'camp', 'grave'])
const SEEDS = Number(process.env.PROBE_SEEDS ?? 300)
const MASTERY = 0 // 首探档位:触发率 ×1(最坏情形,对应「98% 挂路况」)

function elitesOf(run: { map: { layers: { kind: string }[][] } }): number {
  return run.map.layers.flat().filter((n) => n.kind === 'elite').length
}

function walk(dungeon: typeof BLACKMOSS, seed: number, strategy: 'averse' | 'seeking'): { net: number; conds: number } {
  const map = generateMap(dungeon, seed)
  const run = {
    kind: 'dungeon', dungeonId: dungeon.id, id: `probe-${seed}`,
    map, path: [] as string[], nodeId: '', conditions: [] as string[],
    potions: { heal: 3, fury: 3 }, rng: createRng((seed ^ 0x9e3779b9) >>> 0),
  }
  let net = 0
  let guard = 0
  while (guard++ < 40) {
    const opts = nextOptions(map, run.nodeId)
    if (opts.length === 0) break
    const risk = opts.filter((o) => o.kind !== 'boss' && RISK_TERRAINS.has(o.terrain))
    const safe = opts.filter((o) => o.kind !== 'boss' && !RISK_TERRAINS.has(o.terrain))
    const pick = (strategy === 'averse' ? (safe[0] ?? opts[0]) : (risk[0] ?? opts[0]))!
    const condsBefore = new Set(run.conditions)
    const elitesBefore = elitesOf(run)
    moveTo(run as never, pick.id, MASTERY)
    // —— 回报(进入节点时;R5.1a 前不存在=0)——
    if (REWARDS_LIVE) {
      if (pick.terrain === 'grave') net += GRAVE_REWARD
      if (pick.terrain === 'camp') net += CAMP_REWARD
      if (pick.terrain === 'water' && pick.kind !== 'battle' && pick.kind !== 'elite' && pick.kind !== 'boss') net += WATER_NONBATTLE
    }
    // —— 战斗节点计分 ——
    if (pick.kind === 'battle' || pick.kind === 'elite') {
      net += BATTLE_GOLD_WAVE
      if (pick.kind === 'elite') {
        net += REWARDS_LIVE ? ELITE_PREMIUM : 0
        net -= ELITE_HARD
        triggerAfterElite(run as never)
        net -= Math.max(0, elitesOf(run) - elitesBefore) * STARTLE_FLIP_COST
      }
      if (run.conditions.includes('chill')) { net -= CHILL_COST; if (REWARDS_LIVE) net += CHILL_UPSIDE }
      if (run.conditions.includes('exposed')) { net -= EXPOSED_COST; if (REWARDS_LIVE) net += EXPOSED_UPSIDE }
      if (REWARDS_LIVE && pick.terrain === 'water') net += WATER_BATTLE
      if (REWARDS_LIVE && pick.terrain === 'wild') net += WILD_BATTLE
    }
    // —— 状态获得的固定折价/好处 ——
    for (const c of run.conditions) {
      if (condsBefore.has(c)) continue
      if (c === 'soaked') { net -= SOAKED_COST; if (REWARDS_LIVE) net += SOAKED_UPSIDE }
      if (c === 'tired') { net -= TIRED_COST; if (REWARDS_LIVE) net += TIRED_UPSIDE }
      if (c === 'lost') { net -= LOST_COST; if (REWARDS_LIVE) net += LOST_UPSIDE }
    }
    if (pick.kind === 'boss') break
  }
  return { net, conds: run.conditions.length }
}
const BATTLE_GOLD_WAVE = 30

function probe(name: string, dungeon: typeof BLACKMOSS): void {
  let averseNet = 0, seekNet = 0, averseConds = 0, seekConds = 0
  let averseHit = 0, seekHit = 0
  for (let i = 0; i < SEEDS; i++) {
    const a = walk(dungeon, i * 313 + 11, 'averse')
    const s = walk(dungeon, i * 313 + 11, 'seeking')
    averseNet += a.net; averseConds += a.conds; if (a.conds > 0) averseHit++
    seekNet += s.net; seekConds += s.conds; if (s.conds > 0) seekHit++
  }
  const a = averseNet / SEEDS, s = seekNet / SEEDS
  console.log(`${name}: 避险 avg=${a.toFixed(1)} (路况/趟 ${(averseConds / SEEDS).toFixed(2)},挂路况 ${(averseHit / SEEDS * 100).toFixed(0)}%) | 趋险 avg=${s.toFixed(1)} (路况/趟 ${(seekConds / SEEDS).toFixed(2)},挂路况 ${(seekHit / SEEDS * 100).toFixed(0)}%) | 净分差(趋险−避险)=${(s - a).toFixed(1)}`)
}

console.log(`R5.1 路线探针(REWARDS_LIVE=${REWARDS_LIVE},${SEEDS} seeds/策略/副本)`)
probe('黑苔沼泽', BLACKMOSS)
probe('锈坑矿道', RUSTMINE)
