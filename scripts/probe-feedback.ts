// 反馈侦察探针(不进门禁):制作人三反馈的实测数据
// ①boss 读条/机制节奏 ②杂兵"秒杀感"来自哪 ③boss 战时长 vs 机制频率
// 运行:npx esbuild scripts/probe-feedback.ts --bundle --platform=node --format=esm --outfile=scripts/probe-feedback.mjs && node scripts/probe-feedback.mjs
import { DUNGEONS } from '../src/data/dungeons'
import { createBattle, stepBattle, setStance, setFocus, useHealPotion, useFuryPotion } from '../src/sim/combat'
import { bossIntents } from '../src/sim/mechanics'
import { generateMember } from '../src/sim/gen'

const JOBS = ['guard', 'priest', 'ranger', 'guard', 'ranger'] as const
const MAX_TICK = 4000

interface R { dur: number; win: boolean; casts: number; aoeHits: number; aoeDmg: number; taken: number; guildDied: number }

function run(dungeonId: string, encId: string, level: number, seed: number): R {
  const d = DUNGEONS.find((x) => x.id === dungeonId)!
  const squad = JOBS.map((job, j) => generateMember(job, level, 970000 + seed * 100 + j))
  const b = createBattle(squad, d, encId, seed * 31 + 7, 0, 0, false, { heal: 3, fury: 3 })
  let casts = 0
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
  // 统计:casting 事件次数 + 震地类 aoe 落地伤害
  let aoeDmg = 0
  for (const e of (b.log ?? [])) {
    if (e.text?.includes('咏唱') && e.text?.includes('开始')) casts++
  }
  for (const e of (b.events ?? [])) {
    if (e.type === 'casting') casts++
  }
  const taken = b.combatants.filter((c) => c.team === 'guild').reduce((s, c) => s + (c.maxHp - c.hp), 0)
  const guildDied = b.combatants.filter((c) => c.team === 'guild' && !c.alive).length
  // aoe 落地:从事件流抓 damage 且 attacker 是 boss 的聚合(简化:总承伤已足够说明)
  return { dur: b.tick / 10, win: b.status === 'guild-win', casts, aoeHits: 0, aoeDmg, taken, guildDied }
}

const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]

console.log('===== ① 满配档视角:L10 五人"会玩"队,打各图首波杂兵 + boss =====')
for (const d of DUNGEONS) {
  const wave = d.encounters.find((e) => e.kind === 'wave')!
  const boss = d.encounters.find((e) => e.kind === 'boss')!
  const wr: R[] = []
  const br: R[] = []
  for (let i = 0; i < 8; i++) { wr.push(run(d.id, wave.id, 10, i)); br.push(run(d.id, boss.id, 10, i)) }
  const fmt = (rs: R[]) => `${med(rs.map((r) => r.dur)).toFixed(1)}s(胜 ${rs.filter((r) => r.win).length}/8,承伤 ${med(rs.map((r) => r.taken))})`
  console.log(`${d.id}:杂兵 ${fmt(wr)} | boss ${fmt(br)} | boss 读条/场 ${med(br.map((r) => r.casts))} 次`)
}

console.log('\n===== ② 设计等级视角:L5 队打黑苔沼泽(前期正常成长体验) =====')
{
  const d = DUNGEONS[0]
  for (const enc of [d.encounters.find((e) => e.kind === 'wave')!, d.encounters.find((e) => e.kind === 'boss')!]) {
    const rs: R[] = []
    for (let i = 0; i < 8; i++) rs.push(run(d.id, enc.id, 5, i))
    console.log(`${d.id}/${enc.id}:中位 ${med(rs.map((r) => r.dur)).toFixed(1)}s,胜 ${rs.filter((r) => r.win).length}/8,承伤 ${med(rs.map((r) => r.taken))}`)
  }
}

console.log('\n===== ③ boss 机制密度:格鲁什震地/塔尔玛咏唱 在一场里的时间线 =====')
{
  const d = DUNGEONS[0]
  const b = (() => {
    const squad = JOBS.map((job, j) => generateMember(job, 10, 971234 + j))
    const bb = createBattle(squad, d, 'enc-grush', 1234 * 31 + 7, 0, 0, false, { heal: 3, fury: 3 })
    while (bb.status === 'running' && bb.tick < MAX_TICK) {
      if (bb.tick % 5 === 0) {
        const intents = bossIntents(bb)
        setStance(bb, intents.telegraphing ? 'spread' : 'standard')
        const boss = bb.combatants.find((c) => c.boss && c.alive)
        if (boss) setFocus(bb, boss.id)
      }
      stepBattle(bb)
    }
    return bb
  })()
  const mechEvents = (b.events ?? []).filter((e) => e.type === 'casting' || e.type === 'telegraph')
  const line = mechEvents.map((e) => `${e.type}@${(e.tick / 10).toFixed(1)}s`).join(' → ')
  console.log(`战斗时长 ${b.tick / 10}s;机制事件线(telegraph=震地蓄力/casting=咏唱):${line || '无'}`)
}
