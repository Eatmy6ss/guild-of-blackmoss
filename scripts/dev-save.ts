// 满配试玩存档生成器:产出 v6 导入码,粘贴进游戏「导入存档」即可
// 安全边界:只生成文本码,不触碰任何 localStorage(试玩档由玩家主动导入覆盖)
import { writeFileSync } from 'node:fs'
import { JOBS } from '../src/data/jobs'
import { BUILDINGS } from '../src/data/base'
import { rollDrop } from '../src/sim/loot'
import { generateMember, levelTo } from '../src/sim/gen'
import type { GuildSave } from '../src/state/save'
import { SAVE_VERSION } from '../src/state/save'

const T2 = { weapon: 'wpn-t2-bow', armor: 'arm-t2-plate', trinket: 'trk-t2-totem' } as const
const SLOTS = ['weapon', 'armor', 'trinket'] as const

// 6 人满编:2 守卫(坦)/2 牧师(奶)/2 游侠(输出),10 级,三槽全 T2
const COMP = ['guard', 'priest', 'ranger', 'guard', 'ranger', 'priest'] as const

let seed = 20260920
const rng = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}

// 满配档:经典专精+人类(与门禁标准条件一致);Lv10 可自行精进
  const m = generateMember(job as keyof typeof JOBS, 10, 990000 + i * 17)
  levelTo(m, 10)
  m.hp = -1 // 约定:进场按满血处理(toCombatant 的 hp<=0 分支)
  for (const slot of SLOTS) m.equipment[slot] = rollDrop(T2[slot], rng)
  return m
})

const inventory = [
  ...Array.from({ length: 2 }, () => rollDrop('wpn-t2-bow', rng)),
  ...Array.from({ length: 2 }, () => rollDrop('arm-t2-plate', rng)),
  ...Array.from({ length: 2 }, () => rollDrop('trk-t2-totem', rng)),
  rollDrop('wpn-t1-sword', rng),
  rollDrop('arm-t1-mail', rng),
]

const buildings: Record<string, number> = {}
for (const b of BUILDINGS) buildings[b.id] = b.maxLevel

const save: GuildSave = {
  version: SAVE_VERSION,
  members,
  inventory,
  memorial: [],
  manual: [],
  protectOn: true,
  gold: 2000,
  blessing: 40,
  recruitCooldown: 0,
  towerBest: 0,
  lastSeen: Date.now(),
  chronicle: [],
  day: 20,
  buildings,
  potions: { heal: 9, fury: 9 },
  unlockedHybrids: [],
}

// ---- 自检:不通过就拒发码 ----
const problems: string[] = []
if (save.members.length !== 6) problems.push('成员数不是 6')
for (const m of save.members) {
  if (m.level !== 10) problems.push(`${m.name} 等级不是 10`)
  for (const slot of SLOTS) if (!m.equipment[slot]) problems.push(`${m.name} 缺 ${slot} 装备`)
}
if (Object.keys(buildings).length !== BUILDINGS.length) problems.push('建筑未满')
if (problems.length > 0) {
  console.error('✗ 自检失败:', problems)
  process.exit(1)
}

const code = Buffer.from(JSON.stringify(save), 'utf8').toString('base64')
writeFileSync(new URL('../docs/dev-save.txt', import.meta.url), code + '\n', 'utf8')
console.log(`✓ 满配存档码已生成:docs/dev-save.txt(${code.length} 字符)`)
console.log(`  成员:${save.members.map((m) => `${m.name}(${m.job}${m.level}级)`).join(' / ')}`)
