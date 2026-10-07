// 批次 4 #4.2 出征补给成本(IMPLEMENTATION-PLAN §7):口粮(人数×天数)+装备维护——金币出口,
// 治「无脑连刷低级图」。药水成本已由药水经济承担(potionCost),不在本模块重复。
// 数值全部 C4 占位;口粮不足不拦出征(防软锁),代价=扣到 0+全员饿肚子士气惩罚(调用方处理)。

/** 口粮单价:每名队员每预计行程层(C4 占位;预计天数=副本层数,一层约一天行程) */
export const RATION_PER_HEAD_PER_LAYER = 4
/** 装备维护:每场战斗每名幸存者(C4 占位;团灭幸存 0=无维护费可收) */
export const MAINTENANCE_PER_BATTLE_PER_SURVIVOR = 2
/** 铁匠铺每级维护费减免(与 baseEffects.sellMult 同源等级) */
export const SMITHY_MAINT_DISCOUNT_PER_LEVEL = 0.15

/** 出征口粮:人数 × 副本层数 × 单价 */
export function rationCost(headcount: number, layers: number): number {
  return Math.max(0, Math.round(headcount * Math.max(0, layers) * RATION_PER_HEAD_PER_LAYER))
}

/** 装备维护:场数 × 幸存者 × 单价,铁匠铺每级减免(下限 0) */
export function maintenanceCost(battles: number, survivors: number, smithyLevel = 0): number {
  const mult = Math.max(0, 1 - SMITHY_MAINT_DISCOUNT_PER_LEVEL * Math.max(0, smithyLevel))
  return Math.max(0, Math.round(Math.max(0, battles) * Math.max(0, survivors) * MAINTENANCE_PER_BATTLE_PER_SURVIVOR * mult))
}
