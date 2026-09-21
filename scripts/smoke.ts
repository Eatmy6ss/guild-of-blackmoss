// 冒烟测试：跑 200 轮 × 全部遭遇战
// 硬门槛：① 所有战斗必然终结（无死循环）② 杂兵战不允许团灭（玩家不该死在垃圾怪手上）
// 说明：boss 压迫感依赖 D8-9 机制引擎（狂暴/束缚等），纯数值阶段 boss 偏弱是预期，
//       最终平衡在 D13-14 统一调。
// 运行：npx esbuild scripts/smoke.ts --bundle --platform=node --format=esm --outfile=scripts/smoke.mjs && node scripts/smoke.mjs
import { generateMember } from '../src/sim/gen'
import { createBattle, stepBattle, setFocus, setStance, useHealPotion, useFuryPotion, orderRetreat, toCombatant, applyHit } from '../src/sim/combat'
import { rollBossDrops, rollDrop, describeItem, itemStats } from '../src/sim/loot'
import { AFFIXES } from '../src/data/affixes'
import { BLACKMOSS, RUSTMINE, ASHFIELD, FROSTGRAVE, ABYSSALTAR, THORNHOLD, DUNGEONS } from '../src/data/dungeons'
import { sellValue, rollVisitor, bountyCandidate, cooldownNeeded } from '../src/sim/tavern'
import { migrate, exportSave, importSave, SAVE_VERSION } from '../src/state/save'
import { offlineGain, sellValue as sellValueFn } from '../src/sim/tavern'
import { BUILDINGS, baseEffects } from '../src/data/base'
import { refusesToMarch, applyDeathShock, applyFeast, MORALE, clamp } from '../src/sim/morale'
import { chronicleRefusal } from '../src/sim/chronicle'
import { seedMemberSeq } from '../src/sim/gen'
import { startTower, startTowerFloor, settleTowerFloor, towerNext, towerEnemyScale, towerGold, TOWER } from '../src/sim/tower'
import { GUILD_EVENTS, EVENT_CHANCE } from '../src/data/guild-events'
import { pickOutcome, rollGuildEvent } from '../src/sim/guild-events'
import { bossIntents } from '../src/sim/mechanics'
import { applyMoraleDelta } from '../src/sim/morale'
import { chronicleRaw } from '../src/sim/chronicle'
import { rollDrop } from '../src/sim/loot'
import { createRun, advanceRun, startStep, markPermadeath, settleGrowth } from '../src/sim/run'
import type { Member } from '../src/sim/types'
import { JOBS as JOB_TABLE } from '../src/data/jobs'
import { HYBRIDS } from '../src/data/vocations'
import { RACES } from '../src/data/races'
import { grantExp, rollSpec, setRaceOverride } from '../src/sim/gen'

const JOBS = ['guard', 'priest', 'ranger'] as const
// 门禁标准条件:全部生成器钉人类苗子(种族方差由 ㉖ 单独验证)
setRaceOverride('human')
const MAX_TICK = 10000
const ROUNDS = 200

let total = 0
const winByEnc: Record<string, number> = {}
const wipeByEnc: Record<string, number> = {}
const ticksByEnc: Record<string, number> = {}
const failures: string[] = []

for (let i = 0; i < ROUNDS; i++) {
  const squad = JOBS.map((job, j) => generateMember(job, 5, i * 1000 + j * 7 + 1))
  for (const enc of BLACKMOSS.encounters) {
    const battle = createBattle(squad, BLACKMOSS, enc.id, i * 131 + 5)
    while (battle.status === 'running' && battle.tick < MAX_TICK) stepBattle(battle)
    total++
    winByEnc[enc.id] = (winByEnc[enc.id] ?? 0) + (battle.status === 'guild-win' ? 1 : 0)
    wipeByEnc[enc.id] = (wipeByEnc[enc.id] ?? 0) + (battle.status === 'guild-wipe' ? 1 : 0)
    ticksByEnc[enc.id] = (ticksByEnc[enc.id] ?? 0) + battle.tick
    if (battle.status === 'running') {
      failures.push(`i=${i} enc=${enc.id} 在 ${MAX_TICK} tick 内未分胜负`)
    }
    if (enc.kind === 'wave' && battle.status === 'guild-wipe') {
      failures.push(`i=${i} enc=${enc.id} 杂兵战团灭（违反门槛②）`)
    }
  }
}

console.log(`战斗总数: ${total}`)
for (const enc of BLACKMOSS.encounters) {
  const w = winByEnc[enc.id] ?? 0
  const l = wipeByEnc[enc.id] ?? 0
  const avgSec = ((ticksByEnc[enc.id] ?? 0) / ROUNDS) / 10
  console.log(`  ${enc.name.padEnd(14, '　')} 胜率 ${(w / ROUNDS * 100).toFixed(1)}%（全灭 ${l}）平均 ${avgSec.toFixed(1)}s`)
}
if (failures.length > 0) {
  console.log('✗ 未通过:', failures.slice(0, 5))
  process.exit(1)
}
console.log('✓ 冒烟通过：战斗必然终结，杂兵战安全；boss 威胁待 D8-9 机制实装')

// ============================================================
// 行为验证：威胁表 / 站位 / 轻协同（引擎正确性，不只是不崩溃）
// ============================================================

function runBattleLog(squad: Member[], encId: string, seed: number, onCreated?: (b: ReturnType<typeof createBattle>) => void) {
  const b = createBattle(squad, BLACKMOSS, encId, seed)
  onCreated?.(b)
  while (b.status === 'running' && b.tick < MAX_TICK) stepBattle(b)
  return b
}

const enemyNames = ['沼泽蛙人', '蛙人萨满', '腐化狼']

// ① 近战敌人只能打前排坦克（站位规则）；远程萨满按威胁优先打坦克
// D15：守卫可能阵亡——前排清空后近战打后排是合法规则，故只统计守卫存活到终局的战斗
let meleeOnGuard = 0
let meleeTotal = 0
let shamanOnGuard = 0
let shamanTotal = 0
let guardSurvivedBattles = 0
for (let i = 0; i < 50; i++) {
  const squad = JOBS.map((job, j) => generateMember(job, 5, 500000 + i * 100 + j))
  const guardName = squad[0].name
  const b = runBattleLog(squad, 'enc-frogs', i * 311 + 1)
  const guardAliveAtEnd = b.combatants.find((c) => c.memberId === squad[0].id)?.alive ?? false
  if (!guardAliveAtEnd) continue
  guardSurvivedBattles++
  for (const e of b.log) {
    if (e.kind !== 'enemy') continue
    if (!enemyNames.some((n) => e.text.startsWith(n))) continue
    const isMelee = e.text.startsWith('沼泽蛙人') || e.text.startsWith('腐化狼')
    if (e.text.includes('攻击')) {
      if (isMelee) { meleeTotal++; if (e.text.includes(guardName)) meleeOnGuard++ }
      else { shamanTotal++; if (e.text.includes(guardName)) shamanOnGuard++ }
    }
  }
}
console.log(`① 站位+威胁：近战打坦克 ${meleeOnGuard}/${meleeTotal}；萨满(远程)打坦克 ${shamanOnGuard}/${shamanTotal}（守卫存活战斗 ${guardSurvivedBattles}/50）`)
if (meleeOnGuard !== meleeTotal) {
  console.log('✗ 近战敌人打到了非前排目标——站位规则失效')
  process.exit(1)
}
if (shamanOnGuard / shamanTotal < 0.7) {
  console.log('✗ 远程敌人很少打坦克——威胁表疑似失效')
  process.exit(1)
}

// ② 坦克倒下 = 灾难（以塔尔玛为试炼石：杂兵战治疗可兜底，boss 战不可）
// 注：牧师/游侠谁先死由仇恨细节决定（当前版本输出仇恨≈治疗仇恨），不设硬门槛，D13-14 再定调。
let priestTargeted = 0
let rangerTargeted = 0
let wipesAfterTankDeath = 0
for (let i = 0; i < 50; i++) {
  const squad = JOBS.map((job, j) => generateMember(job, 5, 600000 + i * 100 + j))
  const b = runBattleLog(squad, 'enc-talma', i * 977 + 3, (battle) => {
    battle.commands.protectRetreat = false // 搏命场景：关闭撤退保护
    const guard = battle.combatants.find((c) => c.memberId === squad[0].id)!
    guard.alive = false
    guard.hp = 0
  })
  if (b.status === 'guild-wipe') wipesAfterTankDeath++
  for (const e of b.log) {
    if (e.kind !== 'enemy' || !e.text.includes('攻击')) continue
    if (e.text.includes(squad[1].name)) priestTargeted++
    else if (e.text.includes(squad[2].name)) rangerTargeted++
  }
}
console.log(`② 坦克阵亡后：团灭 ${wipesAfterTankDeath}/50（火力 牧师${priestTargeted}/游侠${rangerTargeted}）`)
if (wipesAfterTankDeath < 20) {
  console.log('✗ 失去坦克后团灭率不足 40%——坦克的石柱地位不成立')
  process.exit(1)
}

// ③ 轻协同：盾墙掩护（坦克存活 → 游侠伤害 +15%）
//    用 grush 战（唯一敌人、防御固定）对比坦克生/死时游侠普攻均值
function rangerAvgHit(guardAlive: boolean): number {
  let sum = 0
  let n = 0
  for (let i = 0; i < 40; i++) {
    const squad = JOBS.filter((j) => j !== 'priest').map((job, j) =>
      generateMember(job, 5, 700000 + i * 100 + j),
    )
    const b = runBattleLog(squad, 'enc-grush', i * 419 + 7, (battle) => {
      if (!guardAlive) {
        const guard = battle.combatants.find((c) => c.memberId === squad[0].id)!
        guard.alive = false
        guard.hp = 0
      }
    })
    const rangerName = squad[1].name
    for (const e of b.log) {
      // 只取普攻（1.0 倍率），排除瞄准射击（1.8）
      if (e.text.startsWith(rangerName) && e.text.includes(' 攻击')) {
        const m = e.text.match(/造成 (\d+)/)
        if (m) { sum += Number(m[1]); n++ }
      }
    }
  }
  return sum / n
}
const withGuard = rangerAvgHit(true)
const noGuard = rangerAvgHit(false)
const ratio = withGuard / noGuard
console.log(`③ 盾墙协同：有坦克均值 ${withGuard.toFixed(1)} / 无坦克均值 ${noGuard.toFixed(1)} = ${ratio.toFixed(3)}`)
if (Math.abs(ratio - 1.15) > 0.06) {
  console.log('✗ 协同倍率偏离 1.15 超容差')
  process.exit(1)
}

console.log('✓ 行为验证通过：站位/威胁/治疗仇恨/轻协同全部按设计生效')

// ============================================================
// ④ 远征状态机：岔路路由 / 终态可达 / 血量合法 / 两条路线都可行
// D11：撤退保护默认开启，濒危自动撤离——"活着回来"也算路线可行
// ============================================================
const runFailures: string[] = []
let victoryRisky = 0
let victorySafe = 0
let survivedRisky = 0
let survivedSafe = 0
let hpViolations = 0
let carriedBelowFull = 0 // 血量延续断言：后续战斗必须带伤进场（D13 修复的回归锁）
const RUNS_PER_BRANCH = 60

for (let i = 0; i < RUNS_PER_BRANCH * 2; i++) {
  const risky = i % 2 === 0
  const squad = JOBS.map((job, j) => generateMember(job, 5, 800000 + i * 100 + j))
  const branchId = risky ? 'shortcut' : 'safepath'
  const run = createRun(squad, BLACKMOSS, branchId, i * 313 + 11)
  const expectedSteps = risky ? 5 : 4 // D15:新增水蛭缓冲场(险路全打,稳路跳过最后一场杂兵)
  if (run.steps.length !== expectedSteps) {
    runFailures.push(`分支 ${branchId} 步数 ${run.steps.length} ≠ ${expectedSteps}`)
  }
  let guard = 0
  while (run.phase !== 'victory' && run.phase !== 'defeat' && run.phase !== 'retreated' && guard++ < 50) {
    const b = run.battle!
    while (b.status === 'running' && b.tick < MAX_TICK) stepBattle(b)
    advanceRun(run)
    markPermadeath(run)
    for (const m of squad) if (m.hp < 0) hpViolations++
    if (run.phase === 'rest') {
      startStep(run, i * 991 + guard * 17)
      for (const c of run.battle!.combatants) {
        if (c.team !== 'guild') continue
        if (c.hp > c.maxHp) hpViolations++
        if (c.hp < c.maxHp) carriedBelowFull++
      }
    }
  }
  if (run.phase === 'victory') {
    if (risky) victoryRisky++
    else victorySafe++
  } else if (run.phase === 'defeat') {
    // 团灭：不算生还
  } else if (run.phase === 'retreated') {
    if (risky) survivedRisky++
    else survivedSafe++
  } else {
    runFailures.push(`i=${i} 远征卡在 phase=${run.phase}`)
  }
  // 永久死亡一致性：阵亡者（hp=0）必须已从花名册划去
  for (const m of squad) {
    if (!m.alive && m.hp > 0) hpViolations++
  }
}
const rateRisky = (victoryRisky / RUNS_PER_BRANCH) * 100
const rateSafe = (victorySafe / RUNS_PER_BRANCH) * 100
const aliveRisky = ((victoryRisky + survivedRisky) / RUNS_PER_BRANCH) * 100
const aliveSafe = ((victorySafe + survivedSafe) / RUNS_PER_BRANCH) * 100
console.log(
  `④ 远征：险路 通关${rateRisky.toFixed(1)}%/生还${aliveRisky.toFixed(1)}%，稳路 通关${rateSafe.toFixed(1)}%/生还${aliveSafe.toFixed(1)}%，血量非法 ${hpViolations}，带伤进场样本 ${carriedBelowFull}`,
)
if (runFailures.length > 0 || hpViolations > 0) {
  console.log('✗ 远征状态机未通过:', runFailures.slice(0, 5))
  process.exit(1)
}
if (carriedBelowFull === 0) {
  console.log('✗ 血量延续失效：后续战斗全部满血进场——远征内的消耗经济不存在')
  process.exit(1)
}
if (aliveRisky < 50 || aliveSafe < 50) {
  console.log('✗ 存在过半远征无人生还的路线——难度失衡')
  process.exit(1)
}
console.log('✓ 远征验证通过：岔路/结算/永久死亡/生还判定按设计工作')

