// 公会基地(M1 P2,宪法红线 1:内容皆数据)——建筑建在灵魂层之上,效果喂数据给现有系统。
// 升级消耗金币(祠堂加英灵祝福),价格随等级上扬。

export interface BuildingDef {
  id: string
  name: string
  icon: string
  desc: string
  maxLevel: number
  /** 升到 level+1 的花费(索引 = 当前等级) */
  costs: Array<{ gold: number; blessing?: number }>
}

export const BUILDINGS: BuildingDef[] = [
  {
    id: 'training',
    name: '训练场',
    icon: '🏕',
    desc: '每级:远征经验 +10%;2 级:替补跟操(替补获出征人均经验的一半)',
    maxLevel: 3,
    costs: [{ gold: 100 }, { gold: 220 }, { gold: 400 }],
  },
  {
    id: 'tavern',
    name: '酒馆扩建',
    icon: '🍺',
    desc: '每级:访客率 +8%;2 级起上门候选 +1 级',
    maxLevel: 3,
    costs: [{ gold: 120 }, { gold: 260 }, { gold: 450 }],
  },
  {
    id: 'smithy',
    name: '铁匠铺',
    icon: '⚒',
    desc: '1 级:重铸词条;每级:变卖价 +15%,出征维护费 −15%',
    maxLevel: 3,
    costs: [{ gold: 90 }, { gold: 200 }, { gold: 360 }],
  },
  {
    id: 'shrine',
    name: '祠堂',
    icon: '🕯',
    desc: '1 级:遗物传承(六成赎回费让后辈接走遗物);每级:阵亡祝福 +1,庆功宴士气 +5',
    maxLevel: 3,
    costs: [{ gold: 80, blessing: 3 }, { gold: 180, blessing: 5 }, { gold: 320, blessing: 8 }],
  },
  {
    id: 'infirmary',
    name: '疗养所',
    icon: '⛺',
    desc: '每级:高塔层间休整回复 +5%',
    maxLevel: 3,
    costs: [{ gold: 110 }, { gold: 240 }, { gold: 420 }],
  },
  {
    id: 'dormitory',
    name: '宿舍',
    icon: '🛏',
    desc: '#4.4 建筑重分工:每级名册上限 +1,休息日精力恢复 +15%',
    maxLevel: 3,
    costs: [{ gold: 80 }, { gold: 180 }, { gold: 320 }],
  },
]

/** 建筑等级 → 各系统加成(唯一的效果汇总处,App 与测试都用它) */
export interface BaseEffects {
  expMult: number
  visitorChance: number
  visitorLevelBonus: number
  sellMult: number
  blessingPerDeath: number
  feastBoost: number
  towerRestHealPct: number
  /** #4.4 宿舍:名册上限(基础 6 + 每级 1) */
  rosterCap: number
  /** #4.4 宿舍:休息日精力恢复倍率 */
  staminaRestMult: number
}

export function baseEffects(buildings: Record<string, number>): BaseEffects {
  const lv = (id: string) => buildings[id] ?? 0
  return {
    expMult: 1 + lv('training') * 0.1,
    visitorChance: 0.55 + lv('tavern') * 0.08,
    visitorLevelBonus: lv('tavern') >= 2 ? 1 : 0,
    sellMult: 1 + lv('smithy') * 0.15,
    blessingPerDeath: 3 + lv('shrine'),
    feastBoost: 30 + lv('shrine') * 5,
    towerRestHealPct: 0.2 + lv('infirmary') * 0.05,
    rosterCap: 6 + lv('dormitory'),
    staminaRestMult: 1 + lv('dormitory') * 0.15,
  }
}
