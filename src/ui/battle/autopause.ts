import type { BattleEvent, BattleState } from '../../sim/types'

// U42 #9.4 自动暂停(博德之门 1/2 式):从战斗事件推导"要不要停下来让玩家看一眼"。
// 纯函数,无 React/LlocalStorage 依赖;3 秒同因去重与战斗开始的一次性触发在调用点(App)。

export interface AutoPausePrefs {
  /** ①首领/精英开始读条或预警 */
  bossCast: boolean
  /** ②队员生命低于 30% */
  lowHp: boolean
  /** ③队员倒下 */
  allyDown: boolean
  /** ④战斗开始 */
  battleStart: boolean
}

export const AUTOPAUSE_KEY = 'gg-autopause'

export const AUTOPAUSE_LABELS: Record<keyof AutoPausePrefs, string> = {
  bossCast: '首领读条',
  lowHp: '低血30%',
  allyDown: '队员倒下',
  battleStart: '战斗开始',
}

export const AUTOPAUSE_KEYS = ['bossCast', 'lowHp', 'allyDown', 'battleStart'] as const

/** 解析 localStorage 存的偏好;缺项/形态非法 = null(回落按战斗类型的默认)。 */
export function parseAutoPause(raw: string | null): AutoPausePrefs | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Record<string, unknown>
    if (!v || typeof v !== 'object') return null
    if (!AUTOPAUSE_KEYS.every((k) => typeof v[k] === 'boolean')) return null
    return { bossCast: v.bossCast as boolean, lowHp: v.lowHp as boolean, allyDown: v.allyDown as boolean, battleStart: v.battleStart as boolean }
  } catch {
    return null
  }
}

/** 默认:首领和精英战开①②③,杂兵战全关(④两类都默认关,想用时自己开)。 */
export function defaultAutoPause(isBossOrElite: boolean): AutoPausePrefs {
  return isBossOrElite
    ? { bossCast: true, lowHp: true, allyDown: true, battleStart: false }
    : { bossCast: false, lowHp: false, allyDown: false, battleStart: false }
}

export function saveAutoPause(p: AutoPausePrefs): void {
  try { localStorage.setItem(AUTOPAUSE_KEY, JSON.stringify(p)) } catch { /* 会话级回落 */ }
}

export interface AutoPauseHit {
  kind: keyof AutoPausePrefs
  /** 画面中央的原因文本(如「已暂停:塔尔玛开始咏唱 渊底低语」) */
  text: string
}

/** 从本批新事件推导自动暂停判定(按事件顺序取第一命中)。 */
export function detectAutoPause(events: BattleEvent[], battle: BattleState, prefs: AutoPausePrefs): AutoPauseHit | null {
  for (const ev of events) {
    if (prefs.allyDown && ev.type === 'death') {
      const u = battle.combatants.find((c) => c.id === ev.targetId)
      if (u?.team === 'guild' && u.memberId) return { kind: 'allyDown', text: `已暂停:${u.name} 倒下了` }
    }
    if (prefs.bossCast && (ev.type === 'casting' || ev.type === 'telegraph')) {
      const caster = battle.combatants.find((c) => c.id === ev.targetId)
      if (caster && caster.team === 'enemy' && caster.alive && (caster.boss || caster.elite)) {
        const mech = caster.bossMechanics?.find((m) => {
          const rt = caster.mech?.[m.kind]
          return rt?.until !== undefined && battle.tick < rt.until
        })
        const verb = ev.type === 'casting' ? '开始咏唱' : '开始蓄力'
        return { kind: 'bossCast', text: `已暂停:${caster.name} ${verb} ${mech?.name ?? '机制'}` }
      }
    }
    if (prefs.lowHp && ev.type === 'damage') {
      const u = battle.combatants.find((c) => c.id === ev.targetId)
      if (u?.team === 'guild' && u.memberId && u.alive && u.hp / u.maxHp < 0.3) {
        return { kind: 'lowHp', text: `已暂停:${u.name} 生命低于 30%` }
      }
    }
  }
  return null
}
