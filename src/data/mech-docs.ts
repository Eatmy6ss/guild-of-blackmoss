// boss 机制图鉴(战术手册):MechanicKind → 类型徽章/一句应对 + 参数化明细
// 引擎解释在 sim/mechanics.ts(默认值必须与其 num() 兜底一致);此处为手册可读性数据源
import type { BossMechanicDef, MechanicKind } from '../sim/types'

export interface MechInfo {
  kind: MechanicKind
  /** 机制类型徽章名(数据里的 m.name 是招式名,这里是类型) */
  name: string
  /** 一句团长应对 */
  counter: string
}

export const MECH_INFO: Record<MechanicKind, MechInfo> = {
  'telegraph-aoe': { kind: 'telegraph-aoe', name: '读条范围技', counter: '看到读条切【分散】站位,伤害大幅降低' },
  'cast-buff': { kind: 'cast-buff', name: '强化咏唱', counter: '集火打断——读条期间打出足够伤害即可中断' },
  'cast-heal': { kind: 'cast-heal', name: '治疗咏唱', counter: '快打断,它在治疗全家' },
  'slow-touch': { kind: 'slow-touch', name: '霜寒被动', counter: '命中会冻慢目标——被减速的前排靠治疗与药水兜底' },
  pull: { kind: 'pull', name: '拉拽', counter: '后排会被拽到前排——留意被拽走的人,救援归位' },
  'ground-zone': { kind: 'ground-zone', name: '地面效果区', counter: '咏唱完成瞬间保持【分散】即可脱身,集火也可打断' },
  'phase-invuln': { kind: 'phase-invuln', name: '相位无敌', counter: '无敌期攻击穿身而过——别浪费爆发,转火或备药' },
  summon: { kind: 'summon', name: '召唤增援', counter: '增援出现及时切火,别让它们围住治疗' },
  bind: { kind: 'bind', name: '束缚', counter: '被点名者无法行动——治疗药与减伤备好' },
  enrage: { kind: 'enrage', name: '狂暴软墙', counter: '拖延即灾难——尽快压血,别和它耗' },
}

function n(v: number | string | undefined, fb: number): number {
  const x = typeof v === 'string' ? Number(v) : v
  return typeof x === 'number' && Number.isFinite(x) ? x : fb
}

/** tick → 秒(10 tick/s),整数不带小数点 */
function sec(ticks: number): string {
  const s = ticks / 10
  return Number.isInteger(s) ? `${s} 秒` : `${s.toFixed(1)} 秒`
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`
}

/** 机制明细 → 玩家可读一句话(参数取自数据,默认值与引擎兜底一致) */
export function mechanicBrief(m: BossMechanicDef): string {
  const p = m.params
  switch (m.kind) {
    case 'telegraph-aoe': {
      const dmg = n(p.damage, 30)
      const tele = n(p.telegraphTicks, 30)
      const every = n(p.everyTicks, 100)
      return `每 ${sec(every)} 一轮:吟唱 ${sec(tele)} 后重击全队(${dmg} 伤)——读条时切【分散】可大幅减伤`
    }
    case 'cast-buff': {
      const cast = n(p.castTicks, 30)
      const buff = n(p.attackBuff, 10)
      const dur = n(p.durationTicks, 120)
      const brk = n(p.breakDamage, 110)
      return `周期咏唱 ${sec(cast)}:完成则自身攻击 +${buff}(持续 ${sec(dur)})——咏唱期间累计打出 ${brk} 伤即可打断`
    }
    case 'cast-heal': {
      const cast = n(p.castTicks, 30)
      const heal = n(p.healAmount, 200)
      const brk = n(p.breakDamage, 450)
      return `周期咏唱 ${sec(cast)}:完成则全体敌军回复 ${heal}——咏唱期间累计打出 ${brk} 伤即可打断`
    }
    case 'slow-touch': {
      const chance = n(p.chance, 0.35)
      const ticks = n(p.ticks, 30)
      return `普攻有 ${pct(chance)} 概率冻慢目标 ${sec(ticks)}(行动间隔大减)——前排被减速时靠治疗/药水兜底`
    }
    case 'pull': {
      const every = n(p.everyTicks, 240)
      const dur = n(p.durationTicks, 600)
      return `每约 ${sec(every)} 把一名后排拽到前排,持续 ${sec(dur)}——后排不再绝对安全`
    }
    case 'ground-zone': {
      const cast = n(p.castTicks, 30)
      const dur = n(p.durationTicks, 120)
      const brk = n(p.breakDamage, 200)
      return `咏唱 ${sec(cast)} 后毒雾漫开,泡在里面 ${sec(dur)} 内持续掉血——读完条的瞬间保持【分散】即可脱身(累计 ${brk} 伤也可打断)`
    }
    case 'phase-invuln': {
      const every = n(p.everyTicks, 320)
      const dur = n(p.durationTicks, 30)
      return `每约 ${sec(every)} 相位化一次,持续 ${sec(dur)} 免疫一切伤害——无敌期别浪费爆发`
    }
    case 'summon': {
      const at = n(p.atHpPct, 0.6)
      const count = n(p.count, 2)
      return `血量首次降到 ${pct(at)} 时呼唤 ${count} 名增援——出现后及时切火`
    }
    case 'bind': {
      const at = n(p.atHpPct, 0.5)
      const bind = n(p.bindTicks, 30)
      const dmg = n(p.damage, 20)
      return `血量首次降到 ${pct(at)} 时束缚一名非坦克约 ${sec(bind)}(韧性可减免)并造成 ${dmg} 伤——备好治疗`
    }
    case 'enrage': {
      const at = n(p.atTick, 280)
      const mult = n(p.attackMult, 2)
      return `战斗拖过 ${sec(at)} 后狂暴,攻击 ×${mult}——拖延即灾难,全力压血`
    }
  }
}