// ============================================================
// ⑤ boss 机制与指挥台（D8-9）
// ============================================================
const mechFailures: string[] = []

// 5a: 格鲁什——震地蓄力与召唤
let slams = 0
let summons = 0
for (let i = 0; i < 30; i++) {
  const squad = JOBS.map((job, j) => generateMember(job, 5, 900000 + i * 100 + j))
  const b = createBattle(squad, BLACKMOSS, 'enc-grush', i * 77 + 2)
  while (b.status === 'running' && b.tick < MAX_TICK) stepBattle(b)
  if (b.log.some((e) => e.text.includes('蓄力'))) slams++
  if (b.log.some((e) => e.text.includes('增援'))) summons++
}
console.log(`5a 格鲁什：震地 ${slams}/30，召唤 ${summons}/30`)
if (slams < 15 || summons < 25) mechFailures.push(`5a 触发率过低（震地${slams} 召唤${summons}）`)

// 5b: 塔尔玛——集火打断 vs 无指挥；束缚与狂暴
let focusInt = 0
let plainInt = 0
let binds = 0
let enrages = 0
for (let i = 0; i < 40; i++) {
  const withFocus = i % 2 === 0
  const squad = JOBS.map((job, j) => generateMember(job, 5, 910000 + i * 100 + j))
  const b = createBattle(squad, BLACKMOSS, 'enc-talma', i * 93 + 4)
  while (b.status === 'running' && b.tick < MAX_TICK) {
    if (withFocus && b.tick % 5 === 0) {
      const boss = b.combatants.find((c) => c.boss && c.alive)
      if (boss) setFocus(b, boss.id)
    }
    stepBattle(b)
  }
  const ints = b.log.filter((e) => e.text.includes('打断')).length
  if (withFocus) focusInt += ints
  else plainInt += ints
  if (b.log.some((e) => e.text.includes('束缚'))) binds++
  if (b.log.some((e) => e.text.includes('狂暴'))) enrages++
}
console.log(`5b 塔尔玛：集火打断 ${focusInt} 次 vs 无指挥打断 ${plainInt} 次；束缚 ${binds}/40，狂暴 ${enrages}/40`)
// 节奏改版:协同走位(默认打坦克目标)后"无指挥"也等效全员打 boss,打断对比失去区分度——
// 改为绝对门槛:打断链路必须恒可用
if (focusInt < 30) mechFailures.push(`5b 打断链路失效 ${focusInt}/40 局`)
if (binds < 12) mechFailures.push(`5b 束缚触发过少 ${binds}`)
if (enrages < 8) mechFailures.push(`5b 狂暴触发过少 ${enrages}`)

// 5c: 分散阵型显著降低震地伤害
let aoeStd = 0
let aoeSpread = 0
for (let i = 0; i < 20; i++) {
  for (const mode of ['std', 'spread'] as const) {
    const squad = JOBS.map((job, j) => generateMember(job, 5, 920000 + i * 100 + j))
    const b = createBattle(squad, BLACKMOSS, 'enc-grush', i * 61 + 9)
    if (mode === 'spread') setStance(b, 'spread')
    while (b.status === 'running' && b.tick < MAX_TICK) stepBattle(b)
    for (const e of b.log) {
      if (!e.text.includes('震地猛击命中')) continue
      const m = e.text.match(/造成 (\d+)/)
      if (m) {
        if (mode === 'std') aoeStd += Number(m[1])
        else aoeSpread += Number(m[1])
      }
    }
  }
}
console.log(`5c 分散减伤：标准阵型 AOE 总伤 ${aoeStd} vs 分散 ${aoeSpread}`)
if (aoeSpread >= aoeStd) mechFailures.push('5c 分散阵型没有降低 AOE 伤害')

// 5d: 治疗药与撤退令
{
  const squad = JOBS.map((job, j) => generateMember(job, 5, 930001 + j))
  const b = createBattle(squad, BLACKMOSS, 'enc-frogs', 424242)
  // 先打到有人掉血
  while (b.status === 'running' && b.tick < 200) {
    stepBattle(b)
    if (b.combatants.some((c) => c.team === 'guild' && c.alive && c.hp < c.maxHp * 0.7)) break
  }
  const hurt = b.combatants.find((c) => c.team === 'guild' && c.alive)!
  const hpBefore = hurt.hp
  const healed = useHealPotion(b)
  const healedUp = hurt.hp > hpBefore || b.combatants.every((c) => c.hp === c.maxHp)
  if (!healed || b.commands.healStock !== 2 || !healedUp) {
    mechFailures.push('5d 治疗药未按预期工作')
  }
  // 撤退令
  const retreated = orderRetreat(b)
  while (b.status === 'running' && b.tick < 2000) stepBattle(b)
  if (!retreated || b.status !== 'retreated') mechFailures.push('5d 撤退令未生效')
}
console.log(`5d 指令：治疗药/撤退令工作正常`)

if (mechFailures.length > 0) {
  console.log('✗ 机制验证未通过:', mechFailures)
  process.exit(1)
}
console.log('✓ 机制验证通过：震地/召唤/咏唱打断/束缚/狂暴/阵型/道具/撤退全部生效')

// ============================================================
// ⑥ 掉落与配装（D10）
// ============================================================
const lootFailures: string[] = []

// 6a: boss 固定掉落表概率（grush 每场期望 0.7 件）
let dropTotal = 0
for (let i = 0; i < 100; i++) {
  dropTotal += rollBossDrops(BLACKMOSS.bosses['grush'].dropTable, i * 77 + 1).length
}
console.log(`6a 掉落表：100 场 grush 掉落 ${dropTotal} 件（期望 ~70）`)
if (dropTotal < 50 || dropTotal > 90) lootFailures.push(`6a 掉落率偏离 ${dropTotal}`)

// 6b: 词条 roll 合法性（条数区间 + 数值区间）
for (let i = 0; i < 60; i++) {
  const item = rollBossDrops([{ baseId: 'wpn-t2-bow', chance: 1 }], i * 31 + 7)[0]
  if (item.rolls.length < 2 || item.rolls.length > 3) {
    lootFailures.push(`6b 词条条数越界 ${item.rolls.length}`)
    break
  }
  for (const r of item.rolls) {
    const aff = AFFIXES[r.affixId]
    if (r.value < aff.range[0] - 0.01 || r.value > aff.range[1] + 0.01) {
      lootFailures.push(`6b 词条 ${aff.id} 数值越界 ${r.value}`)
    }
  }
  if (!describeItem(item).includes('猎风长弓')) lootFailures.push('6b 描述缺失')
  if (!itemStats(item).attack) lootFailures.push('6b 属性聚合缺失')
}

// 6c: 装备提升战力
{
  const m = generateMember('ranger', 5, 4242)
  const weak = toCombatant(m)
  const item = rollBossDrops([{ baseId: 'wpn-t2-bow', chance: 1 }], 99)[0]
  m.equipment.weapon = item
  const strong = toCombatant(m)
  console.log(`6c 配装：游侠攻击 ${weak.attack} → ${strong.attack}（装备 ${item.rolls.length} 词条）`)
  if (strong.attack <= weak.attack) lootFailures.push('6c 装备没有提升攻击')
}

// 6d: 吸血词条回血
{
  const squad = JOBS.map((job, j) => generateMember(job, 5, 5150 + j))
  squad[2].equipment.trinket = { id: 't1', baseId: 'trk-t2-totem', rolls: [{ affixId: 'aff-steal', value: 0.5 }] }
  const b = createBattle(squad, BLACKMOSS, 'enc-frogs', 555)
  const ranger = b.combatants.find((c) => c.memberId === squad[2].id)!
  const foe = b.combatants.find((c) => c.team === 'enemy')!
  ranger.hp = 50
  const before = ranger.hp
  applyHit(b, ranger, foe, 100, '测试')
  const healed = ranger.hp - before
  console.log(`6d 吸血：造成 100 伤害回复 ${healed}（期望 ~50）`)
  if (healed < 40 || healed > 60) lootFailures.push('6d 吸血数值异常')
}

// 6e: 首杀保底（D14）——pity 模式下空手率为 0
{
  let empties = 0
  for (const bossId of ['grush', 'talma']) {
    for (let i = 0; i < 40; i++) {
      const drops = rollBossDrops(BLACKMOSS.bosses[bossId].dropTable, i * 97 + 13, { pity: true })
      if (drops.length === 0) empties++
    }
  }
  console.log(`6e 首杀保底：80 次 pity roll 空手 ${empties} 次`)
  if (empties > 0) lootFailures.push('6e pity 模式仍可能空手——首杀保底失效')
}

if (lootFailures.length > 0) {
  console.log('✗ 掉落验证未通过:', lootFailures)
  process.exit(1)
}
console.log('✓ 掉落验证通过：掉落表/词条/配装/吸血按设计工作')

// ============================================================
// ⑦ 公会层（D11）：永久死亡 / 纪念堂光环 / 战术手册 / 撤退保护
// ============================================================
const guildFailures: string[] = []

// 7a: 永久死亡登记——团灭后全队进入纪念堂，花名册划名
{
  let checked = 0
  for (let i = 0; i < 60 && checked < 10; i++) {
    const squad = JOBS.map((job, j) => generateMember(job, 5, 940000 + i * 100 + j))
    const run = createRun(squad, BLACKMOSS, 'shortcut', i * 317 + 5)
    let guard = 0
    while (run.phase !== 'defeat' && run.phase !== 'victory' && run.phase !== 'retreated' && guard++ < 40) {
      const bt = run.battle!
      bt.commands.protectRetreat = false // 搏命场景：制造团灭样本
      while (bt.status === "running" && bt.tick < MAX_TICK) stepBattle(bt)
      advanceRun(run)
      const dead = markPermadeath(run)
      if (run.phase === 'defeat' && dead.length > 0) {
        for (const d of dead) {
          if (!d.cause.includes('黑苔沼泽')) guildFailures.push(`7a 死因缺失: ${d.name}`)
        }
        const member = squad.find((m) => m.id === dead[0].id)
        if (!member || member.alive) guildFailures.push(`7a ${dead[0].name} 未从花名册划去`)
        checked++
      }
      if (run.phase === 'rest') startStep(run, i * 719 + guard * 13)
    }
  }
  console.log(`7a 永久死亡：核验 ${checked} 次阵亡登记`)
  if (checked < 5) guildFailures.push('7a 团灭样本不足（机制没有制造足够死亡）')
}

// 7b: 纪念堂光环 + 战术手册：同样种子下伤害提升
function guildDamageSum(aura: number, manual: number): number {
  let sum = 0
  for (let i = 0; i < 40; i++) {
    const squad = JOBS.map((job, j) => generateMember(job, 5, 950000 + i * 100 + j))
    const b = createBattle(squad, BLACKMOSS, 'enc-frogs', i * 419 + 3, aura, manual)
    while (b.status === "running" && b.tick < 60) stepBattle(b)
    for (const e of b.log) {
      if (e.kind === 'guild' && e.text.includes('造成')) {
        const m = e.text.match(/造成 (\d+)/)
        if (m) sum += Number(m[1])
      }
    }
  }
  return sum
}
const plainDmg = guildDamageSum(0, 0)
const legacyDmg = guildDamageSum(0.06, 0.05)
console.log(`7b 传承：基础总伤 ${plainDmg} vs 光环+手册 ${legacyDmg}（期望 ~+10%）`)
if (legacyDmg <= plainDmg * 1.05) guildFailures.push('7b 传承加成未生效或过弱')

