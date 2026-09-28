import type { BattleState, BossMechanicDef, Combatant, MechanicKind } from './types'
import { recordScarMechanic } from './scars'
import { applyHit, battleRandom, controlResist, enemyToCombatant as mkEnemy, pushLog } from './combat'

// One entry owns execution, intent and documentation. Runtime remains keyed by kind;
// data must not attach two mechanisms of the same kind to one enemy or boss.
export type MechanicRuntime = NonNullable<Combatant['mech']>[string]
export interface MechanicCtx {
  state: BattleState
  self: Combatant
  def: BossMechanicDef
  rt: MechanicRuntime
  sibling(kind: MechanicKind): MechanicRuntime
}
export interface MechanicIntentCtx {
  tick: number
  self: Combatant
  def: BossMechanicDef
  rt: Readonly<MechanicRuntime>
}
export type MechanicIntent =
  | { type: 'none' }
  | { type: 'telegraph' }
  | { type: 'cast'; interruptible: false }
  | { type: 'cast'; interruptible: true; breakDamage: number; taken: number }
  | { type: 'invuln' }
export interface MechanicSpec {
  kind: MechanicKind
  label: string
  counter: string
  defaults: Readonly<Record<string, number>>
  describe(def: BossMechanicDef): string
  step(ctx: MechanicCtx): void
  intent(ctx: MechanicIntentCtx): MechanicIntent
}

export function optionalMechanicParam(def: BossMechanicDef, key: string): number | undefined {
  const raw = def.params[key]
  const value = typeof raw === 'string' ? Number(raw) : raw
  return typeof value === 'number' && Number.isFinite(value) ? value : MECHANIC_REGISTRY[def.kind].defaults[key]
}
export function mechanicParam(def: BossMechanicDef, key: string): number {
  const value = optionalMechanicParam(def, key)
  if (value === undefined) throw new Error('Missing mechanism parameter: ' + def.kind + '.' + key)
  return value
}
/** Default thresholds are part of the declaration, just like explicit parameters. */
export function interruptThreshold(def: BossMechanicDef): number | undefined {
  return optionalMechanicParam(def, 'breakDamage')
}
const activeWindow = ({ tick, rt }: MechanicIntentCtx): boolean => rt.until !== undefined && tick < rt.until
const noIntent = (): MechanicIntent => ({ type: 'none' })
function castIntent(ctx: MechanicIntentCtx): MechanicIntent {
  if (!activeWindow(ctx)) return noIntent()
  const threshold = interruptThreshold(ctx.def)
  return threshold === undefined ? { type: 'cast', interruptible: false } :
    { type: 'cast', interruptible: true, breakDamage: threshold, taken: ctx.rt.taken ?? 0 }
}

/** Damage at until - 1 counts; damage at until does not. Resolve interruption first. */
export function stepCastWindow(ctx: MechanicCtx, opts: {
  castTicks: number
  everyTicks: number
  firstTick: number
  startLog: string
  onComplete(ctx: MechanicCtx): void
}): void {
  const { state, self, def, rt } = ctx
  if (rt.until !== undefined) {
    const threshold = interruptThreshold(def)
    if (threshold !== undefined && (rt.taken ?? 0) >= threshold) {
      delete rt.until
      rt.taken = 0
      rt.next = state.tick + opts.everyTicks
      state.events.push({ tick: state.tick, type: 'interrupted', targetId: self.id })
      pushLog(state, 'guild', '集火奏效！' + self.name + ' 的【' + def.name + '】被打断了！')
    } else if (state.tick >= rt.until) {
      delete rt.until
      rt.next = state.tick + opts.everyTicks
      opts.onComplete(ctx)
    }
  } else if ((rt.next ?? opts.firstTick) <= state.tick) {
    rt.until = state.tick + opts.castTicks
    rt.taken = 0
    state.events.push({ tick: state.tick, type: 'casting', targetId: self.id, amount: opts.castTicks })
    pushLog(state, 'enemy', opts.startLog)
  }
}
function castMechanic(spec: Omit<MechanicSpec, 'step' | 'intent'> & {
  startAtDefault?: true
  startLog(ctx: MechanicCtx): string
  onComplete(ctx: MechanicCtx): void
}): MechanicSpec {
  return { ...spec, intent: castIntent, step: (ctx) => stepCastWindow(ctx, {
    castTicks: mechanicParam(ctx.def, 'castTicks'),
    everyTicks: mechanicParam(ctx.def, 'everyTicks'),
    firstTick: spec.startAtDefault ? spec.defaults.firstTick : mechanicParam(ctx.def, 'firstTick'),
    startLog: spec.startLog(ctx),
    onComplete: spec.onComplete,
  }) }
}
function sec(ticks: number): string {
  const s = ticks / 10
  return Number.isInteger(s) ? s + ' 秒' : s.toFixed(1) + ' 秒'
}
const pct = (x: number): string => Math.round(x * 100) + '%'

