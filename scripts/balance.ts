// D13 平衡测试台：用「指挥机器人」模拟会玩的团长，量化各遭遇战的胜率与战斗时长。
// 机器人与手动玩家共用同一套指令接口（setStance/setFocus/药/撤退）——它模拟的是
// "专注但普通"的玩家：反应及时（每 5 tick 看一次场面）、不贪刀、会交药，但手速平平。
//
// 对照组：零指挥（撤退保护默认开）——自动挂机视角，用于确认"指挥台有用"。
//
// 运行：npx esbuild scripts/balance.ts --bundle --platform=node --format=esm --outfile=scripts/balance.mjs && node scripts/balance.mjs
import { generateMember } from '../src/sim/gen'
import { createBattle, stepBattle, setFocus, setStance, useHealPotion, useFuryPotion } from '../src/sim/combat'
import { BLACKMOSS } from '../src/data/dungeons'
import { rollBossDrops } from '../src/sim/loot'
import { equipmentStats } from '../src/sim/loot'
import type { BattleState, Combatant, ItemInstance, Member } from '../src/sim/types'

const addSeenAt = new WeakMap<object, number>()
const JOBS = ['guard', 'priest', 'ranger'] as const
const MAX_TICK = 6000
const ROUNDS = 100

const boss = (b: BattleState) => b.combatants.find((c) => c.bossMechanics)
const isCasting = (b: BattleState) => {
  const rt = boss(b)?.mech?.['cast-buff']
  return rt !== undefined && rt.until !== undefined
}
const isTelegraphing = (b: BattleState) => {
  const rt = boss(b)?.mech?.['telegraph-aoe']
  return rt !== undefined && rt.until !== undefined
}
const lowestAlly = (b: BattleState): Combatant =>
  b.combatants
    .filter((c) => c.alive && c.team === 'guild')
    .reduce((a, c) => (a.hp / a.maxHp <= c.hp / c.maxHp ? a : c))

/** 会玩的团长：打断咏唱 > 清增援 > 集火 boss；红圈切分散；血线交药；狂暴交爆发 */
function goodPlay(b: BattleState, encId: string): void {
  if (b.tick % 5 !== 0) return
  const enemies = b.combatants.filter((c) => c.alive && c.team === 'enemy')
  const adds = enemies.filter((c) => !c.bossMechanics)
  const b0 = boss(b)

  // 阵型
  if (isTelegraphing(b)) setStance(b, 'spread')
  else if (b.commands.stance === 'spread') setStance(b, 'standard')

  // 集火：咏唱必须打断（否则 boss 增伤），其次清增援，平时集火 boss
  if (isCasting(b) && b0) setFocus(b, b0.id)
  else if (adds.length > 0) setFocus(b, adds.reduce((a, c) => (a.hp <= c.hp ? a : c)).id)
  else if (b0) setFocus(b, b0.id)

  // 道具：治疗药血线 55%；爆发药留给狂暴（塔尔玛）或 boss 进 45% 斩杀（格鲁什）
  if (lowestAlly(b).hp / lowestAlly(b).maxHp < 0.55) useHealPotion(b)
  const enraged = b0?.mech?.['enrage']?.fired === 1
  if (b0 && (enraged || (encId === 'enc-grush' && b0.hp / b0.maxHp < 0.45))) useFuryPotion(b)
}

/** 平庸的团长：看得懂血条但不研究机制——从不切阵型/打断，交药慢半拍，爆发药忘在包里 */
function mediocrePlay(b: BattleState): void {
  if (b.tick % 5 !== 0) return
  if (lowestAlly(b).hp / lowestAlly(b).maxHp < 0.3) useHealPotion(b)
}

/** 中位玩家：第一场会话的真实水平——会点 boss 集火、血线交药，但不研究阵型与爆发时机 */
function medianPlay(b: BattleState): void {
  if (b.tick % 5 !== 0) return
  const b0 = boss(b)
  // 会照界面提示玩的新手:增援出现会点增援,但慢半拍(1.2s 反应);平时点 boss
  const adds = b.combatants.filter((c) => c.alive && c.team === 'enemy' && !c.bossMechanics)
  if (adds.length > 0) {
    if (!addSeenAt.has(b)) addSeenAt.set(b, b.tick)
    const reacted = b.tick - (addSeenAt.get(b) ?? b.tick) >= 12
    if (reacted) setFocus(b, adds.reduce((a, c) => (a.hp <= c.hp ? a : c)).id)
    else if (b0) setFocus(b, b0.id)
  } else {
    addSeenAt.delete(b)
    if (b0) setFocus(b, b0.id)
  }
  // 狂暴提示出现会交爆发药
  if (b0?.mech?.['enrage']?.fired === 1) useFuryPotion(b)
  if (lowestAlly(b).hp / lowestAlly(b).maxHp < 0.35) useHealPotion(b)
}