// 7c: 撤退保护——濒危自动撤离；关闭后不触发
{
  const squadOn = JOBS.map((job, j) => generateMember(job, 5, 960001 + j))
  const bOn = createBattle(squadOn, BLACKMOSS, 'enc-grush', 31337)
  bOn.commands.protectRetreat = true
  // 两个人濒危:治疗每口只能救血线最低的一个,必然有人留在 20% 濒危线下(节奏改版后单人口(10%)会被圣光拉出濒危线)
  for (const c of bOn.combatants.filter((c) => c.team === 'guild')) {
    c.hp = Math.round(c.maxHp * 0.1)
  }
  let ticks = 0
  while (bOn.status === 'running' && bOn.commands.extractingUntil === undefined && ticks++ < 20) stepBattle(bOn)
  const onTriggered = bOn.commands.extractingUntil !== undefined
  while (bOn.status === 'running' && ticks++ < 200) stepBattle(bOn)
  const onRetreated = bOn.status === 'retreated'

  const squadOff = JOBS.map((job, j) => generateMember(job, 5, 970001 + j))
  const bOff = createBattle(squadOff, BLACKMOSS, 'enc-grush', 31337)
  bOff.commands.protectRetreat = false
  const guardOff = bOff.combatants.find((c) => c.team === 'guild')!
  guardOff.hp = Math.round(guardOff.maxHp * 0.1)
  let offTriggered = false
  ticks = 0
  while (bOff.status === 'running' && ticks++ < 60) {
    stepBattle(bOff)
    if (bOff.commands.extractingUntil !== undefined) offTriggered = true
  }
  console.log(`7c 撤退保护：开启→自动撤离 ${onTriggered && onRetreated}；关闭→未触发 ${!offTriggered}`)
  if (!onTriggered || !onRetreated) guildFailures.push('7c 保护开启却未自动撤离')
  if (offTriggered) guildFailures.push('7c 保护关闭仍自动撤离')
}

if (guildFailures.length > 0) {
  console.log('✗ 公会层验证未通过:', guildFailures)
  process.exit(1)
}
console.log('✓ 公会层验证通过：永久死亡/纪念堂光环/战术手册/撤退保护按设计工作')

// ============================================================
// ⑧ 挂机 AI（D12）：队长性格代打
// ============================================================
const aiFailures: string[] = []
import { setFocus as aiSetFocus } from '../src/sim/combat'
void aiSetFocus

// 8a: 谨慎队长挂机打 grush——有阵型命令、会交药、能打完
{
  let stanceCmds = 0
  let potions = 0
  let completed = 0
  for (let i = 0; i < 20; i++) {
    const squad = JOBS.map((job, j) => generateMember(job, 5, 980000 + i * 100 + j))
    squad[0].personality = { bravery: 20, caution: 90, greed: 30, loyalty: 60 } // 谨慎队长
    const b = createBattle(squad, BLACKMOSS, 'enc-grush', i * 89 + 6)
    b.commands.autoMode = true
    b.commands.protectRetreat = false // 纯性格代打（保护会抢先撤离）
    while (b.status === 'running' && b.tick < MAX_TICK) stepBattle(b)
    if (b.status !== 'running') completed++
    stanceCmds += b.log.filter((e) => e.text.includes('团长命令')).length
    potions += b.log.filter((e) => e.text.includes('治疗药')).length
  }
  console.log(`8a 谨慎队长挂机 grush：完成 ${completed}/20，阵型命令 ${stanceCmds}，交药 ${potions}`)
  if (completed < 18) aiFailures.push('8a 挂机战斗未正常打完')
  if (stanceCmds < 40) aiFailures.push('8a AI 没有下达阵型命令')
}

// 8b: 性格决定命运——勇猛队长 vs 谨慎队长在塔尔玛的不同结局
{
  let braveAdvance = 0
  let braveDefensive = 0
  let braveRetreats = 0
  let cautiousAdvance = 0
  let cautiousDefensive = 0
  let cautiousRetreats = 0
  let braveTaken = 0
  let cautiousTaken = 0
  for (let i = 0; i < 30; i++) {
    for (const kind of ['brave', 'cautious'] as const) {
      // 3 级小队:治疗加强(4.5x)后 5 级队打塔尔玛不再进入劣势,撤退抉择永远不触发——
      // 用低级队还原"该不该撤"的抉择压力,才能测出撤退的性格传导
      const squad = JOBS.map((job, j) => generateMember(job, 3, 990000 + i * 100 + j))
      const personality =
        kind === 'brave'
          ? { bravery: 95, caution: 5, greed: 50, loyalty: 50 }
          : { bravery: 5, caution: 95, greed: 50, loyalty: 50 }
      // 全队共享队长性格:队长阵亡后接任者仍是同一性格,否则随机性格的接任队长会污染统计
      for (const m of squad) m.personality = personality
      const b = createBattle(squad, BLACKMOSS, 'enc-talma', i * 61 + kind.length)
      b.commands.autoMode = true
      b.commands.protectRetreat = false
      while (b.status === 'running' && b.tick < MAX_TICK) stepBattle(b)
      if (kind === 'brave') {
        braveAdvance += b.log.filter((e) => e.text.includes('团长命令：推进')).length
        braveDefensive += b.log.filter((e) => e.text.includes('收缩') || e.text.includes('分散')).length
        braveRetreats += b.log.filter((e) => e.text.includes('兄弟们，撤')).length
      } else {
        cautiousAdvance += b.log.filter((e) => e.text.includes('团长命令：推进')).length
        cautiousDefensive += b.log.filter((e) => e.text.includes('收缩') || e.text.includes('分散')).length
        cautiousRetreats += b.log.filter((e) => e.text.includes('兄弟们，撤')).length
      }
    }
  }
  console.log(
    `8b 性格代打：勇猛[推进${braveAdvance}/防御${braveDefensive}/撤${braveRetreats}] 谨慎[推进${cautiousAdvance}/防御${cautiousDefensive}/撤${cautiousRetreats}]`,
  )
  if (braveAdvance <= cautiousAdvance) {
    aiFailures.push('8b 勇猛队长推进命令不多于谨慎队长——性格未传导')
  }
  if (cautiousDefensive <= braveDefensive) {
    aiFailures.push('8b 谨慎队长防御命令不多于勇猛队长——性格未传导')
  }
  if (cautiousRetreats < 10) {
    aiFailures.push('8b 谨慎队长撤得不够多——性格没有传导到决策')
  }
}

// 8c: 谨慎 AI 会集火打断咏唱
{
  let interrupts = 0
  for (let i = 0; i < 20; i++) {
    const squad = JOBS.map((job, j) => generateMember(job, 5, 995000 + i * 100 + j))
    squad[0].personality = { bravery: 20, caution: 90, greed: 30, loyalty: 60 }
    const b = createBattle(squad, BLACKMOSS, 'enc-talma', i * 47 + 8)
    b.commands.autoMode = true
    b.commands.protectRetreat = false
    while (b.status === 'running' && b.tick < MAX_TICK) stepBattle(b)
    interrupts += b.log.filter((e) => e.text.includes('打断')).length
  }
  console.log(`8c 谨慎 AI 打断咏唱 ${interrupts} 次/20 场`)
  if (interrupts < 10) aiFailures.push('8c AI 集火打断过少')
}

if (aiFailures.length > 0) {
  console.log('✗ 挂机 AI 验证未通过:', aiFailures)
  process.exit(1)
}
console.log('✓ 挂机 AI 验证通过：性格代打/阵型/道具/集火/撤退全部生效')

// ============================================================
// ⑧·五 成长系统（M1 P0）：经验升级 / 默契 / 战斗加成
// ============================================================
const growthFailures: string[] = []
{
  // 10a:会玩机器人打险路 → 通关后幸存者升到 Lv6、两两默契 ≥1
  let runs = 0
  let leveled = 0
  let bonded = 0
  for (let i = 0; i < 25; i++) {
    const squad = JOBS.map((job, j) => generateMember(job, 5, 200000 + i * 100 + j))
    const run = createRun(squad, BLACKMOSS, 'shortcut', i * 419 + 3)
    let g2 = 0
    while (run.phase !== 'victory' && run.phase !== 'defeat' && run.phase !== 'retreated' && g2++ < 40) {
      const bt = run.battle!
      while (bt.status === 'running' && bt.tick < MAX_TICK) {
        if (bt.tick % 5 === 0) {
          const boss = bt.combatants.find((c) => c.alive && c.bossMechanics)
          const adds = bt.combatants.filter((c) => c.alive && c.team === 'enemy' && !c.bossMechanics)
          const casting = boss?.mech?.['cast-buff'] !== undefined && boss!.mech!['cast-buff'].until !== undefined
          const telegraphing = boss?.mech?.['telegraph-aoe'] !== undefined && boss!.mech!['telegraph-aoe'].until !== undefined
          if (telegraphing) setStance(bt, 'spread')
          else if (bt.commands.stance === 'spread') setStance(bt, 'standard')
          if (casting && boss) setFocus(bt, boss.id)
          else if (adds.length > 0) setFocus(bt, adds.reduce((a, c) => (a.hp <= c.hp ? a : c)).id)
          else if (boss) setFocus(bt, boss.id)
          const lowest = bt.combatants
            .filter((c) => c.alive && c.team === 'guild')
            .reduce((a, c) => (a.hp / a.maxHp <= c.hp / c.maxHp ? a : c))
          if (lowest.hp / lowest.maxHp < 0.55) useHealPotion(bt)
          if (boss && boss.mech?.['enrage']?.fired === 1) useFuryPotion(bt)
        }
        stepBattle(bt)
      }
      advanceRun(run)
      markPermadeath(run)
      settleGrowth(run)
      if (run.phase === 'rest') startStep(run, i * 733 + g2 * 19)
    }
    if (run.phase === 'victory') {
      runs++
      const survivors = run.members.filter((m) => m.alive)
      if (survivors.some((m) => m.level > 5)) leveled++
      const allBonded =
        survivors.length >= 2 &&
        survivors.every((m) =>
          survivors.filter((o) => o.id !== m.id).some((o) => (m.bonds[o.id] ?? 0) >= 1),
        )
      if (allBonded) bonded++
    }
  }
  console.log(`⑩ 成长：会玩通关 ${runs}/25，幸存者升级 ${leveled}/${runs || '-'}，两两默契 ${bonded}/${runs || '-'}`)
  if (runs < 10) growthFailures.push(`⑩ 通关样本不足 ${runs}`)
  if (leveled < runs * 0.8) growthFailures.push('⑩ 通关未稳定升级——经验曲线失衡')
  if (bonded !== runs) growthFailures.push('⑩ 通关未建立两两默契')

  // 10b:默契战斗加成——同一批种子,有默契的队伍伤害更高
  const dmg = (withBond: boolean) => {
    let sum = 0
    for (let i = 0; i < 30; i++) {
      const squad = JOBS.map((job, j) => generateMember(job, 5, 250000 + i * 100 + j))
      if (withBond) {
        for (const m of squad) for (const o of squad) if (o.id !== m.id) m.bonds[o.id] = 10 // 4 星
      }
      const b = createBattle(squad, BLACKMOSS, 'enc-frogs', i * 419 + 3)
      while (b.status === 'running' && b.tick < 60) stepBattle(b)
      for (const e of b.log) {
        if (e.kind === 'guild' && e.text.includes('造成')) {
          const m = e.text.match(/造成 (\d+)/)
          if (m) sum += Number(m[1])
        }
      }
    }
    return sum
  }
  const plain = dmg(false)
  const bondedDmg = dmg(true)
  console.log(`⑩ 默契加成：基础 ${plain} vs 四星默契 ${bondedDmg}（期望 ≥ +8%）`)
  if (bondedDmg <= plain * 1.05) growthFailures.push('⑩ 默契战斗加成未生效')
  if (growthFailures.length > 0) {
    console.log('✗ 成长系统未通过:', growthFailures)
    process.exit(1)
  }
  console.log('✓ 成长系统验证通过：经验升级/默契建立/战斗加成按设计工作')
}