export const MECHANIC_REGISTRY: Record<MechanicKind, MechanicSpec> = {
  'telegraph-aoe': {
    kind: 'telegraph-aoe',
    label: '读条范围技',
    counter: '看到读条切【分散】站位,伤害大幅降低',
    defaults: { everyTicks: 150, damage: 40, firstTick: 100, telegraphTicks: 30 },
    describe(m) {
      const dmg = mechanicParam(m, 'damage')
      const tele = mechanicParam(m, 'telegraphTicks')
      const every = mechanicParam(m, 'everyTicks')
      return `每 ${sec(every)} 一轮:吟唱 ${sec(tele)} 后重击全队(${dmg} 伤)——读条时切【分散】可大幅减伤`
    },
    step({ state, self: c, def: m, rt }) {
      if (rt.until !== undefined) {
        if (state.tick >= rt.until) {
          delete rt.until
          rt.next = state.tick + mechanicParam(m, 'everyTicks')
          rt.resolvedAt = state.tick
          resolveSlam(state, c, mechanicParam(m, 'damage'), m.name, m.params.damageType === 'fire')
        }
      } else if ((rt.next ?? mechanicParam(m, 'firstTick')) <= state.tick) {
        rt.until = state.tick + mechanicParam(m, 'telegraphTicks')
        state.events.push({
          tick: state.tick,
          type: 'telegraph',
          targetId: c.id,
          amount: mechanicParam(m, 'telegraphTicks'),
        })
        pushLog(state, 'enemy', `${c.name} 开始蓄力【${m.name}】——分散可以减伤！`)
      }
    },
    intent: (ctx) => activeWindow(ctx) ? { type: 'telegraph' } : noIntent(),
  },
  'cast-buff': castMechanic({
    kind: 'cast-buff',
    label: '强化咏唱',
    counter: '集火打断——读条期间打出足够伤害即可中断',
    defaults: { everyTicks: 240, attackBuff: 8, durationTicks: 120, breakDamage: 450, firstTick: 90, castTicks: 25 },
    describe(m) {
      const cast = mechanicParam(m, 'castTicks')
      const buff = mechanicParam(m, 'attackBuff')
      const dur = mechanicParam(m, 'durationTicks')
      const brk = mechanicParam(m, 'breakDamage')
      return `周期咏唱 ${sec(cast)}:完成则自身攻击 +${buff}(持续 ${sec(dur)})——咏唱期间累计打出 ${brk} 伤即可打断`
    },
    startLog: ({ self: c, def: m }) => `${c.name} 开始咏唱【${m.name}】——集火可以打断！`,
    onComplete({ state, self: c, def: m }) {
      c.buffAttack = mechanicParam(m, 'attackBuff')
      c.buffUntil = state.tick + mechanicParam(m, 'durationTicks')
      pushLog(state, 'enemy', `${c.name} 的【${m.name}】咏唱完成，攻击力提升！`)
    },
  }),
  'cast-heal': castMechanic({
    kind: 'cast-heal',
    label: '治疗咏唱',
    counter: '快打断,它在治疗全家',
    defaults: { breakDamage: 450, everyTicks: 240, healAmount: 200, firstTick: 90, castTicks: 30 },
    describe(m) {
      const cast = mechanicParam(m, 'castTicks')
      const heal = mechanicParam(m, 'healAmount')
      const brk = mechanicParam(m, 'breakDamage')
      return `周期咏唱 ${sec(cast)}:完成则全体敌军回复 ${heal}——咏唱期间累计打出 ${brk} 伤即可打断`
    },
    startLog: ({ self: c, def: m }) => `${c.name} 开始咏唱【${m.name}】——快打断，它在治疗全家！`,
    onComplete({ state, self: c, def: m }) {
      const amount = mechanicParam(m, 'healAmount')
      const allies = state.combatants.filter((x) => x.alive && x.team === c.team)
      for (const a of allies) {
        const healed = Math.min(a.maxHp - a.hp, amount)
        if (healed <= 0) continue
        a.hp += healed
        state.events.push({ tick: state.tick, type: 'heal', attackerId: c.id, targetId: a.id, amount: healed })
      }
      pushLog(state, 'enemy', `${c.name} 的【${m.name}】咏唱完成，伤势在血光中愈合！`)
    },
  }),
  'slow-touch': {
    kind: 'slow-touch',
    label: '霜寒被动',
    counter: '命中会冻慢目标——被减速的前排靠治疗与药水兜底',
    defaults: { chance: 0.35, ticks: 30 },
    describe(m) {
      const chance = mechanicParam(m, 'chance')
      const ticks = mechanicParam(m, 'ticks')
      return `普攻有 ${pct(chance)} 概率冻慢目标 ${sec(ticks)}(普攻间隔加倍)——前排被减速时靠治疗/药水兜底`
    },
    step() {
      // 被动霜寒:普攻命中概率减速目标(处理在 combat.dealDamage,这里只负责机制存在性)
    },
    intent: noIntent,
  },
  'pull': {
    kind: 'pull',
    label: '拉拽',
    counter: '后排会被拽到前排——留意被拽走的人,救援归位',
    defaults: { everyTicks: 240, durationTicks: 600 },
    describe(m) {
      const every = mechanicParam(m, 'everyTicks')
      const dur = mechanicParam(m, 'durationTicks')
      return `每约 ${sec(every)} 把一名后排拽到前排,持续 ${sec(dur)}——后排不再绝对安全`
    },
    step({ state, self: c, def: m, rt }) {
      // 拉拽:把一个后排成员拽到前排(阵型意义实时化——后排不再绝对安全)
      if ((rt.next ?? 120) <= state.tick) {
        rt.next = state.tick + mechanicParam(m, 'everyTicks')
        const backs = state.combatants.filter((x) => x.alive && x.team === 'guild' && x.position === 'back')
        if (backs.length > 0) {
          const victim = backs[Math.floor(battleRandom(state) * backs.length)]
          if (victim.originalPosition === undefined) victim.originalPosition = victim.position
          victim.position = 'front'
          victim.pulledUntilTick = state.tick + mechanicParam(m, 'durationTicks')
          recordScarMechanic(c, victim)
          state.events.push({ tick: state.tick, type: 'pulled', targetId: victim.id })
          pushLog(state, 'enemy', `${c.name} 的【${m.name}】把 ${victim.name} 拽到了前排!`)
        }
      }
    },
    intent: noIntent,
  },
  'ground-zone': castMechanic({
    kind: 'ground-zone',
    startAtDefault: true, // This mechanism did not accept a firstTick parameter before migration.
    label: '地面效果区',
    counter: '咏唱完成瞬间保持【分散】即可脱身,集火也可打断',
    defaults: { everyTicks: 300, durationTicks: 120, breakDamage: 200, castTicks: 30, firstTick: 150 },
    describe(m) {
      const cast = mechanicParam(m, 'castTicks')
      const dur = mechanicParam(m, 'durationTicks')
      const brk = mechanicParam(m, 'breakDamage')
      return `咏唱 ${sec(cast)} 后毒雾漫开,泡在里面 ${sec(dur)} 内持续掉血——读完条的瞬间保持【分散】即可脱身(累计 ${brk} 伤也可打断)`
    },
    startLog: ({ self: c, def: m }) => `${c.name} 开始咏唱【${m.name}】——分散可以提前脱离!`,
    onComplete({ state, self: c, def: m }) {
      const escaped = state.commands.stance === 'spread'
      for (const g of state.combatants.filter((x) => x.alive && x.team === 'guild')) {
        if (!escaped) g.zonedUntilTick = state.tick + mechanicParam(m, 'durationTicks')
      }
      state.events.push({ tick: state.tick, type: 'zoned', targetId: c.id, amount: escaped ? 0 : 1 })
      pushLog(state, 'enemy', escaped ? `【${m.name}】漫开——分散的队伍站在了毒雾之外!` : `【${m.name}】漫开,队伍泡在毒雾里——分散可以脱身!`)
    },
  }),
  'phase-invuln': {
    kind: 'phase-invuln',
    label: '相位无敌',
    counter: '无敌期攻击穿身而过——别浪费爆发,转火或备药',
    defaults: { everyTicks: 320, durationTicks: 30 },
    describe(m) {
      const every = mechanicParam(m, 'everyTicks')
      const dur = mechanicParam(m, 'durationTicks')
      return `每约 ${sec(every)} 相位化一次,持续 ${sec(dur)} 免疫一切伤害——无敌期别浪费爆发`
    },
    step({ state, self: c, def: m, rt }) {
      // 相位无敌:周期性免疫伤害数秒——集火窗口失效,该转火或交药
      if ((rt.next ?? 200) <= state.tick) {
        rt.next = state.tick + mechanicParam(m, 'everyTicks')
        rt.until = state.tick + mechanicParam(m, 'durationTicks')
        c.invulnUntilTick = rt.until
        state.events.push({ tick: state.tick, type: 'phase', targetId: c.id })
        pushLog(state, 'enemy', `${c.name} 进入【${m.name}】,一切攻击穿身而过!`)
      }
    },
    intent: (ctx) => activeWindow(ctx) ? { type: 'invuln' } : noIntent(),
  },
  'summon': {
    kind: 'summon',
    label: '召唤增援',
    counter: '增援出现及时切火,别让它们围住治疗',
    defaults: { recoveryTicks: 0, atHpPct: 0.6, atTickFallback: 260, count: 2 },
    describe(m) {
      const at = mechanicParam(m, 'atHpPct')
      const count = mechanicParam(m, 'count')
      return `血量首次降到 ${pct(at)} 时呼唤 ${count} 名增援——出现后及时切火`
    },
    step({ state, self: c, def: m, rt, sibling }) {
      const spacing = mechanicParam(m, 'recoveryTicks')
      const slam = spacing > 0 ? sibling('telegraph-aoe') : undefined
      const hasWindow = spacing === 0 || (slam?.until === undefined &&
        state.tick >= (slam?.resolvedAt ?? -spacing) + spacing)
      // 机制登场保障:血量线 OR 时间兜底(默认 26s)——战斗变长/打不穿的局里增援照样登场
      if (!rt.fired && hasWindow && (c.hp / c.maxHp <= mechanicParam(m, 'atHpPct') || state.tick >= mechanicParam(m, 'atTickFallback'))) {
        rt.fired = 1
        if (spacing > 0) {
          const aoe = sibling('telegraph-aoe')
          aoe.next = Math.max(aoe.next ?? 0, state.tick + spacing)
        }
        const pool = c.summonPool ?? []
        const count = mechanicParam(m, 'count')
        for (let i = 0; i < count && i < pool.length; i++) {
          const add = mkEnemy(pool[i])
          for (const a of state.combatants) {
            if (a.team === 'guild' && a.alive) add.threat[a.id] = a.role === 'tank' ? 100 : 0
          }
          state.combatants.push(add)
        }
        state.events.push({ tick: state.tick, type: 'summoned', targetId: c.id })
        pushLog(state, 'enemy', `${c.name} 呼唤了增援！`)
      }
    },
    intent: noIntent,
  },
  'bind': {
    kind: 'bind',
    label: '束缚',
    counter: '被点名者无法行动——治疗药与减伤备好',
    defaults: { atHpPct: 0.5, atTickFallback: 260, bindTicks: 30, damage: 20 },
    describe(m) {
      const at = mechanicParam(m, 'atHpPct')
      const bind = mechanicParam(m, 'bindTicks')
      const dmg = mechanicParam(m, 'damage')
      return `血量首次降到 ${pct(at)} 时束缚一名非坦克约 ${sec(bind)}(韧性可减免)并造成 ${dmg} 伤——备好治疗`
    },
    step({ state, self: c, def: m, rt }) {
      if (!rt.fired && (c.hp / c.maxHp <= mechanicParam(m, 'atHpPct') || state.tick >= mechanicParam(m, 'atTickFallback'))) {
        rt.fired = 1
        const candidates = state.combatants.filter(
          (x) => x.alive && x.team === 'guild' && x.role !== 'tank',
        )
        if (candidates.length > 0) {
          const victim = candidates[Math.floor(battleRandom(state) * candidates.length)]
          const ticks = controlResist(victim, mechanicParam(m, 'bindTicks'))
          victim.boundUntilTick = state.tick + ticks
          recordScarMechanic(c, victim)
          applyHit(state, c, victim, mechanicParam(m, 'damage'), '束缚')
          state.events.push({
            tick: state.tick,
            type: 'bound',
            targetId: victim.id,
            amount: ticks,
          })
          pushLog(
            state,
            'enemy',
            `${c.name} 释放【${m.name}】，${victim.name} 被束缚 ${ticks / 10} 秒！`,
          )
        }
      }
    },
    intent: noIntent,
  },
  'enrage': {
    kind: 'enrage',
    label: '狂暴软墙',
    counter: '拖延即灾难——尽快压血,别和它耗',
    defaults: { atTick: 280, attackMult: 2 },
    describe(m) {
      const at = mechanicParam(m, 'atTick')
      const mult = mechanicParam(m, 'attackMult')
      return `战斗拖过 ${sec(at)} 后狂暴,攻击 ×${mult}——拖延即灾难,全力压血`
    },
    step({ state, self: c, def: m, rt }) {
      if (!rt.fired && state.tick >= mechanicParam(m, 'atTick')) {
        rt.fired = 1
        c.attack = Math.round(c.attack * mechanicParam(m, 'attackMult'))
        state.events.push({ tick: state.tick, type: 'enraged', targetId: c.id })
        pushLog(state, 'enemy', `☠ ${c.name} 陷入狂暴,攻击力大幅提升!`)
      }
    },
    intent: noIntent,
  },
  'breath-charge': {
    kind: 'breath-charge',
    label: '蓄力吐息',
    counter: '只烧前排——坦克开减伤顶住,后排安心输出',
    defaults: { everyTicks: 160, damage: 30, telegraphTicks: 30 },
    describe(m) {
      const tele = mechanicParam(m, 'telegraphTicks')
      const dmg = mechanicParam(m, 'damage')
      const every = mechanicParam(m, 'everyTicks')
      return `每 ${sec(every)} 蓄力 ${sec(tele)} 后重创前排(${dmg} 伤)——【分散】无效,前排开减伤/换坦顶住`
    },
    step({ state, self: c, def: m, rt }) {
      // 蓄力吐息(版图二):telegraph 后重击【前排】——分散无效,坦克减伤/换位才是答案
      if (rt.until !== undefined) {
        if (state.tick >= rt.until) {
          delete rt.until
          rt.next = state.tick + mechanicParam(m, 'everyTicks')
          const front = state.combatants.filter((x) => x.alive && x.team === 'guild' && x.position === 'front')
          const dmg = mechanicParam(m, 'damage')
          for (const f of front) applyHit(state, c, f, dmg, m.name)
          state.events.push({ tick: state.tick, type: 'damage', attackerId: c.id, targetId: front[0]?.id ?? '', amount: dmg })
          pushLog(state, 'enemy', front.length > 0 ? `${c.name} 的【${m.name}】吞没了前排!` : `${c.name} 的【${m.name}】喷了个空。`)
        }
      } else if ((rt.next ?? 120) <= state.tick) {
        rt.until = state.tick + mechanicParam(m, 'telegraphTicks')
        state.events.push({ tick: state.tick, type: 'telegraph', targetId: c.id, amount: mechanicParam(m, 'telegraphTicks') })
        pushLog(state, 'enemy', `${c.name} 深吸一口气,喉间亮起熔光——【${m.name}】要来了,前排顶住!`)
      }
    },
    intent: (ctx) => activeWindow(ctx) ? { type: 'cast', interruptible: false } : noIntent(),
  },
  'fear-aura': castMechanic({
    kind: 'fear-aura',
    startAtDefault: true,
    label: '龙威光环',
    counter: '集火打断咏唱,否则全队出伤下降',
    defaults: { everyTicks: 240, durationTicks: 200, breakDamage: 110, castTicks: 30, firstTick: 180 },
    describe(m) {
      const cast = mechanicParam(m, 'castTicks')
      const dur = mechanicParam(m, 'durationTicks')
      const brk = mechanicParam(m, 'breakDamage')
      return `周期咏唱 ${sec(cast)}:完成则全队出伤 ×0.85(持续 ${sec(dur)})——咏唱期间累计打出 ${brk} 伤即可打断`
    },
    startLog: ({ self: c, def: m }) => `${c.name} 开始咏唱【${m.name}】——打断它,别让龙威压过来!`,
    onComplete({ state, self: c, def: m }) {
      for (const g of state.combatants) {
        if (g.alive && g.team === 'guild') {
          g.fearUntilTick = state.tick + mechanicParam(m, 'durationTicks')
          recordScarMechanic(c, g)
        }
      }
      state.events.push({ tick: state.tick, type: 'enraged', targetId: c.id })
      pushLog(state, 'enemy', `${c.name} 的【${m.name}】扩散开来——队伍的手脚变沉了!`)
    },
  }),
}

