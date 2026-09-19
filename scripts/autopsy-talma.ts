import { generateMember } from '../src/sim/gen'
import { createBattle, stepBattle } from '../src/sim/combat'
import { BLACKMOSS } from '../src/data/dungeons'
const JOBS = ['guard', 'priest', 'ranger'] as const

// 诊断:塔尔玛战——零指挥(保护开/关)两种结局的完整过程
for (const protect of [true, false]) {
  const squad = JOBS.map((j, i) => generateMember(j, 5, 777 + i))
  const b = createBattle(squad, BLACKMOSS, 'enc-talma', 4242)
  b.commands.protectRetreat = protect
  while (b.status === 'running' && b.tick < 3000) stepBattle(b)
  console.log(`\n===== 保护${protect ? '开' : '关'} → ${b.status} @tick ${b.tick} =====`)
  const tail = b.log.filter((e) => e.tick >= (protect ? Math.max(0, b.tick - 250) : 0))
  for (const e of tail) console.log(`[${e.tick}] ${e.text}`)
}