// ============================================================
// ⑩·五 经济与酒馆（M1 P0 切片 2）：变卖/冷却/访客/悬赏/传闻/存档迁移
// ============================================================
const econFailures: string[] = []
{
  // 11a:变卖价随 tier/词条单调
  const cheap = { id: 'x1', baseId: 'wpn-t1-sword', rolls: [{ affixId: 'aff-atk', value: 2 }] }
  const pricey = { id: 'x2', baseId: 'wpn-t2-bow', rolls: [{ affixId: 'aff-atk', value: 2 }, { affixId: 'aff-hp', value: 10 }, { affixId: 'aff-def', value: 2 }] }
  console.log(`⑪ 变卖价：T1 单词条 ${sellValue(cheap)} / T2 三词条 ${sellValue(pricey)}`)
  if (sellValue(pricey) <= sellValue(cheap)) econFailures.push('⑪ 变卖价未随品质单调')

  // 11b:冷却防软锁——存活充足 2 场,人手不足减半 1 场
  if (cooldownNeeded(4) !== 2 || cooldownNeeded(2) !== 0) econFailures.push('⑪ 冷却规则失效(人手不足必须免冷却防软锁)')

  // 11c:访客生成 30 次——合法职业/等级/故事非空
  let badVisitor = 0
  for (let i = 0; i < 30; i++) {
    const squad = JOBS.map((job, j) => generateMember(job, 5, 300000 + i * 50 + j))
    const v = rollVisitor(() => 0.5, squad)
    const jobsOk = ['guard', 'priest', 'ranger'].includes(v.member.job)
    if (!jobsOk || v.member.level < 1 || v.story.length === 0) badVisitor++
  }
  console.log(`⑩·五 访客：30 次生成,非法 ${badVisitor}`)
  if (badVisitor > 0) econFailures.push('⑩·五 访客生成非法')

  // 11d:悬赏指定职业——3 职业各 roll 5 次全部命中
  let wrongJob = 0
  for (const job of ['guard', 'priest', 'ranger'] as const) {
    for (let i = 0; i < 5; i++) {
      const squad = JOBS.map((job2, j) => generateMember(job2, 5, 310000 + i * 50 + j))
      if (bountyCandidate(() => 0.5, squad, job).job !== job) wrongJob++
    }
  }
  console.log(`⑩·五 悬赏：定向 15 次,职业错配 ${wrongJob}`)
  if (wrongJob > 0) econFailures.push('⑩·五 悬赏职业错配')

  // 11e:存档迁移链——v1 旧档 → v2 补经济字段
  const migrated = migrate({ version: 1, members: [{ id: 'm1', name: '测试', job: 'guard', level: 5, nature: {}, personality: {}, attrs: {}, hp: 1, equipment: {}, alive: true }], inventory: [], memorial: [], manual: [], protectOn: true })
  console.log('⑩·五 迁移明细:', JSON.stringify({ version: migrated.version, gold: migrated.gold, blessing: migrated.blessing, cd: migrated.recruitCooldown, exp: migrated.members[0].exp, towerBest: migrated.towerBest }))
  const migOk = migrated.version >= 2 && migrated.gold === 150 && migrated.blessing === 0 && migrated.recruitCooldown === 0 && migrated.members[0].exp === 0 && migrated.towerBest === 0
  console.log(`⑩·五 存档迁移：v1 → v${migrated.version},经济字段 ${migOk ? '完整' : '缺失'}`)
  if (!migOk) econFailures.push('⑩·五 v1→v2 迁移失败')
}

if (econFailures.length > 0) {
  console.log('✗ 经济与酒馆未通过:', econFailures)
  process.exit(1)
}
console.log('✓ 经济与酒馆验证通过：变卖/冷却/访客/悬赏/迁移按设计工作')

// ============================================================
// ⑧·六 黑苔高塔（M1 P1）：缩放/分层残酷/层循环
// ============================================================
const towerFailures: string[] = []
{
  // 12a:强度单调递增
  if (!(towerEnemyScale(1) < towerEnemyScale(3) && towerEnemyScale(3) < towerEnemyScale(9))) {
    towerFailures.push('⑫ 强度缩放不单调')
  }
  // 12b:分层残酷规则逐层检视(直接生成命令,不依赖打赢)
  {
    const squad = JOBS.map((job, j) => generateMember(job, 6, 777 + j))
    const run = startTower(squad, 4242)
    let rulesOk = true
    for (let floor = 1; floor <= 10; floor++) {
      if (floor > 1) towerNext(run, 999 + floor * 17)
      const b = run.battle!
      const half = b.commands.healStock === 1
      const prot = b.commands.protectRetreat
      if (floor >= TOWER.potionHalfFromFloor && !half) { rulesOk = false; break }
      if (floor < TOWER.potionHalfFromFloor && half) { rulesOk = false; break }
      if (floor <= TOWER.protectUntilFloor && !prot) { rulesOk = false; break }
      if (floor > TOWER.protectUntilFloor && prot) { rulesOk = false; break }
    }
    console.log(`⑫ 分层残酷:1–4 层保护/5 层起药减半/9 层起保护失效 = ${rulesOk}`)
    if (!rulesOk) towerFailures.push('⑫ 分层残酷规则失效')
  }

  // 12c:真实战斗一层(第 1 层零指挥必胜)→ 休整推进;撤退=塔结束
  {
    const run = startTower(JOBS.map((job, j) => generateMember(job, 5, 888 + j)), 313)
    const b = run.battle!
    while (b.status === 'running' && b.tick < 4000) stepBattle(b)
    const r1 = settleTowerFloor(run)
    if (b.status === 'guild-win' && (!r1.cleared || r1.gold !== towerGold(1))) {
      towerFailures.push('⑫ 胜场金币/层推进异常')
    }
    if (run.phase === 'rest') {
      towerNext(run, 9999)
      if (run.floor !== 2) towerFailures.push('⑫ 层推进异常')
    }
    // 撤退结束
    const b2 = run.battle!
    b2.commands.extractingUntil = b2.tick + 1
    while (b2.status === 'running' && b2.tick < 4000) stepBattle(b2)
    const r2 = settleTowerFloor(run)
    if (run2check(r2, run)) towerFailures.push('⑫ 撤退未正确结束塔')
    console.log(`⑫ 层循环:首层金币 ${r1.gold},撤退后状态 ${run.phase}/${run.result ?? '-'}`)
  }
  function run2check(r2: { gold: number }, run: ReturnType<typeof startTower>): boolean {
    return run.phase !== 'ended' || run.result !== 'left' || r2.gold !== 0
  }
  console.log('✓ 黑苔高塔验证通过:缩放/分层残酷/层循环按设计工作')
}

// ============================================================
// ⑧·七 离线累积与存档导出/导入（M1 P1）
// ============================================================
{
  const fail13: string[] = []
  // 13a:离线数学——3 人 2 小时 = 48 金;24h 上限;短时不给
  const squad = JOBS.map((job, j) => generateMember(job, 5, 100 + j))
  const now = 1000000000000
  const two = offlineGain(squad, now - 2 * 3600000, now)
  if (two.gold !== 48 || two.hours !== 2) fail13.push(`⑬ 3 人 2 小时应得 48 金,得 ${two.gold}`)
  const capped = offlineGain(squad, now - 48 * 3600000, now)
  if (capped.hours !== 24) fail13.push('⑬ 离线 48 小时未按 24 小时封顶')
  if (capped.gold !== 576) fail13.push(`⑬ 24 小时应得 576 金,得 ${capped.gold}`)
  const short = offlineGain(squad, now - 5 * 60000, now)
  if (short.gold !== 0) fail13.push('⑬ 短于门槛不应给钱')
  console.log(`⑬ 离线:2h=${two.gold} 金 / 48h 封顶 24h=${capped.gold} 金 / 短时不给 = ${short.gold === 0}`)

  // 13b:导出/导入回环——字段完整还原
  const saveObj = { version: SAVE_VERSION, members: squad, inventory: [], memorial: [], manual: ['grush'], protectOn: true, gold: 123, blessing: 4, recruitCooldown: 1, towerBest: 6, lastSeen: now, chronicle: [{ seq: 1, day: 2, text: '测试条目' }], day: 2, buildings: { training: 1 }, potions: { heal: 2, fury: 1 }, unlockedHybrids: [] }
  const code = exportSave(saveObj)
  const back = importSave(code)
  const roundOk = back !== null && back.gold === 123 && back.manual[0] === 'grush' && back.members[0].exp === squad[0].exp && back.towerBest === 6 && back.potions.heal === 2 && back.potions.fury === 1 && Array.isArray(back.unlockedHybrids)
  console.log(`⑬ 导出导入:回环 ${roundOk},码长 ${code.length}`)
  if (!roundOk) fail13.push('⑬ 导出导入回环失败')
  if (importSave('垃圾输入!!!') !== null) fail13.push('⑬ 无效码未被拒绝')

  // 13c:v3 → v7 迁移逐级补字段(lastSeen/buildings/potions)
  const v4 = migrate({ ...saveObj, version: 3, towerBest: 6 })
  if (typeof v4.lastSeen !== 'number' || v4.version !== SAVE_VERSION) fail13.push('⑬ v3→v4 迁移失败')
  if (v4.potions?.heal !== 3 || v4.potions?.fury !== 3) fail13.push('⑬ v6→v7 迁移未补药水库存')
  console.log(`⑬ 迁移:v3 → v${v4.version},lastSeen/buildings/potions 已补`)

  if (fail13.length > 0) {
    console.log('✗ 离线/存档未通过:', fail13)
    process.exit(1)
  }
  console.log('✓ 离线累积与存档导出/导入验证通过')
}

// ============================================================
// ⑧·八 灵魂层（M1 P2）：士气/关系/编年史
// ============================================================
{
  const fail14: string[] = []
  const squad = JOBS.map((job, j) => generateMember(job, 5, 555 + j))
  seedMemberSeq(squad)

  // 14a:队友阵亡 → 目击者士气受创 + 默契深化(性格加权:勇猛扛得住,忠诚羁绊深)
  const before = squad[0].morale ?? 60
  const bondsBefore = squad[0].bonds[squad[1].id] ?? 0
  applyDeathShock(squad[1].id, squad)
  const afterDeath = squad[0].morale ?? 60
  const braveLoss = clamp(before) - clamp(before - MORALE.deathShock * (1 - (squad[0].personality.bravery / 100) * 0.5))
  console.log(`⑭ 阵亡冲击:士气 ${before} → ${afterDeath}(性格加权期望 -${braveLoss.toFixed(1)}),默契 +${(squad[0].bonds[squad[1].id] ?? 0) - bondsBefore}`)
  if (afterDeath >= before) fail14.push('⑭ 阵亡冲击未生效')
  if (Math.abs((before - afterDeath) - braveLoss) > 0.01) fail14.push('⑭ 阵亡冲击未按勇猛性格加权')
  if ((squad[0].bonds[squad[1].id] ?? 0) < 2) fail14.push('⑭ 患难默契未深化')

  // 14b:庆功宴回升
  applyFeast(squad)
  const afterFeast = squad[0].morale ?? 60
  console.log(`⑭ 庆功宴:士气 → ${afterFeast}`)
  if (afterFeast <= afterDeath) fail14.push('⑭ 庆功宴未生效')

  // 14c:低士气拒绝出击 + 编年史
  squad[2].morale = MORALE.refuseThreshold - 1
  if (!refusesToMarch(squad[2])) fail14.push('⑭ 心碎英雄未拒绝出击')
  const c1 = chronicleRefusal(3, [squad[2]])
  if (!c1.text.includes(squad[2].name)) fail14.push('⑭ 拒绝编年史缺名')
  console.log(`⑭ 拒绝:士气 ${squad[2].morale} 拒绝出击,编年史“${c1.text}”`)

  if (fail14.length > 0) {
    console.log('✗ 灵魂层未通过:', fail14)
    process.exit(1)
  }
  console.log('✓ 灵魂层验证通过:士气/关系/编年史按设计工作')
}