interface Report {
  encId: string
  variant: string
  win: number
  retreat: number
  wipe: number
  timeout: number
  deadHeroes: number
  ticksSum: number
  winTicksSum: number
}

function report(r: Report): string {
  const pct = (n: number) => ((n / ROUNDS) * 100).toFixed(0).padStart(3)
  const avgAll = (r.ticksSum / ROUNDS / 10).toFixed(1)
  const avgWin = r.win > 0 ? (r.winTicksSum / r.win / 10).toFixed(1) : '  -'
  return (
    `${r.encId.padEnd(10)} ${r.variant.padEnd(10)} 胜${pct(r.win)}% 撤${pct(r.retreat)}% ` +
    `灭${pct(r.wipe)}% 超时${pct(r.timeout)}% 平均 ${avgAll}s(胜场 ${avgWin}s) 阵亡 ${r.deadHeroes}`
  )
}

function fight(encId: string, variant: string, squad: Member[], mode: 'good' | 'none' | 'meh' | 'mid', out: Report): void {
  const b = createBattle(squad, BLACKMOSS, encId, hashOut(out) * 7919 + out.win + 3)
  b.commands.protectRetreat = mode !== 'good' // 机器人自己管血线；其余档位走默认保护兜底
  while (b.status === 'running' && b.tick < MAX_TICK) {
    if (mode === 'good') goodPlay(b, encId)
    else if (mode === 'meh') mediocrePlay(b)
    else if (mode === 'mid') medianPlay(b)
    stepBattle(b)
  }
  out.ticksSum += Math.min(b.tick, MAX_TICK)
  if (b.status === 'guild-win') {
    out.win++
    out.winTicksSum += b.tick
  } else if (b.status === 'retreated') out.retreat++
  else if (b.status === 'guild-wipe') out.wipe++
  else out.timeout++
  out.deadHeroes += b.combatants.filter((c) => c.team === 'guild' && !c.alive).length
}

function hashOut(out: Report): number {
  let h = 0
  for (const ch of out.encId + out.variant) h = (h * 31 + ch.charCodeAt(0)) | 0
  return Math.abs(h)
}

// ---- 装备变体：模拟"通关一次、换上 T2 装备再战"的配装 ----
function gearSquad(squad: Member[]): void {
  // 固定给三件合理 T2（词条用固定种子 roll，视为仓库里的存货）
  const weapon: ItemInstance = rollBossDrops([{ baseId: 'wpn-t2-bow', chance: 1 }], 101)[0]
  const armor: ItemInstance = rollBossDrops([{ baseId: 'arm-t2-plate', chance: 1 }], 202)[0]
  const trinket: ItemInstance = rollBossDrops([{ baseId: 'trk-t2-totem', chance: 1 }], 303)[0]
  const byJob: Record<string, (items: ItemInstance[]) => void> = {
    guard: (items) => {
      squad[0].equipment.armor = items[1]
      squad[0].equipment.trinket = items[2]
    },
    priest: (items) => {
      squad[1].equipment.trinket = items[2]
      squad[1].equipment.armor = items[1]
    },
    ranger: (items) => {
      squad[2].equipment.weapon = items[0]
    },
  }
  const items = [weapon, armor, trinket]
  for (const job of JOBS) byJob[job](items)
  void equipmentStats // 保持在依赖图里（投影时自动聚合）
}

const reports: Report[] = []
const mk = (encId: string, variant: string): Report => ({ encId, variant, win: 0, retreat: 0, wipe: 0, timeout: 0, deadHeroes: 0, ticksSum: 0, winTicksSum: 0 })

for (const encId of ['enc-frogs', 'enc-wolves', 'enc-grush', 'enc-talma']) {
  for (const mode of ['none', 'meh', 'mid', 'good'] as const) {
    const label = { none: '零指挥', meh: '平庸', mid: '中位', good: '会玩' }[mode]
    const out = mk(encId, label)
    for (let i = 0; i < ROUNDS; i++) {
      const squad = JOBS.map((job, j) => generateMember(job, 5, 60000 + i * 100 + j))
      fight(encId, out.variant, squad, mode, out)
    }
    reports.push(out)
  }
}

// 装备成长验证：同一批人 + T2 装备再战塔尔玛（循环引力的量化）
{
  const out = mk('enc-talma', '会玩+T2')
  for (let i = 0; i < ROUNDS; i++) {
    const squad = JOBS.map((job, j) => generateMember(job, 5, 60000 + i * 100 + j))
    gearSquad(squad)
    fight('enc-talma', out.variant, squad, 'good', out)
  }
  reports.push(out)
}

console.log(`D13 平衡基线（每格 ${ROUNDS} 场）`)
for (const r of reports) console.log('  ' + report(r))
