import type { BattleState, Combatant } from './types'
import { applyHit, battleRandom, enemyToCombatant as mkEnemy, pushLog } from './combat'

// boss 机制引擎（D8-9）：解释 BossMechanicDef 数据。
// 每个机制对应一个团长指令（Q27 映射）：
//   telegraph-aoe → 阵型分散    cast-buff → 集火打断
//   summon        → 集火切换    bind      → 治疗药/撤退赌博
//   enrage        → 爆发药/撤退
// 机制运行时状态存在 combatant.mech[kind]，键为机制 kind（每 boss 每类一个）。

function mech(c: Combatant, kind: string): { until?: number; next?: number; taken?: number; fired?: number } {
  if (!c.mech) c.mech = {}
  if (!c.mech[kind]) c.mech[kind] = {}
  return c.mech[kind]
}

function num(v: number | string | undefined, fallback: number): number {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback
}

export function processBossMechanics(state: BattleState): void {
  for (const c of state.combatants) {
    if (!c.alive || !c.bossMechanics) continue
    for (const m of c.bossMechanics) {
      const rt = mech(c, m.kind)
      switch (m.kind) {
        case 'telegraph-aoe': {
          if (rt.until !== undefined) {
            if (state.tick >= rt.until) {
              delete rt.until
              rt.next = state.tick + num(m.params.everyTicks, 150)
              resolveSlam(state, c, num(m.params.damage, 40))
            }
          } else if ((rt.next ?? 100) <= state.tick) {
            rt.until = state.tick + num(m.params.telegraphTicks, 30)
            state.events.push({
              tick: state.tick,
              type: 'telegraph',
              targetId: c.id,
              amount: num(m.params.telegraphTicks, 30),
            })
            pushLog(state, 'enemy', `${c.name} 开始蓄力【${m.name}】——分散可以减伤！`)
          }
          break
        }
        case 'cast-buff': {
          if (rt.until !== undefined) {
            if (state.tick >= rt.until) {
              delete rt.until
              rt.next = state.tick + num(m.params.everyTicks, 240)
              c.buffAttack = num(m.params.attackBuff, 8)
              c.buffUntil = state.tick + num(m.params.durationTicks, 120)
              pushLog(state, 'enemy', `${c.name} 的【${m.name}】咏唱完成，攻击力提升！`)
            } else if ((rt.taken ?? 0) >= num(m.params.breakDamage, 450)) {
              delete rt.until
              rt.taken = 0
              rt.next = state.tick + num(m.params.everyTicks, 240)
              state.events.push({ tick: state.tick, type: 'interrupted', targetId: c.id })
              pushLog(state, 'guild', `集火奏效！${c.name} 的【${m.name}】被打断了！`)
            }
          } else if ((rt.next ?? 90) <= state.tick) {
            const castTicks = num(m.params.castTicks, 25)
            rt.until = state.tick + castTicks
            rt.taken = 0
            state.events.push({ tick: state.tick, type: 'casting', targetId: c.id, amount: castTicks })
            pushLog(state, 'enemy', `${c.name} 开始咏唱【${m.name}】——集火可以打断！`)
          }
          break
        }
        case 'summon': {
          if (!rt.fired && c.hp / c.maxHp <= num(m.params.atHpPct, 0.6)) {
            rt.fired = 1
            const pool = c.summonPool ?? []
            const count = num(m.params.count, 2)
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
          break
        }
        case 'bind': {
          if (!rt.fired && c.hp / c.maxHp <= num(m.params.atHpPct, 0.5)) {
            rt.fired = 1
            const candidates = state.combatants.filter(
              (x) => x.alive && x.team === 'guild' && x.role !== 'tank',
            )
            if (candidates.length > 0) {
              const victim = candidates[Math.floor(battleRandom(state) * candidates.length)]
              const ticks = num(m.params.bindTicks, 30)
              victim.boundUntilTick = state.tick + ticks
              applyHit(state, c, victim, num(m.params.damage, 20), '束缚')
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
          break
        }
        case 'enrage': {
          if (!rt.fired && state.tick >= num(m.params.atTick, 280)) {
            rt.fired = 1
            c.attack = Math.round(c.attack * num(m.params.attackMult, 2))
            state.events.push({ tick: state.tick, type: 'enraged', targetId: c.id })
            pushLog(state, 'enemy', `☠ ${c.name} 陷入狂暴，攻击力大幅提升！`)
          }
          break
        }
      }
    }
  }
}

/** 震地猛击结算：分散阵型下每人只受 30%，其中一人承伤一半（风险分摊） */
function resolveSlam(state: BattleState, boss: Combatant, damage: number): void {
  const spread = state.commands.stance === 'spread'
  const members = state.combatants.filter((x) => x.alive && x.team === 'guild')
  if (members.length === 0) return
  const tankIdx = Math.floor(battleRandom(state) * members.length)
  for (let i = 0; i < members.length; i++) {
    const dmg = Math.max(1, Math.round(damage * (spread ? (i === tankIdx ? 0.5 : 0.1) : 1)))
    applyHit(state, boss, members[i], dmg, '震地猛击命中')
  }
  // 指挥 payoff 事件:减伤与否必须让演出层看见——这是「我的指令救了全队」的可见回报
  state.events.push({ tick: state.tick, type: 'slam', targetId: boss.id, amount: damage, mitigated: spread })
  pushLog(
    state,
    'enemy',
    spread ? '【震地猛击】落下——分散阵型大幅减伤！' : '【震地猛击】命中全队！',
  )
}

/** boss 意图查询(指挥台按钮「战况脉冲」用):蓄力中 → 该切分散;咏唱中 → 该集火打断 */
export function bossIntents(state: BattleState): {
  telegraphing: boolean
  casting: boolean
  casterId?: string
} {
  let telegraphing = false
  let casting = false
  let casterId: string | undefined
  for (const c of state.combatants) {
    if (!c.alive || !c.bossMechanics) continue
    for (const m of c.bossMechanics) {
      const rt = c.mech?.[m.kind]
      if (rt?.until === undefined) continue
      if (m.kind === 'telegraph-aoe') telegraphing = true
      if (m.kind === 'cast-buff') {
        casting = true
        casterId = c.id
      }
    }
  }
  return { telegraphing, casting, casterId }
}