// ============================================================
// ⑧·九 公会基地（M1 P2）：建筑效果接线与迁移
// ============================================================
{
  const fail15: string[] = []
  // 15a:效果汇总——建筑等级单调提升各加成
  const fx0 = baseEffects({})
  const fx3 = baseEffects({ training: 3, tavern: 3, smithy: 3, shrine: 3, infirmary: 3 })
  console.log(`⑮ 基地效果:经验 x${fx0.expMult}→x${fx3.expMult},访客率 ${(fx0.visitorChance * 100).toFixed(0)}%→${(fx3.visitorChance * 100).toFixed(0)}%,变卖 x${fx0.sellMult}→x${fx3.sellMult},祝福/亡 ${fx0.blessingPerDeath}→${fx3.blessingPerDeath}`)
  if (fx3.expMult <= fx0.expMult || fx3.visitorChance <= fx0.visitorChance || fx3.sellMult <= fx0.sellMult || fx3.blessingPerDeath <= fx0.blessingPerDeath || fx3.towerRestHealPct <= fx0.towerRestHealPct) {
    fail15.push('⑮ 建筑加成未单调提升')
  }
  if (fx0.visitorLevelBonus !== 0 || fx3.visitorLevelBonus !== 1) fail15.push('⑮ 酒馆 2 级候选加成逻辑错误')
  // 15b:变卖价加成
  const cheap = { id: 'x', baseId: 'wpn-t1-sword', rolls: [{ affixId: 'aff-atk', value: 2 }] }
  const base57 = sellValueFn(cheap)
  if (sellValueFn(cheap, 1.45) !== Math.round(base57 * 1.45)) fail15.push('⑮ 变卖加成计算错误')
  // 15c:建筑表完整性——costs 长度 = maxLevel,id 唯一
  const ids = new Set<string>()
  for (const def of BUILDINGS) {
    if (ids.has(def.id)) fail15.push(`⑮ 建筑 id 重复: ${def.id}`)
    ids.add(def.id)
    if (def.costs.length !== def.maxLevel) fail15.push(`⑮ ${def.name} costs 长度不等于 maxLevel`)
    for (const c of def.costs) if (c.gold <= 0) fail15.push(`⑮ ${def.name} 有非正金币成本`)
  }
  // 15d:经验加成接线——settleGrowth 乘数
  {
    const squad = JOBS.map((job, j) => generateMember(job, 5, 4321 + j))
    const run1 = createRun(squad, BLACKMOSS, 'shortcut', 1)
    const b1 = run1.battle!
    while (b1.status === 'running' && b1.tick < 2000) stepBattle(b1)
    advanceRun(run1)
    markPermadeath(run1)
    settleGrowth(run1, 1)
    const exp1 = squad[0].exp
    const squad2 = JOBS.map((job, j) => generateMember(job, 5, 5321 + j))
    const run2 = createRun(squad2, BLACKMOSS, 'shortcut', 1)
    const b2 = run2.battle!
    while (b2.status === 'running' && b2.tick < 2000) stepBattle(b2)
    advanceRun(run2)
    markPermadeath(run2)
    settleGrowth(run2, 1.3)
    const exp2 = squad2[0].exp
    console.log(`⑮ 训练场:基准经验 ${exp1} vs x1.3 → ${exp2}`)
    if (exp2 <= exp1) fail15.push('⑮ 训练场经验加成未生效')
  }
  // 15e:v5 → v6 迁移补 buildings
  const v6 = migrate({ version: 5, members: [], inventory: [], memorial: [], manual: [], protectOn: true, gold: 0, blessing: 0, recruitCooldown: 0, towerBest: 0, lastSeen: 0, chronicle: [], day: 1 })
  if (v6.buildings === undefined || v6.version < 6) fail15.push('⑮ v5→v6 迁移失败')
  console.log(`⑮ 迁移:v5 → v${v6.version},buildings 已补`)
  if (fail15.length > 0) {
    console.log('✗ 公会基地未通过:', fail15)
    process.exit(1)
  }
  console.log('✓ 公会基地验证通过:效果接线/成本表/经验加成/迁移按设计工作')
}

// ============================================================
// ⑧·十 大事事件池（M1 P2）：完整性/权重解析/效果应用
// ============================================================
{
  const fail16: string[] = []
  // 16a:事件池完整性——id 唯一、每事件 ≥2 选项、每选项权重和 ≥1、文本非空
  const ids = new Set<string>()
  for (const ev of GUILD_EVENTS) {
    if (ids.has(ev.id)) fail16.push(`⑯ 事件 id 重复: ${ev.id}`)
    ids.add(ev.id)
    if (!ev.title || !ev.text) fail16.push(`⑯ ${ev.id} 标题/引文为空`)
    if (ev.choices.length < 2) fail16.push(`⑯ ${ev.id} 选项不足 2 个`)
    for (const c of ev.choices) {
      if (!c.text) fail16.push(`⑯ ${ev.id} 有空选项文本`)
      const sum = c.outcomes.reduce((s2, o) => s2 + o.weight, 0)
      if (sum < 1) fail16.push(`⑯ ${ev.id} 有选项权重和 < 1`)
      for (const o of c.outcomes) if (!o.text) fail16.push(`⑯ ${ev.id} 有空结果文本`)
    }
  }
  console.log(`⑯ 事件池:${GUILD_EVENTS.length} 个事件,触发率 ${(EVENT_CHANCE * 100).toFixed(0)}%`)
  if (GUILD_EVENTS.length < 8) fail16.push('⑯ 事件池不足 8 个')
  // 16b:权重解析——rng=0.99 应命中最后一个(最高累计权重)分支;rng=0.01 应命中首个
  const ev0 = GUILD_EVENTS[0]
  const first = pickOutcome(ev0, 0, 0.01)
  const last = pickOutcome(ev0, 0, 0.999)
  if (first === last && ev0.choices[0].outcomes.length > 1) fail16.push('⑯ 权重解析不区分分支')
  // 16c:rollGuildEvent——高 rng 必中事件,低 rng 必空
  if (rollGuildEvent(() => 0.44) === null) fail16.push('⑯ 低于触发率应触发事件')
  if (rollGuildEvent(() => 0.99) !== null) fail16.push('⑯ 高于触发率不应触发事件')
  // 16d:效果应用——士气 delta 与金币真实落账
  {
    const squad = JOBS.map((job, j) => generateMember(job, 5, 700 + j))
    const before = squad[0].morale ?? 60
    applyMoraleDelta([squad[0]], -20)
    if ((squad[0].morale ?? 0) !== before - 20) fail16.push('⑯ 士气 delta 应用失败')
    const item = rollDrop('wpn-t2-bow', () => 0.99)
    if (item.baseId !== 'wpn-t2-bow' || item.rolls.length === 0) fail16.push('⑯ 事件装备 roll 异常')
    chronicleRaw(1, '⑯ 测试条目')
  }
  if (fail16.length > 0) {
    console.log('✗ 大事事件池未通过:', fail16)
    process.exit(1)
  }
  console.log('✓ 大事事件池验证通过:完整性/权重解析/效果应用按设计工作')
}

// ============================================================
// ⑰ 指挥有感（体验感优化 P0）：payoff 事件 / boss 意图窗口 / 施法条数据
// ============================================================
{
  const fail17: string[] = []
  // 17a:震地 payoff 事件——slam 必须发出且 mitigated 与阵型一致(「我的指令救了全队」要可见)
  {
    const b = createBattle(JOBS.map((job, j) => generateMember(job, 5, 930000 + j)), BLACKMOSS, 'enc-grush', 1777)
    while (b.status === 'running' && b.tick < MAX_TICK) {
      if (b.tick % 5 === 0) setStance(b, 'spread')
      stepBattle(b)
    }
    const slams = b.events.filter((e) => e.type === 'slam')
    if (slams.length === 0) fail17.push('⑰ 分散局 slam 事件未发出')
    if (!slams.every((e) => e.mitigated === true)) fail17.push('⑰ 分散阵型下 mitigated 应恒为 true')
    const b2 = createBattle(JOBS.map((job, j) => generateMember(job, 5, 933000 + j)), BLACKMOSS, 'enc-grush', 2777)
    while (b2.status === 'running' && b2.tick < MAX_TICK) stepBattle(b2)
    const slams2 = b2.events.filter((e) => e.type === 'slam')
    if (slams2.length === 0) fail17.push('⑰ 无指挥局 slam 事件未发出')
    if (!slams2.every((e) => e.mitigated === false)) fail17.push('⑰ 默认阵型下 mitigated 应恒为 false')
    console.log(`⑰ slam payoff:分散局 ${slams.length} 次(全减伤) / 无指挥局 ${slams2.length} 次(全量命中)`)
  }
  // 17b:bossIntents——蓄力/咏唱窗口必须能被指挥台查到(按钮脉冲的地基)
  {
    const b = createBattle(JOBS.map((job, j) => generateMember(job, 5, 940000 + j)), BLACKMOSS, 'enc-grush', 3777)
    let sawTelegraph = false
    let sawCalm = false
    while (b.status === 'running' && b.tick < MAX_TICK) {
      stepBattle(b)
      const it = bossIntents(b)
      if (it.telegraphing) {
        sawTelegraph = true
        const armed = b.combatants.some(
          (c) => c.boss && c.alive && c.mech?.['telegraph-aoe']?.until !== undefined,
        )
        if (!armed) fail17.push('⑰ telegraphing=true 但未查到蓄力中的 boss')
      } else if (b.tick > 200) {
        sawCalm = true
      }
    }
    if (!sawTelegraph) fail17.push('⑰ 全程未观察到蓄力窗口(bossIntents 失明)')
    if (!sawCalm) fail17.push('⑰ bossIntents 永远为 true(窗口判定失效)')
    console.log(`⑰ 意图窗口:蓄力期可见=${sawTelegraph} 静默期归零=${sawCalm}`)
  }
  // 17c:casting 事件带时长(施法条演出需要),集火打断链路完整(打断是概率事件→多种子统计)
  {
    let castCount = 0
    let intBattles = 0
    for (let i = 0; i < 10; i++) {
      const b = createBattle(JOBS.map((job, j) => generateMember(job, 5, 950000 + i * 100 + j)), BLACKMOSS, 'enc-talma', 4777 + i * 13)
      while (b.status === 'running' && b.tick < MAX_TICK) {
        if (b.tick % 5 === 0) {
          const boss = b.combatants.find((c) => c.boss && c.alive)
          if (boss) setFocus(b, boss.id)
        }
        stepBattle(b)
      }
      const casts = b.events.filter((e) => e.type === 'casting')
      castCount += casts.length
      if (!casts.every((e) => (e.amount ?? 0) > 0)) fail17.push('⑰ casting 事件缺时长(施法条画不出来)')
      if (b.events.some((e) => e.type === 'interrupted')) intBattles++
    }
    if (castCount === 0) fail17.push('⑰ casting 事件未发出')
    if (intBattles < 3) fail17.push(`⑰ 集火打断战局过少 ${intBattles}/10(打断链路疑似失效)`)
    console.log(`⑰ 施法条:咏唱 ${castCount} 次均带时长,集火打断 ${intBattles}/10 局`)
  }
  if (fail17.length > 0) {
    console.log('✗ 指挥有感未通过:', fail17)
    process.exit(1)
  }
  console.log('✓ 指挥有感验证通过:payoff 事件/意图窗口/施法条数据按设计工作')
}

// ============================================================
// ⑱ 战斗节奏带(节奏改版 2026-09-20):杂兵 15-20s / boss 35-45s(容忍 ±)
// 用「像样指挥」机器人测:每 5tick 集火 boss、蓄力切分散(代表正常玩家操作)
// ============================================================
{
  const fail18: string[] = []

  // 像样指挥:集火 + 蓄力切分散(不用药水/撤退,纯 dps+机制应对)
  const runCommanded = (encId: string, seed: number): number => {
    const squad = JOBS.map((job, j) => generateMember(job, 5, 970000 + seed * 100 + j))
    const b = createBattle(squad, BLACKMOSS, encId, seed * 31 + 7)
    while (b.status === 'running' && b.tick < MAX_TICK) {
      if (b.tick % 5 === 0) {
        const intents = bossIntents(b)
        setStance(b, intents.telegraphing ? 'spread' : 'standard')
        const boss = b.combatants.find((c) => c.boss && c.alive)
        if (boss) setFocus(b, boss.id)
      }
      stepBattle(b)
    }
    return b.tick / 10
  }

  // 18a:杂兵带 15-20s(容忍 13-23)
  {
    const trashIds = ['enc-frogs', 'enc-wolves', 'enc-leeches']
    const durations: number[] = []
    for (let i = 0; i < 6; i++) for (const enc of trashIds) durations.push(runCommanded(enc, i))
    durations.sort((a, b) => a - b)
    const med = durations[Math.floor(durations.length / 2)]
    console.log(`⑱ 杂兵时长中位 ${med.toFixed(1)}s(带 15-20s,容忍 13-23)`)
    if (med < 13 || med > 23) fail18.push(`⑱ 杂兵节奏越带 ${med.toFixed(1)}s`)
  }
  // 18b:boss 带 35-45s(容忍 30-50)
  {
    const durations: number[] = []
    for (let i = 0; i < 6; i++) {
      durations.push(runCommanded('enc-grush', 100 + i))
      durations.push(runCommanded('enc-talma', 200 + i))
    }
    durations.sort((a, b) => a - b)
    const med = durations[Math.floor(durations.length / 2)]
    console.log(`⑱ boss 时长中位 ${med.toFixed(1)}s(带 35-45s,容忍 30-50)`)
    if (med < 30 || med > 50) fail18.push(`⑱ boss 节奏越带 ${med.toFixed(1)}s`)
  }
  if (fail18.length > 0) {
    console.log('✗ 战斗节奏未通过:', fail18)
    process.exit(1)
  }
  console.log('✓ 战斗节奏带验证通过:杂兵/boss 时长符合温和放慢设计')
}

