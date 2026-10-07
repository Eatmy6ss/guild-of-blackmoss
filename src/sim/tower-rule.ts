// B3-2 塔规则词缀(U22/#3.2):每 3 层一「段」,进段随机挂 1–2 条,层数越高越多。
// 红线(U22):塔规则只改规则,不给敌人挂机制(敌人机制走怪物词缀)。
// 全部是规则开关:灼热(env)/治疗减半(healTakenMod,#2.7 乘区)/残血开局/禁药(本段药水支取归零)/
// 无营地(段内休整不回血)/情报封锁(怪物词缀侦查 −1,B3-3 消费)/词缀密度(怪物词缀条数上限 +1,B3-3 消费)。

export type TowerRuleId =
  | 'scorching' | 'half-heal' | 'low-start' | 'no-potion'
  | 'no-camp' | 'intel-block' | 'affix-density'

export const TOWER_RULES: Record<TowerRuleId, { name: string; desc: string }> = {
  'scorching': { name: '灼热', desc: '本段灼热笼罩——火抗不足者持续灼烤' },
  'half-heal': { name: '治疗减半', desc: '本段受到的治疗减半' },
  'low-start': { name: '残血开局', desc: '本段每层以六成生命开战' },
  'no-potion': { name: '禁药', desc: '本段药水失效(携带不消耗,但喝不出)' },
  'no-camp': { name: '无营地', desc: '本段层间休整不回复生命' },
  'intel-block': { name: '情报封锁', desc: '本段怪物词缀侦查降一级' },
  'affix-density': { name: '词缀密度', desc: '本段怪物词缀更多' },
}

const ALL: TowerRuleId[] = Object.keys(TOWER_RULES) as TowerRuleId[]

/** 段索引:每 3 层一段(0 起) */
export function towerSegment(floor: number): number {
  return Math.floor((floor - 1) / 3)
}

/** 进段 roll 规则:1 条起步;段位越高,第二条概率越大(min(0.15×段, 0.5),C4 占位) */
export function rollSegmentRules(segment: number, rng: () => number): TowerRuleId[] {
  const count = 1 + (rng() < Math.min(0.5, segment * 0.15) ? 1 : 0)
  const pool = [...ALL]
  const out: TowerRuleId[] = []
  for (let i = 0; i < count && pool.length > 0; i++) {
    const at = Math.floor(rng() * pool.length)
    out.push(pool.splice(at, 1)[0]!)
  }
  return out
}

export function hasRule(rules: TowerRuleId[] | undefined, id: TowerRuleId): boolean {
  return !!rules?.includes(id)
}

/** 段规则的可读一行(收手界面/进场提示用) */
export function describeRules(rules: TowerRuleId[] | undefined): string {
  if (!rules?.length) return '无规则词缀'
  return rules.map((r) => TOWER_RULES[r].name).join('、')
}
