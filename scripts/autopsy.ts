import { generateMember } from '../src/sim/gen'
import { createBattle, stepBattle } from '../src/sim/combat'
import { BLACKMOSS } from '../src/data/dungeons'
const JOBS = ['guard', 'priest', 'ranger'] as const
const squad = JOBS.map((j, i) => generateMember(j, 5, 777))
const b = createBattle(squad, BLACKMOSS, 'enc-grush', 999)
while (b.status === 'running' && b.tick < 1000) stepBattle(b)
for (const e of b.log.filter((e) => e.tick >= 80 && e.tick <= 205)) console.log(`[${e.tick}] ${e.text}`)