// ============================================================
// ⑲ 副本注册表完整性 + 新副本节奏带(副本扩量的验收模板:新图照此补断言)
// ============================================================
{
  const fail19: string[] = []
  for (const d of DUNGEONS) {
    // 引用完整性:encounter → group/boss 必须存在,组必须非空
    const groupIds = new Set(Object.keys(d.enemyGroups))
    for (const enc of d.encounters) {
      if (enc.kind === 'wave') {
        if (enc.enemyGroupIds.length === 0) fail19.push(`⑲ ${d.id}/${enc.id} wave 无怪组`)
        for (const gid of enc.enemyGroupIds) {
          if (!groupIds.has(gid)) fail19.push(`⑲ ${d.id}/${enc.id} 怪组缺失 ${gid}`)
          for (const e of d.enemyGroups[gid] ?? []) {
            if (!e.id || e.maxHp <= 0) fail19.push(`⑲ ${d.id} 怪组 ${gid} 含非法敌人`)
            if (e.archetype === undefined && e.maxHp > 600) fail19.push(`⑲ ${d.id}/${gid} 大血量怪未标原型`)
          }
        }
      }
      if (enc.kind === 'boss' && !d.bosses[enc.bossId ?? '']) fail19.push(`⑲ ${d.id}/${enc.id} boss 缺失`)
    }
    // 机制引用完整性:summon 的 groupId 必须存在
    for (const boss of Object.values(d.bosses)) {
      for (const m of boss.mechanics) {
        if (m.kind === 'summon' && !groupIds.has(String(m.params.groupId))) {
          fail19.push(`⑲ ${d.id}/${boss.id} 召唤怪组缺失 ${m.params.groupId}`)
        }
      }
    }
  }
  // 每张注册副本同带验收(首杂兵场 + 末位 boss)——新图登记进注册表自动获得节奏验收
  // 「像样指挥」= 走位/集火/喝药(与⑩会玩机器人同标准;纯白嫖打法打不过毕业考 boss 属预期)
  // 编制随副本:5 人团本出 5 人机器人(双游侠双铁卫单牧师),3 人本照旧
  const RAID5_JOBS = ['guard', 'priest', 'ranger', 'ranger', 'guard'] as const
  const probe = (dungeon: typeof DUNGEONS[number], encId: string, seed: number): number => {
    const comp = dungeon.size >= 5 ? RAID5_JOBS : JOBS
    const squad = comp.map((job, j) => generateMember(job, 5, 980000 + seed * 100 + j))
    const b = createBattle(squad, dungeon, encId, seed * 31 + 7, 0, 0, false)
    while (b.status === 'running' && b.tick < MAX_TICK) {
      if (b.tick % 5 === 0) {
        const intents = bossIntents(b)
        setStance(b, intents.telegraphing ? 'spread' : 'standard')
        const boss = b.combatants.find((c) => c.boss && c.alive)
        if (boss) setFocus(b, boss.id)
        const lowest = b.combatants
          .filter((c) => c.alive && c.team === 'guild')
          .reduce((a, c) => (a.hp / a.maxHp <= c.hp / c.maxHp ? a : c))
        if (lowest.hp / lowest.maxHp < 0.55) useHealPotion(b)
        if (boss?.mech?.['enrage']?.fired === 1) useFuryPotion(b)
      }
      stepBattle(b)
    }
    return b.status === 'guild-win' ? b.tick / 10 : -1
  }
  for (const d of DUNGEONS) {
    const waveEnc = d.encounters.find((e) => e.kind === 'wave')
    const bossEncs = d.encounters.filter((e) => e.kind === 'boss')
    if (!waveEnc || bossEncs.length === 0) {
      fail19.push(`⑲ ${d.id} 缺 wave/boss 场`)
      continue
    }
    const trash: number[] = []
    for (let i = 0; i < 6; i++) {
      const t = probe(d, waveEnc.id, i)
      if (t > 0) trash.push(t)
    }
    const medT = trash.length ? [...trash].sort((a, b) => a - b)[Math.floor(trash.length / 2)] : 0
    console.log(`⑲ ${d.name}:杂兵 ${medT.toFixed(1)}s(胜 ${trash.length}/6)`)
    if (trash.length < 5 || medT < 13 || medT > 23) fail19.push(`⑲ ${d.name} 杂兵节奏越带 ${medT.toFixed(1)}s`)
    // 每个 boss 都要过考试(不只末位):验收机器人无撤退保护、打法标准化,≥4/8 为可达性下限
    // (真人另有撤退保护/药水存量/练度垫);节奏带只约束毕业考,门考只要求 ≥20s(不可是秒杀)
    for (const enc of bossEncs) {
      const bossD: number[] = []
      for (let i = 0; i < 8; i++) {
        const t = probe(d, enc.id, i)
        if (t > 0) bossD.push(t)
      }
      const medB = bossD.length ? [...bossD].sort((a, b) => a - b)[Math.floor(bossD.length / 2)] : 0
      const isFinal = enc.id === bossEncs[bossEncs.length - 1].id
      console.log(`⑲   ${isFinal ? '毕业考' : '门考'} ${enc.name} ${medB.toFixed(1)}s(胜 ${bossD.length}/8)`)
      if (bossD.length < 4) fail19.push(`⑲ ${d.name} ${enc.name} 验收胜率不足 ${bossD.length}/8`)
      if (medB < 20) fail19.push(`⑲ ${d.name} ${enc.name} 节奏越带 ${medB.toFixed(1)}s`)
      if (isFinal && medB > 50) fail19.push(`⑲ ${d.name} ${enc.name} 节奏越带 ${medB.toFixed(1)}s`)
    }
  }
  if (fail19.length > 0) {
    console.log('✗ 副本注册表未通过:', fail19)
    process.exit(1)
  }
  console.log(`✓ 副本注册表完整性 + 锈坑矿道节奏带验证通过(${DUNGEONS.length} 张图)`)
}

// ============================================================
// ⑨ 平衡曲线（D13）：指挥机器人在四档操作水平下的胜率窗口
//    档位：零指挥(只靠撤退保护) / 平庸(只交药) / 中位(集火+交药) / 会玩(全套指挥)
//    设计契约：杂兵绝对安全；格鲁什有牙齿但不墙人；塔尔玛墙住"不参与"，
//    中位操作有约七成胜率；会玩稳赢。任何一侧越界 = 平衡回归。
// ============================================================
{
  const N = 80
  const midAddSeen = new WeakMap<object, number>()
  const tier = {
    none: { protect: true, act: (_b: ReturnType<typeof createBattle>, _encId: string) => {} },
    meh: { protect: true, act: (b: ReturnType<typeof createBattle>, _encId: string) => { if (b.tick % 5) return; const lowest = b.combatants.filter((c) => c.alive && c.team === 'guild').reduce((a, c) => (a.hp / a.maxHp <= c.hp / c.maxHp ? a : c)); if (lowest.hp / lowest.maxHp < 0.3) useHealPotion(b) } },
    mid: { protect: true, act: (b: ReturnType<typeof createBattle>, _encId: string) => { if (b.tick % 5) return; const boss = b.combatants.find((c) => c.alive && c.bossMechanics); const adds = b.combatants.filter((c) => c.alive && c.team === 'enemy' && !c.bossMechanics); if (adds.length > 0) { if (!midAddSeen.has(b)) midAddSeen.set(b, b.tick); if (b.tick - (midAddSeen.get(b) ?? b.tick) >= 12) setFocus(b, adds.reduce((a, c) => (a.hp <= c.hp ? a : c)).id); else if (boss) setFocus(b, boss.id); } else { midAddSeen.delete(b); if (boss) setFocus(b, boss.id); } if (boss?.mech?.['enrage']?.fired === 1) useFuryPotion(b); const lowest = b.combatants.filter((c) => c.alive && c.team === 'guild').reduce((a, c) => (a.hp / a.maxHp <= c.hp / c.maxHp ? a : c)); if (lowest.hp / lowest.maxHp < 0.35) useHealPotion(b) } },
    good: { protect: false, act: (b: ReturnType<typeof createBattle>, encId: string) => { if (b.tick % 5) return; const boss = b.combatants.find((c) => c.alive && c.bossMechanics); const casting = boss?.mech?.['cast-buff'] !== undefined && boss!.mech!['cast-buff'].until !== undefined; const telegraphing = boss?.mech?.['telegraph-aoe'] !== undefined && boss!.mech!['telegraph-aoe'].until !== undefined; const adds = b.combatants.filter((c) => c.alive && c.team === 'enemy' && !c.bossMechanics); if (telegraphing) setStance(b, 'spread'); else if (b.commands.stance === 'spread') setStance(b, 'standard'); if (casting && boss) setFocus(b, boss.id); else if (adds.length > 0) setFocus(b, adds.reduce((a, c) => (a.hp <= c.hp ? a : c)).id); else if (boss) setFocus(b, boss.id); const lowest = b.combatants.filter((c) => c.alive && c.team === 'guild').reduce((a, c) => (a.hp / a.maxHp <= c.hp / c.maxHp ? a : c)); if (lowest.hp / lowest.maxHp < 0.55) useHealPotion(b); if (boss && (boss.mech?.['enrage']?.fired === 1 || (encId === 'enc-grush' && boss.hp / boss.maxHp < 0.45))) useFuryPotion(b) } },
  } as const
  type Tier = keyof typeof tier

  function winRate(encId: string, t: Tier, geared = false): number {
    let wins = 0
    for (let i = 0; i < N; i++) {
      const squad = JOBS.map((job, j) => generateMember(job, 5, 300000 + i * 100 + j))
      if (geared) {
        const drops = rollBossDrops([
          { baseId: 'wpn-t2-bow', chance: 1 }, { baseId: 'arm-t2-plate', chance: 1 }, { baseId: 'trk-t2-totem', chance: 1 },
        ], 4000 + i)
        squad[2].equipment.weapon = drops[0]
        squad[0].equipment.armor = drops[1]
        squad[0].equipment.trinket = drops[2]
      }
      const b = createBattle(squad, BLACKMOSS, encId, 500000 + i * 13 + 1)
      b.commands.protectRetreat = tier[t].protect
      while (b.status === 'running' && b.tick < MAX_TICK) {
        tier[t].act(b, encId)
        stepBattle(b)
      }
      if (b.status === 'guild-win') wins++
    }
    return (wins / N) * 100
  }

  const balFailures: string[] = []
  const rates: Record<string, number> = {}
  const measure = (key: string, encId: string, t: Tier, geared = false) => {
    rates[key] = winRate(encId, t, geared)
  }
  measure('wave-none', 'enc-frogs', 'none')
  measure('grush-none', 'enc-grush', 'none')
  measure('grush-mid', 'enc-grush', 'mid')
  measure('grush-good', 'enc-grush', 'good')
  measure('talma-none', 'enc-talma', 'none')
  measure('talma-meh', 'enc-talma', 'meh')
  measure('talma-mid', 'enc-talma', 'mid')
  measure('talma-good', 'enc-talma', 'good')
  measure('talma-geared', 'enc-talma', 'good', true)

  console.log(
    `⑨ 平衡：杂兵${rates['wave-none'].toFixed(0)}% │ 格鲁什 零指挥${rates['grush-none'].toFixed(0)}/中位${rates['grush-mid'].toFixed(0)}/会玩${rates['grush-good'].toFixed(0)}% │ ` +
    `塔尔玛 零指挥${rates['talma-none'].toFixed(0)}/平庸${rates['talma-meh'].toFixed(0)}/中位${rates['talma-mid'].toFixed(0)}/会玩${rates['talma-good'].toFixed(0)}/会玩+T2${rates['talma-geared'].toFixed(0)}%`,
  )
  const expect = (key: string, lo: number, hi: number) => {
    if (rates[key] < lo || rates[key] > hi) balFailures.push(`${key}=${rates[key].toFixed(0)}% 越界 [${lo},${hi}]`)
  }
  expect('wave-none', 100, 100) // 杂兵战零指挥也必须全胜（门槛②的平衡面）
  expect('grush-none', 65, 100) // 有牙齿：不交药会掉进保护线，但不应墙死挂机
  expect('grush-mid', 60, 100) // D15:格鲁什=教程 boss(时长 28s+增援),考试是塔尔玛
  expect('grush-good', 95, 100)
  expect('talma-none', 0, 12) // 不参与指挥 = 打不过（指挥台存在的意义）
  expect('talma-meh', 0, 25) // 上限放宽：60-80 场样本的二项噪声约 ±9%，硬契约在"别太高"
  expect('talma-mid', 55, 90) // 只会点怪的新手也应有约七成机会
  expect('talma-good', 95, 100)
  expect('talma-geared', 95, 100) // T2 装备后稳赢（循环引力）
  if (balFailures.length > 0) {
    console.log('✗ 平衡曲线未通过:', balFailures)
    process.exit(1)
  }
  console.log('✓ 平衡曲线通过：技能曲线(零指挥→平庸→中位→会玩)与装备成长符合设计契约')
}

