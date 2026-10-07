// B3-3 怪物词缀(U22,D2 式遭遇层):唯一入口 rollMonsterAffixes。
// 红线(U22 断言):①定义不得出现数值倍率字段(机制参数来自注册表 defaults + 结构性补丁);
// ②kind 必须是机制注册表已登记的 kind(不新增);③每条 counters.gear/counters.skill 非空;
// ④可见性三层=名牌后缀/进场提示/触发提示(触发提示由机制 startLog/step 日志承载)。
// 四通道(注册表扩展,不新增 kind):enrage.hpBelow(血怒)/cast-buff 同伴护盾(圣咏)/
// onDeath 钩子执行已登记 kind(亡语→ground-zone)/pull 后排指定(猎首)。

import type { MechanicKind } from './types'

export type MonsterAffixId = 'bloodrage' | 'hymn' | 'deathwarg' | 'headhunt'

export interface MonsterAffixDef {
  id: MonsterAffixId
  name: string
  desc: string
  /** 挂到词缀怪身上的机制 kind(注册表已登记) */
  kind: MechanicKind
  /** 结构性参数补丁(无数值倍率;heal/shield 类为效果对象而非伤害倍率) */
  params: Record<string, unknown>
  /** 亡语:为 true 时该机制在死亡瞬间执行一次(其余为进场即生效/周期) */
  onDeath?: boolean
  /** U22 断言:针对答案必须成对给出 */
  counters: { gear: string; skill: string }
}

export const MONSTER_AFFIXES: Record<MonsterAffixId, MonsterAffixDef> = {
  bloodrage: {
    id: 'bloodrage', name: '血怒',
    desc: '生命跌破三成即狂暴——压血节奏错了就是灾难',
    kind: 'enrage',
    params: { hpBelow: 0.3, attackMult: 1.6 },
    counters: { gear: '减伤/护盾件(磐心·吸收盾)拖过爆发窗', skill: '铁壁卫士嘲讽+戒律牧减伤循环' },
  },
  hymn: {
    id: 'hymn', name: '圣咏',
    desc: '咏唱为同伴套盾——打断它,或者带上破盾手段',
    kind: 'cast-buff',
    params: { allyShield: 30, everyTicks: 300, breakDamage: 400 },
    counters: { gear: '锤斧打断(伤害打满读条)/破甲', skill: '打断系招牌技(锁足冲锋/破咒盾击)' },
  },
  deathwarg: {
    id: 'deathwarg', name: '亡语',
    desc: '死亡时留下腐蚀之地——站进去就是持续掉血',
    kind: 'ground-zone',
    params: { onDeath: true, everyTicks: 0, radius: 1, dps: 6, ticks: 120 },
    onDeath: true,
    counters: { gear: '火抗/移速件快速离开地面', skill: '分散阵型拉开,治疗预铺血线' },
  },
  headhunt: {
    id: 'headhunt', name: '猎首',
    desc: '专拽后排的治疗与弓手——后排不再绝对安全',
    kind: 'pull',
    params: { backline: true, everyTicks: 260, durationTicks: 600 },
    counters: { gear: '长柄替身挡击/速度件走位', skill: '集火压制+坦克威压拉回仇恨' },
  },
}

export interface MonsterAffixRoll { affixId: MonsterAffixId; enemyIndex: number }

/** 唯一入口(#3.3):进节点/层时 roll 本场怪物词缀。densityBonus=词缀密度规则(B3-2)时上限 +1。
 *  返回逐条 { affixId, enemyIndex }(enemyIndex=本场敌人数组下标,同敌人可叠 1 条,总条数≤上限)。 */
export function rollMonsterAffixes(enemyCount: number, densityBonus: boolean, rng: () => number): MonsterAffixRoll[] {
  if (enemyCount <= 0) return []
  const max = densityBonus ? 3 : 2
  const count = Math.min(max, 1 + (rng() < 0.45 ? 1 : 0)) // C4 占位:基础 1 条 45%/加 1 条
  const out: MonsterAffixRoll[] = []
  const usedAffix = new Set<MonsterAffixId>()
  const usedEnemy = new Set<number>()
  const ids = Object.keys(MONSTER_AFFIXES) as MonsterAffixId[]
  for (let i = 0; i < count; i++) {
    const affixPool = ids.filter((id) => !usedAffix.has(id))
    const enemyPool = [0, 1, 2].filter((e) => e < enemyCount && !usedEnemy.has(e))
    if (!affixPool.length || !enemyPool.length) break
    const affixId = affixPool[Math.floor(rng() * affixPool.length)]!
    const enemyIndex = enemyPool[Math.floor(rng() * enemyPool.length)]!
    usedAffix.add(affixId)
    usedEnemy.add(enemyIndex)
    out.push({ affixId, enemyIndex })
  }
  return out
}

/** 名牌后缀(可见性第一层):「沼泽蛙人·血怒」 */
export function affixedName(baseName: string, affixIds: MonsterAffixId[]): string {
  return affixIds.length ? `${baseName}·${affixIds.map((id) => MONSTER_AFFIXES[id].name).join('')}` : baseName
}

/** 可见性第二层:进场提示(U22 红线:词缀怪杀人前必须可见) */
export function enterLog(affixIds: MonsterAffixId[], enemyName: string): string[] {
  return affixIds.map((id) => `⚠ ${enemyName} 携带【${MONSTER_AFFIXES[id].name}】——${MONSTER_AFFIXES[id].desc}`)
}

/** 侦查分级(B3-4):揭示级 0=只知名牌条数/1=词缀名/2+=完整描述;情报封锁 −1 */
export function revealAffixText(affixIds: MonsterAffixId[], revealLevel: number): string {
  if (affixIds.length === 0) return ''
  if (revealLevel <= 0) return `${affixIds.length} 条词缀`
  if (revealLevel === 1) return affixIds.map((id) => MONSTER_AFFIXES[id].name).join('/')
  return affixIds.map((id) => `${MONSTER_AFFIXES[id].name}(${MONSTER_AFFIXES[id].counters.gear.split('/')[0]}可解)`).join('/')
}

/** U22 断言:定义合法性(无数值倍率字段/counters 成对/kind 已登记) */
export function assertMonsterAffixes(registeredKinds: readonly string[]): void {
  const banned = ['attackMult', 'damageMult', 'hpMult', 'powerMult']
  for (const def of Object.values(MONSTER_AFFIXES)) {
    if (!registeredKinds.includes(def.kind)) throw new Error(`词缀 ${def.id} 引用未登记 kind:${def.kind}`)
    for (const key of Object.keys(def.params)) {
      if (banned.some((b) => key.toLowerCase().includes(b))) throw new Error(`词缀 ${def.id} 携带数值倍率字段:${key}`)
    }
    if (!def.counters.gear || !def.counters.skill) throw new Error(`词缀 ${def.id} counters 不完整`)
  }
}
