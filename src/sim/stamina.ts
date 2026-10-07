// 批次 4 #4.1 精力系统(IMPLEMENTATION-PLAN §7,制作人 2026-10-08 指示推进):
// 公会 KPI 从「战力」改为「可持续出勤人数」——精力只能靠天数恢复,主力必须休息,替补必须上场。
// 数值全部 C4 占位;普通掉血零风险同款纪律:衰减只在软地板以下生效,老档 undefined=满精力零变。

import type { Member } from './types'

export const STAMINA = {
  /** 每场远征战斗消耗(幸存者全员) */
  perBattle: 8,
  /** 每过一天恢复(出发日推进时,全体存活) */
  restPerDay: 20,
  /** 软地板:低于此值出衰减 */
  softFloor: 40,
  /** 软地板以下攻击倍率 */
  attackMultBelow: 0.85,
  /** 软地板以下创伤触发加成(绝对值,加在 rollScarChance 结果上) */
  scarBonusBelow: 0.1,
  /** 精力上限 */
  cap: 100,
  /** #4.3 撤退额外精力惩罚(C4 占位;撤退=保命但更累,叠加在当日消耗之上) */
  retreatExtra: 12,
} as const

/** 读取(老档 undefined=100 满精力,零迁移零变) */
export function staminaOf(m: Pick<Member, 'stamina'>): number {
  return m.stamina ?? STAMINA.cap
}

/** 场次消耗(结算侧调用;下限 0) */
export function spendStamina(m: Member, battles = 1): void {
  m.stamina = Math.max(0, staminaOf(m) - STAMINA.perBattle * battles)
}

/** 天数恢复(出发日推进时全体存活;上限 cap)——精力唯一恢复途径;mult=#4.4 宿舍加成 */
export function restStamina(members: Member[], days = 1, mult = 1): void {
  for (const m of members) {
    if (m.alive) m.stamina = Math.min(STAMINA.cap, staminaOf(m) + Math.round(STAMINA.restPerDay * mult) * days)
  }
}

/** #4.3 撤退额外精力惩罚(撤退结算时对幸存者调用) */
export function spendRetreatStamina(m: Member): void {
  m.stamina = Math.max(0, staminaOf(m) - STAMINA.retreatExtra)
}

/** 软地板以下攻击衰减(接线 3:toCombatant 攻击乘区) */
export function staminaAttackMult(m: Pick<Member, 'stamina'>): number {
  return staminaOf(m) < STAMINA.softFloor ? STAMINA.attackMultBelow : 1
}

/** 软地板以下创伤触发加成(接线:settleScars) */
export function staminaScarBonus(m: Pick<Member, 'stamina'>): number {
  return staminaOf(m) < STAMINA.softFloor ? STAMINA.scarBonusBelow : 0
}

/** 面板读数(成员卡/档案用) */
export function staminaLabel(m: Pick<Member, 'stamina'>): string {
  const v = staminaOf(m)
  return v < STAMINA.softFloor ? `⚡${v}(疲惫——攻击衰减,易添创伤)` : `⚡${v}`
}