// ============================================================
// ⑳ 药水经济（2026-09 改造）：携带/消耗/退回/塔减半
// ============================================================
{
  const fail20: string[] = []
  const squad = JOBS.map((job, j) => generateMember(job, 5, 777 + j))
  seedMemberSeq(squad)
  const runToEnd = (b: { status: string }, guardMax = 20000) => {
    let guard = 0
    while ((b as { status: string }).status === 'running' && guard++ < guardMax) stepBattle(b as never)
    return guard < guardMax
  }

  // 20a:出征携带 → 战斗消耗逐场延续 → 回城退回剩余
  const run = createRun(squad, BLACKMOSS, 'shortcut', 4242, 0, true, { heal: 2, fury: 1 })
  const b1 = run.battle!
  runToEnd(b1)
  advanceRun(run)
  const after1 = { ...run.potions }
  if (run.phase !== 'battle' && run.phase !== 'victory' && run.potions.heal !== b1.commands.healStock) {
    fail20.push('⑳ 战斗结算未回写携带药水')
  }
  // 第二场继承第一场的余量(不再是每场白送 3+3)
  if (run.phase === 'battle') {
    startStep(run, 991)
    const b2 = run.battle!
    if (b2.commands.healStock !== after1.heal || b2.commands.furyStock !== after1.fury) {
      fail20.push(`⑳ 第二场未继承携带量(期望 ${after1.heal}/${after1.fury},实际 ${b2.commands.healStock}/${b2.commands.furyStock})`)
    }
    if (b2.commands.healStock > 0 && !useHealPotion(b2)) fail20.push('⑳ 有存量却喝不了药')
    const healAfterDrink = b2.commands.healStock
    runToEnd(b2)
    advanceRun(run)
    if (run.potions.heal !== healAfterDrink) fail20.push('⑳ 喝掉的药水未从携带量扣除')
  }
  console.log(`⑳ 远征携带:第一场后 ${after1.heal}/${after1.fury},回城时 ${run.potions.heal}/${run.potions.fury}`)

  // 20b:高塔——携带制 + 5 层起每场可用减半
  const t = startTower(squad, 20260921, { heal: 4, fury: 4 })
  if (t.battle!.commands.healStock !== 4) fail20.push('⑳ 塔 1 层应可用全部携带量')
  runToEnd(t.battle!)
  settleTowerFloor(t)
  const carryAfter1 = t.potions.heal
  if (carryAfter1 !== 4) fail20.push(`⑳ 塔 1 层未耗药时携带量应保持 4,得 ${carryAfter1}`)
  t.floor = 5
  startTowerFloor(t, 555)
  const deepStock = t.battle!.commands.healStock
  if (deepStock !== 2) fail20.push(`⑳ 塔 5 层每场可用应减半为 2,得 ${deepStock}`)
  if (t.potions.heal !== carryAfter1 - deepStock) fail20.push('⑳ 塔支取未从携带量扣除')
  runToEnd(t.battle!)
  settleTowerFloor(t)
  if (t.potions.heal !== carryAfter1 - deepStock + t.battle!.commands.healStock) fail20.push('⑳ 塔结算未退回未用药水')
  console.log(`⑳ 高塔:1 层带 4 → 5 层每场可用 ${deepStock},结算后携带 ${t.potions.heal}`)

  if (fail20.length > 0) {
    console.log('✗ 药水经济未通过:', fail20)
    process.exit(1)
  }
  console.log('✓ 药水经济通过:携带/逐场延续/消耗/退回/塔减半全链路成立')
}

// ============================================================
// ㉑ 新机制门禁（副本 #4/#5 配套）：治疗链可打断 + 霜寒减速生效
// ============================================================
{
  const fail21: string[] = []

  // 21a:血契共感(cast-heal)必须可打断——打断是治疗链机制的唯一解,不可打断即机制死路
  {
    let communionCasts = 0
    let communionInterrupts = 0
    for (let i = 0; i < 10; i++) {
      const squad = JOBS.map((job, j) => generateMember(job, 5, 981000 + i * 100 + j))
      const b = createBattle(squad, ABYSSALTAR, 'enc-malsau', i * 53 + 11)
      while (b.status === 'running' && b.tick < MAX_TICK) {
        if (b.tick % 5 === 0) {
          const boss = b.combatants.find((c) => c.boss && c.alive)
          if (boss) setFocus(b, boss.id) // 集火咏唱者:打断是队长该做的事
        }
        stepBattle(b)
      }
      communionCasts += b.log.filter((e) => e.text.includes('血契共感') && e.text.includes('开始咏唱')).length
      communionInterrupts += b.log.filter((e) => e.text.includes('血契共感') && e.text.includes('打断')).length
    }
    console.log(`㉑ 治疗链:血契共感咏唱 ${communionCasts} 次,打断 ${communionInterrupts} 次/10 场`)
    if (communionCasts === 0) fail21.push('㉑ 血契共感从未咏唱(机制未接线)')
    if (communionInterrupts < 3) fail21.push('㉑ 血契共感打断过少——cast-heal 打断链路失效')
  }

  // 21b:霜寒裹尸布(slow-touch)必须真实减速——间隔×2 是减速机制的核心
  {
    let slowedEvents = 0
    for (let i = 0; i < 10; i++) {
      const squad = JOBS.map((job, j) => generateMember(job, 5, 982000 + i * 100 + j))
      const b = createBattle(squad, FROSTGRAVE, 'enc-velhola', i * 71 + 3)
      while (b.status === 'running' && b.tick < MAX_TICK) stepBattle(b)
      slowedEvents += b.events.filter((e) => e.type === 'slowed').length
    }
    console.log(`㉑ 减速:霜寒裹尸布触发 ${slowedEvents} 次/10 场`)
    if (slowedEvents === 0) fail21.push('㉑ slow-touch 从未触发(被动未接线)')
  }
  {
    // 纯单元验证:被减速者行动瞬间置入的冷却必须精确等于平常的两倍
    const squad = JOBS.map((job, j) => generateMember(job, 5, 983001 + j))
    const b = createBattle(squad, BLACKMOSS, 'enc-frogs', 777)
    const member = b.combatants.find((c) => c.team === 'guild')!
    member.slowUntilTick = 9999
    member.cooldownLeft = 1 // 一步后恰好触发行动
    stepBattle(b)
    const normal = member.attackInterval
    if (member.cooldownLeft !== normal * 2) {
      fail21.push(`㉑ 减速未生效:减速行动后冷却 ${member.cooldownLeft},应为 ${normal * 2}`)
    }
    // 对照组:无减速时同一步进路径应得到平常间隔
    const b2 = createBattle(squad, BLACKMOSS, 'enc-frogs', 777)
    const member2 = b2.combatants.find((c) => c.team === 'guild')!
    member2.cooldownLeft = 1
    stepBattle(b2)
    if (member2.cooldownLeft !== normal) {
      fail21.push(`㉑ 对照组异常:正常行动后冷却 ${member2.cooldownLeft},应为 ${normal}`)
    }
    console.log(`㉑ 减速单元:平常间隔 ${normal},减速后 ${member.cooldownLeft},对照 ${member2.cooldownLeft}`)
  }

  if (fail21.length > 0) {
    console.log('✗ 新机制未通过:', fail21)
    process.exit(1)
  }
  console.log('✓ 新机制门禁通过:治疗链可打断/霜寒减速真实生效')
}

// ============================================================
// ㉒ 团本编制（副本 #6 起）：size 逐副本生效
// ============================================================
{
  const fail22: string[] = []
  const five = [...JOBS.map((j) => j), 'ranger', 'guard'].map((job, j) => generateMember(job as (typeof JOBS)[number], 5, 984000 + j * 13))

  // 22a:团本按副本编制上阵——5 人团本带 5 人,战斗里就是 5 个我方实体
  {
    const run = createRun(five, THORNHOLD, 'gateassault', 4242, 0, true)
    if (run.members.length !== 5) fail22.push(`㉒ 团本编制不是 5 人: ${run.members.length}`)
    const guildCount = run.battle!.combatants.filter((c) => c.team === 'guild').length
    if (guildCount !== 5) fail22.push(`㉒ 团本战斗我方实体不是 5: ${guildCount}`)
    console.log(`㉒ 团本上阵 ${run.members.length} 人,战斗我方实体 ${guildCount}`)
  }
  // 22b:回归——3 人本即使传 5 人也只带 3 人(小图不因大名单膨胀)
  {
    const run = createRun(five, BLACKMOSS, 'shortcut', 4242, 0, true)
    if (run.members.length !== 3) fail22.push(`㉒ 3 人本编制回归失败: ${run.members.length}`)
    console.log(`㉒ 3 人本回归:带 5 人名单只上阵 ${run.members.length} 人`)
  }
  // 22c:药水为全队共享指令,5 人战里喝一口仍按一份结算
  {
    const run = createRun(five, THORNHOLD, 'gateassault', 909, 0, true, { heal: 2, fury: 1 })
    if (!useHealPotion(run.battle!)) fail22.push('㉒ 团本喝药失败')
    if (run.battle!.commands.healStock !== 1) fail22.push('㉒ 团本药水未按份扣减')
    console.log(`㉒ 团本药水:喝一口后 heal 余 ${run.battle!.commands.healStock}(携带制,不随人数翻倍)`)
  }

  if (fail22.length > 0) {
    console.log('✗ 团本编制未通过:', fail22)
    process.exit(1)
  }
  console.log('✓ 团本编制通过:size 逐副本生效,3 人本回归无恙')
}

// ============================================================
// ㉓ 专精系统(宪法 v3 角色篇切片 1):数据完整性+新效果引擎单元验证
// ============================================================
{
  const fail23: string[] = []
  const KNOWN_EFFECTS = new Set([
    'heavy-strike', 'heal-lowest', 'taunt', 'group-heal', 'shield-ally', 'curse-mark',
    'summon-pet', 'multishot', 'frost-nova', 'enchant-self', 'charge-strike', 'trap-bind',
  ])

  // 23a:专精数据完整性——每线 defaultSpec 存在,每专精带身份句/技能/已知效果
  let specCount = 0
  for (const job of Object.values(JOB_TABLE)) {
    if (!job.specs[job.defaultSpec]) fail23.push(`㉓ ${job.id} defaultSpec 缺失`)
    for (const sp of Object.values(job.specs)) {
      specCount++
      if (!sp.identity) fail23.push(`㉓ ${sp.id} 缺身份句`)
      if (sp.skills.length === 0) fail23.push(`㉓ ${sp.id} 无技能`)
      for (const sk of sp.skills) {
        if (!KNOWN_EFFECTS.has(sk.effect)) fail23.push(`㉓ ${sp.id}/${sk.id} 未知效果 ${sk.effect}`)
      }
    }
  }
  console.log(`㉓ 专精表:${Object.keys(JOB_TABLE).length} 职业 / ${specCount} 专精`)

  // 23b:吸收盾——伤害先扣盾不进血
  {
    const squad = JOBS.map((j) => j).map((job, j) => generateMember(job as (typeof JOBS)[number], 5, 985000 + j))
    seedMemberSeq(squad)
    const b = createBattle(squad, BLACKMOSS, 'enc-frogs', 888)
    const victim = b.combatants.find((c) => c.team === 'guild')!
    victim.absorbShield = 50
    const hpBefore = victim.hp
    const attacker = b.combatants.find((c) => c.team === 'enemy')!
    applyHit(b, attacker, victim, 30, '测试')
    if (victim.hp !== hpBefore) fail23.push('㉓ 吸收盾未挡下伤害')
    if (victim.absorbShield !== 20) fail23.push(`㉓ 盾余量错误:${victim.absorbShield}`)
    applyHit(b, attacker, victim, 30, '测试')
    if (victim.hp >= hpBefore) fail23.push('㉓ 盾破后未进血')
    console.log(`㉓ 吸收盾:50 盾吃 30×2 → 血量 ${hpBefore - victim.hp}(应 10)`)
  }

  // 23c:反伤——近战命中者被反弹
  {
    const squad = JOBS.map((j) => j).map((job, j) => generateMember(job as (typeof JOBS)[number], 5, 986000 + j))
    seedMemberSeq(squad)
    const b = createBattle(squad, BLACKMOSS, 'enc-frogs', 888)
    const thorn = b.combatants.find((c) => c.team === 'guild')!
    thorn.counterMult = 0.3
    const attacker = b.combatants.find((c) => c.team === 'enemy')!
    const atkHp = attacker.hp
    applyHit(b, thorn, attacker, 100, '测试', { ranged: false })
    if (attacker.hp >= atkHp) fail23.push('㉓ 反伤未生效(近战命中未反弹)')
    console.log(`㉓ 反伤:命中 100 → 攻击者损 ${atkHp - attacker.hp}(应 30)`)
  }

  // 23d:诅咒易伤——同种子同伤害路径,易伤者受伤更多
  {
    const mk = () => {
      const squad = JOBS.map((j) => j).map((job, j) => generateMember(job as (typeof JOBS)[number], 5, 987000 + j))
      seedMemberSeq(squad)
      return createBattle(squad, BLACKMOSS, 'enc-frogs', 4242)
    }
    const bA = mk()
    const bB = mk()
    const victimA = bA.combatants.find((c) => c.team === 'guild')!
    const victimB = bB.combatants.find((c) => c.team === 'guild')!
    victimB.vulnUntilTick = 9999
    victimB.vulnMult = 1.25
    const atkA = bA.combatants.find((c) => c.team === 'enemy')!
    const atkB = bB.combatants.find((c) => c.team === 'enemy')!
    const hpA = victimA.hp
    const hpB = victimB.hp
    applyHit(bA, atkA, victimA, 100, '测试')
    applyHit(bB, atkB, victimB, 100, '测试')
    const dmgA = hpA - victimA.hp
    const dmgB = hpB - victimB.hp
    if (dmgB <= dmgA) fail23.push(`㉓ 易伤未放大伤害:${dmgA} → ${dmgB}`)
    console.log(`㉓ 易伤:基础 ${dmgA} → 易伤 ${dmgB}(应 ×1.25)`)
  }

  // 23e:召唤物——兽王/恶魔局的宠物入场,无 memberId(阵亡不进纪念堂)
  {
    let petSeen = 0
    for (let i = 0; i < 10; i++) {
      const squad = JOBS.map((j) => j).map((job, j) => generateMember(job as (typeof JOBS)[number], 5, 988000 + i * 100 + j))
      squad[2].spec = 'ranger-beastmaster'
      seedMemberSeq(squad)
      const b = createBattle(squad, BLACKMOSS, 'enc-frogs', i * 37 + 5)
      let guard = 0
      while (b.status === 'running' && guard++ < MAX_TICK) stepBattle(b)
      const pets = b.combatants.filter((c) => c.petOf)
      if (pets.length > 0) {
        petSeen++
        if (pets.some((p) => p.memberId)) fail23.push('㉓ 宠物带 memberId(会被记入永久死亡!)')
      }
    }
    if (petSeen < 8) fail23.push(`㉓ 召唤物入场率过低:${petSeen}/10`)
    console.log(`㉓ 召唤物:战狼入场 ${petSeen}/10 场,均无 memberId`)
  }

  // 23f:咏叹光环——持有者存活时全队 auraMult=1.1
  {
    const squad = JOBS.map((j) => j).map((job, j) => generateMember(job as (typeof JOBS)[number], 5, 989000 + j))
    squad[1].spec = 'priest-chanter'
    seedMemberSeq(squad)
    const b = createBattle(squad, BLACKMOSS, 'enc-frogs', 666)
    stepBattle(b)
    const ally = b.combatants.find((c) => c.team === 'guild' && c.specId !== 'priest-chanter')!
    if (ally.auraMult !== 1.1) fail23.push(`㉓ 光环未生效:${ally.auraMult}`)
    console.log(`㉓ 光环:队友 auraMult=${ally.auraMult}`)
  }

  if (fail23.length > 0) {
    console.log('✗ 专精系统未通过:', fail23)
    process.exit(1)
  }
  console.log('✓ 专精系统通过:18 专精数据完整,吸收盾/反伤/易伤/召唤/光环全部按设计工作')
}