/** 震地猛击结算：分散阵型下每人只受 30%，其中一人承伤一半（风险分摊） */
function resolveSlam(state: BattleState, boss: Combatant, damage: number, name: string, fire = false): void {
  const spread = state.commands.stance === 'spread'
  const members = state.combatants.filter((x) => x.alive && x.team === 'guild')
  if (members.length === 0) return
  const tankIdx = Math.floor(battleRandom(state) * members.length)
  for (let i = 0; i < members.length; i++) {
    const resistance = fire ? 1 - Math.min(0.75, Math.max(0, members[i].fireResist ?? 0)) : 1
    const dmg = Math.max(1, Math.round(damage * resistance * (spread ? (i === tankIdx ? 0.5 : 0.1) : 1)))
    applyHit(state, boss, members[i], dmg, `${name}命中`)
  }
  // 指挥 payoff 事件:减伤与否必须让演出层看见——这是「我的指令救了全队」的可见回报
  state.events.push({ tick: state.tick, type: 'slam', targetId: boss.id, amount: damage, mitigated: spread })
  pushLog(
    state,
    'enemy',
    spread ? `【${name}】落下——分散阵型大幅减伤！` : `【${name}】命中全队！`,
  )
}

/** Queries do not allocate or modify mechanism runtime. */
export function mechanicIntents(state: Pick<BattleState, 'tick'>, self: Combatant): MechanicIntent[] {
  if (!self.alive) return []
  return (self.bossMechanics ?? []).map(def => MECHANIC_REGISTRY[def.kind].intent({
    tick: state.tick, self, def, rt: self.mech?.[def.kind] ?? {},
  }))
}
export function mechanicBrief(def: BossMechanicDef): string {
  return MECHANIC_REGISTRY[def.kind].describe(def)
}