// ============================================================
// ㉔ 性格→面板(属性改革切片 A):勇猛→伤害/谨慎→防御/贪婪→暴击/忠诚→受疗
// ============================================================
{
  const fail24: string[] = []
  const mk = (seed: number) => {
    const squad = JOBS.map((job, j) => generateMember(job, 5, 990000 + seed * 97 + j))
    seedMemberSeq(squad)
    return squad[0]
  }
  const brave = mk(1)
  brave.personality = { bravery: 100, caution: 50, greed: 50, loyalty: 50 }
  const timid = mk(1)
  timid.personality = { bravery: 0, caution: 50, greed: 50, loyalty: 50 }
  if (toCombatant(brave).attack <= toCombatant(timid).attack) fail24.push('㉔ 勇猛未提高攻击投影')
  const cautious = mk(2)
  cautious.personality = { bravery: 50, caution: 100, greed: 50, loyalty: 50 }
  const reckless = mk(2)
  reckless.personality = { bravery: 50, caution: 0, greed: 50, loyalty: 50 }
  if (toCombatant(cautious).defense <= toCombatant(reckless).defense) fail24.push('㉔ 谨慎未提高防御投影')
  const greedy = mk(3)
  greedy.personality = { bravery: 50, caution: 50, greed: 100, loyalty: 50 }
  const ascetic = mk(3)
  ascetic.personality = { bravery: 50, caution: 50, greed: 0, loyalty: 50 }
  if (toCombatant(greedy).critChance <= toCombatant(ascetic).critChance) fail24.push('㉔ 贪婪未提高暴击')
  const beloved = mk(4)
  beloved.personality = { bravery: 50, caution: 50, greed: 50, loyalty: 100 }
  const loathed = mk(4)
  loathed.personality = { bravery: 50, caution: 50, greed: 50, loyalty: 0 }
  if ((toCombatant(beloved).healReceived ?? 0) <= (toCombatant(loathed).healReceived ?? 0)) fail24.push('㉔ 忠诚未提高受疗')
  // 中性校验:全 50 时面板与无性格一致(不白给)
  const neutral = mk(5)
  neutral.personality = { bravery: 50, caution: 50, greed: 50, loyalty: 50 }
  const cNeutral = toCombatant(neutral)
  if (cNeutral.healReceived !== 0) fail24.push('㉔ 中性性格受疗应为 0')
  console.log(`㉔ 性格面板:勇猛攻 ${toCombatant(brave).attack}/${toCombatant(timid).attack} 谨慎防 ${toCombatant(cautious).defense}/${toCombatant(reckless).defense} 贪婪暴 ${(toCombatant(greedy).critChance * 100).toFixed(1)}/${(toCombatant(ascetic).critChance * 100).toFixed(1)}%`)
  if (fail24.length > 0) { console.log('✗ 性格面板未通过:', fail24); process.exit(1) }
  console.log('✓ 性格→面板通过:勇猛/谨慎/贪婪/忠诚四维真实影响战斗属性')
}

// ============================================================
// ㉕ 混合职阶(宪法 v3 切片 2):数据完整性+投影+战斗可终结
// ============================================================
{
  const fail25: string[] = []
  // 25a:15 混合职阶数据完整性
  if (Object.keys(HYBRIDS).length !== 15) fail25.push(`㉕ 混合职阶数量不是 15:${Object.keys(HYBRIDS).length}`)
  for (const [key, hy] of Object.entries(HYBRIDS)) {
    if (key !== hy.id) fail25.push(`㉕ 混合键名与 id 不一致:${key} vs ${hy.id}`)
    if (!hy.identity) fail25.push(`㉕ ${hy.id} 缺身份句`)
    if (!['tank', 'healer', 'dps'].includes(hy.role)) fail25.push(`㉕ ${hy.id} 主职非法`)
    for (const sk of hy.skills) {
      if (!['heavy-strike', 'heal-lowest', 'taunt', 'group-heal', 'shield-ally', 'curse-mark', 'summon-pet', 'multishot', 'frost-nova', 'enchant-self', 'charge-strike', 'trap-bind'].includes(sk.effect)) {
        fail25.push(`㉕ ${hy.id}/${sk.id} 未知效果 ${sk.effect}`)
      }
    }
  }
  // 配对完整性:每条线恰好与其他 5 条线各配一次
  const pairCount: Record<string, number> = {}
  for (const hy of Object.values(HYBRIDS)) {
    for (const line of hy.lines) pairCount[line] = (pairCount[line] ?? 0) + 1
  }
  for (const [line, n] of Object.entries(pairCount)) {
    if (n !== 5) fail25.push(`㉕ ${line} 线配对数 ${n} ≠ 5`)
  }
  console.log(`㉕ 混合职阶:${Object.keys(HYBRIDS).length} 个,配对覆盖 ${Object.keys(pairCount).length} 线`)

  // 25b:投影——圣盾使应是前排坦克,带盾技能,数值走混合头不走守卫线
  {
    const m = generateMember('guard', 5, 991000)
    m.spec = 'hy-saint'
    seedMemberSeq([m])
    const c = toCombatant(m)
    if (c.role !== 'tank' || c.position !== 'front') fail25.push('㉕ 圣盾使主职/站位错误')
    if (!c.skills.some((s) => s.def.effect === 'shield-ally')) fail25.push('㉕ 圣盾使缺移形圣盾')
    if (c.maxHp !== Math.round(150 + 4 * 18 + m.attrs.str * 3)) fail25.push(`㉕ 圣盾使血量未走混合头:${c.maxHp}`)
    console.log(`㉕ 圣盾使投影:HP ${c.maxHp} 攻 ${c.attack} 防 ${c.defense} 主职 ${c.role}`)
  }

  // 25c:含混合成员的战斗必然可终结(15 个混合各打一场杂兵)
  {
    const hybridIds = Object.keys(HYBRIDS)
    let completed = 0
    for (let i = 0; i < hybridIds.length; i++) {
      const squad = JOBS.map((job, j) => generateMember(job, 5, 992000 + i * 131 + j))
      squad[0].spec = hybridIds[i]
      seedMemberSeq(squad)
      const b = createBattle(squad, BLACKMOSS, 'enc-frogs', i * 41 + 7)
      let guard = 0
      while (b.status === 'running' && guard++ < MAX_TICK) stepBattle(b)
      if (b.status !== 'running') completed++
    }
    if (completed < 15) fail25.push(`㉕ 混合成员战斗可终结性 ${completed}/15`)
    console.log(`㉕ 15 混合职阶各打一场:终结 ${completed}/15`)
  }

  if (fail25.length > 0) { console.log('✗ 混合职阶未通过:', fail25); process.exit(1) }
  console.log('✓ 混合职阶通过:15 全配对数据完整,投影与战斗终结性成立')
}

// ============================================================
// ㉖ 六种族(宪法 v3 切片 3):数据完整性+轻被动接线+招募随机专精
// ============================================================
{
  const fail26: string[] = []
  const raceCount = Object.keys(RACES).length
  if (raceCount !== 6) fail26.push(`㉖ 种族数量不是 6:${raceCount}`)
  for (const r of Object.values(RACES)) {
    if (!r.identity) fail26.push(`㉖ ${r.id} 缺身份句`)
    if (r.names.length < 5) fail26.push(`㉖ ${r.id} 名字池过小`)
  }
  // 26a:生成器——成员带种族,名字落在该族池内,专精可随机
  {
    setRaceOverride(undefined)
    const m = generateMember('guard', 1, 993000)
    if (!m.race || !RACES[m.race]) fail26.push('㉖ 成员无种族或种族非法')
    if (!RACES[m.race ?? 'human'].names.includes(m.name)) fail26.push(`㉖ 名字不在种族池内:${m.name}`)
    const sp = rollSpec('mage', () => 0.99)
    if (sp !== 'mage-arcane') fail26.push(`㉖ rollSpec 边界异常:${sp}`)
    console.log(`㉖ 生成:${m.name}(${RACES[m.race ?? 'human'].name}) 专精随机边界 ok`)
    setRaceOverride('human')
  }
  // 26b:兽人攻/矮人防投影——克隆对照(同种子生成受名字去重影响不保证一致,克隆才等价)
  {
    const proto = generateMember('guard', 5, 994000)
    const orc = { ...proto, race: 'orc' }
    const dwarf = { ...proto, race: 'dwarf' }
    const base = { ...proto, race: 'human' }
    if (toCombatant(orc).attack !== toCombatant(base).attack + 4) fail26.push(`㉖ 兽人攻击加成未生效:${toCombatant(base).attack}→${toCombatant(orc).attack}`)
    if (toCombatant(dwarf).defense !== toCombatant(base).defense + 2) fail26.push('㉖ 矮人防御加成未生效')
    console.log(`㉖ 轻被动:兽人攻 +4(${toCombatant(base).attack}→${toCombatant(orc).attack}) 矮人防 +2(${toCombatant(base).defense}→${toCombatant(dwarf).defense})`)
  }
  // 26c:亡灵士气冲击减半
  {
    const squadA = JOBS.map((job, j) => generateMember(job, 5, 995000 + j))
    const squadB = JOBS.map((job, j) => generateMember(job, 5, 996000 + j))
    // 对照:性格必须一致(阵亡冲击按勇猛加权)
    for (let j = 0; j < squadB.length; j++) squadB[j].personality = { ...squadA[j].personality }
    for (const m of squadB) m.race = 'undead'
    seedMemberSeq([...squadA, ...squadB])
    const beforeA = squadA[0].morale ?? 60
    const beforeB = squadB[0].morale ?? 60
    applyDeathShock(squadA[1].id, squadA)
    applyDeathShock(squadB[1].id, squadB)
    const lossA = beforeA - (squadA[0].morale ?? 60)
    const lossB = beforeB - (squadB[0].morale ?? 60)
    if (Math.abs(lossA - lossB * 2) > 0.01) fail26.push(`㉖ 亡灵冲击减半异常:${lossA} vs ${lossB}`)
    console.log(`㉖ 亡灵意志:常人损 ${lossA.toFixed(1)},亡灵损 ${lossB.toFixed(1)}(应减半)`)
  }
  // 26d:人类经验加成
  {
    const human = generateMember('guard', 1, 997000)
    human.race = 'human'
    const other = generateMember('guard', 1, 997000)
    other.race = 'orc'
    grantExp(human, 100)
    grantExp(other, 100)
    if (human.exp <= other.exp) fail26.push(`㉖ 人类经验加成未生效:${human.exp} vs ${other.exp}`)
    console.log(`㉖ 人类经验:100 经验 → ${human.exp} vs 常人 ${other.exp}`)
  }
  if (fail26.length > 0) { console.log('✗ 种族系统未通过:', fail26); process.exit(1) }
  console.log('✓ 六种族通过:数据完整,轻被动全部接线(攻/防/经验/意志)')
}
