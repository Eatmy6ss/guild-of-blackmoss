import type { ItemInstance } from '../sim/types'

export type CommissionObjective =
  | { kind: 'battles'; dungeonId: string; target: number }
  | { kind: 'boss'; dungeonId: string; bossId: string; target: number }
  | { kind: 'clear'; dungeonId: string; target: number }
  | { kind: 'building'; buildingId: string; target: number }

export interface CommissionDef {
  id: string
  title: string
  issuer: string
  chapter: string
  letter: string
  objective: CommissionObjective
  objectiveText: string
  requires: string[]
  gold: number
  trust: number
  item?: Omit<ItemInstance, 'id'>
  reply: string
}

export const KINGDOM_NAME = '灰冠王国'
export const COMMISSION_LIMIT = 2
export const KINGDOM_RANKS = [
  { threshold: 0, name: '未授印公会', discount: 0, desc: '王国还不认识你们。商路上的一次守信，比百封自荐更有分量。' },
  { threshold: 20, name: '边境受托人', discount: 0.03, desc: '边境官署认可了公会的印记，补给商愿按官契价供货。' },
  { threshold: 50, name: '王室盟友', discount: 0.06, desc: '矿镇与教区共同为你们作保，王室将公会列入长期援助名册。' },
  { threshold: 100, name: '灰冠誓约者', discount: 0.10, desc: '你们的名字写入边境誓约。王国信任这面旗，也记得旗后的人。' },
] as const

export const COMMISSIONS: CommissionDef[] = [
  {
    id: 'crown-road', title: '让粮车再走一次', issuer: '边境执事 · 莉娅', chapter: '一 · 边境来函',
    letter: '王军正守着北线，运粮人却不敢穿过黑苔沼泽。我们不要求你们占领整片湿地——先清出三段能让马车通过的道路。粮食到了，镇民才有下一个冬天。',
    objective: { kind: 'battles', dungeonId: 'blackmoss', target: 3 }, objectiveText: '接取后，在黑苔沼泽赢得3场战斗（可跨远征累计）',
    requires: [], gold: 80, trust: 10,
    reply: '第一辆粮车已抵达镇门。莉娅随回函寄来一截车上的蓝缎带：“镇上的孩子说，这面旗该有一点亮色。”',
  },
  {
    id: 'crown-training', title: '有名字的队伍', issuer: '王室军需官 · 埃德温', chapter: '一 · 边境来函',
    letter: '官署不会把人命交给临时拼起的酒客。请为公会建起一级训练场，让新兵有地方学会活着回来。已建成的训练场也可登记备案。',
    objective: { kind: 'building', buildingId: 'training', target: 1 }, objectiveText: '拥有Lv1训练场（基地建设，已有建筑也计入）',
    requires: [], gold: 60, trust: 10,
    reply: '军需官在名册上盖了章：“从今天起，黑苔不是一群佣兵的绰号，而是一支有名有姓的队伍。”',
  },
  {
    id: 'crown-grush', title: '路障之后的食人魔', issuer: '边境执事 · 莉娅', chapter: '二 · 沼泽疑云',
    letter: '粮车带回了新的证词：蛙人只是在替沼泽食人魔收取过路血税。除掉格鲁什，让巡防不再成为永无止境的补洞。',
    objective: { kind: 'boss', dungeonId: 'blackmoss', bossId: 'grush', target: 1 }, objectiveText: '接取后，击败黑苔沼泽的格鲁什',
    requires: ['crown-road'], gold: 100, trust: 15,
    reply: '最后一处拦路的木桩被镇民拔掉。食人魔的巢穴里发现了一枚深渊祭印——这件事还没有结束。',
  },
  {
    id: 'crown-talma', title: '祭印从何而来', issuer: '王室调查使 · 维兰', chapter: '二 · 沼泽疑云',
    letter: '格鲁什留下的祭印与失踪哨兵携带的护符相同。深入沼泽，终结塔尔玛主持的仪式。请完成整次远征，把调查带回公会。',
    objective: { kind: 'clear', dungeonId: 'blackmoss', target: 1 }, objectiveText: '接取后，通关一次黑苔沼泽',
    requires: ['crown-grush'], gold: 140, trust: 15,
    item: { baseId: 'trk-t2-medic', quality: 'green', rolls: [{ affixId: 'aff-hp', value: 18 }, { affixId: 'aff-def', value: 2 }] },
    reply: '维兰封存了祭印，将随军医者的徽记交给你们：“调查结束了。让活下来的人被好好照料。”矿镇的求援随同回函送达。',
  },
  {
    id: 'crown-mine', title: '熄炉镇的最后一车铁', issuer: '王室军需官 · 埃德温', chapter: '三 · 重建边境',
    letter: '矿道停工后，城墙上坏掉的弩机无人修补。矿监承诺重开矿路便恢复供铁；请打通锈坑，让纸上的援军重新拿到武器。',
    objective: { kind: 'clear', dungeonId: 'rustmine', target: 1 }, objectiveText: '接取后，通关一次锈坑矿道',
    requires: ['crown-talma'], gold: 170, trust: 15,
    reply: '铁炉重新燃起来了。埃德温划掉一长列欠账，又添上一句：“黑苔公会的补给，优先装车。”',
  },
  {
    id: 'crown-ash', title: '旧旗不能替死人发令', issuer: '王室调查使 · 维兰', chapter: '三 · 重建边境',
    letter: '灰烬旧战场仍有人以旧王军令征收粮饷。摩尔德雷克的军旗不该再命令活人赴死。收束这场早已结束的战争，为要塞前的乡村清出归路。',
    objective: { kind: 'clear', dungeonId: 'ashfield', target: 1 }, objectiveText: '接取后，通关一次灰烬旧战场',
    requires: ['crown-mine'], gold: 190, trust: 15,
    reply: '旧旗送回了档案库，没有挂上刑场。维兰写道：“王国欠这些人一个结局，不欠另一场阅兵。”',
  },
  {
    id: 'crown-frost', title: '雪下的人也有名字', issuer: '边境救济署 · 玛蕾', chapter: '四 · 两封求援',
    letter: '主线商路终于能走，白霜墓园的亡者却仍阻拦亲人前来祭扫。结束霜裔织法者的统治，让镇民带着名字而不是武器走进墓园。',
    objective: { kind: 'clear', dungeonId: 'frostgrave', target: 1 }, objectiveText: '接取后，通关一次白霜墓园',
    requires: ['crown-mine'], gold: 180, trust: 15,
    reply: '墓园门前多了一排新灯。玛蕾寄来的名单上，失踪者被一一划去，旁边写着“已归乡”。',
  },
  {
    id: 'crown-altar', title: '赎金不能再付给深渊', issuer: '王室调查使 · 维兰', chapter: '四 · 两封求援',
    letter: '塔尔玛的祭印指向渊底祭坛，赎金和失踪者都在那里消失。击败马尔萨乌斯，切断这条线索背后的手。完成目标后可以择机撤离。',
    objective: { kind: 'boss', dungeonId: 'abyssaltar', bossId: 'malsau', target: 1 }, objectiveText: '接取后，击败渊底祭坛的马尔萨乌斯',
    requires: ['crown-mine'], gold: 200, trust: 15,
    reply: '账册里的赎金终于有了收款人的名字。调查使将它交给王国法庭，而不是再交给一个收税人。',
  },
  {
    id: 'crown-thorn', title: '让要塞重新守护道路', issuer: '灰冠王室 · 边境议事厅', chapter: '五 · 王室誓约',
    letter: '矿镇供铁、墓园安宁、祭坛沉寂，边境终于能集中力量。维克托把荆棘要塞变成了自己的收费站。带齐五人队伍，让它重新成为所有人的城门。',
    objective: { kind: 'clear', dungeonId: 'thornhold', target: 1 }, objectiveText: '接取后，以五人队伍通关荆棘要塞',
    requires: ['crown-ash', 'crown-frost', 'crown-altar'], gold: 260, trust: 20,
    item: { baseId: 'arm-t2-chain', quality: 'green', rolls: [{ affixId: 'aff-hp', value: 30 }, { affixId: 'aff-def', value: 3 }] },
    reply: '要塞门楼升起了王国旗，旁边留出黑苔公会的位置。誓约不是征召令：你们仍可自行决定，下一次为谁拔剑。',
  },
  {
    id: 'crown-embers', title: '山口另一端的来信', issuer: '边境执事 · 莉娅', chapter: '六 · 龙脊来信',
    letter: '要塞解围后，龙脊山脉的信使才终于抵达。鳞音教卡住了烬石隘口，新的商路又一次沉默。打通山口，带回下一场危机的第一份实情。',
    objective: { kind: 'clear', dungeonId: 'emberpass', target: 1 }, objectiveText: '接取后，通关一次烬石隘口',
    requires: ['crown-thorn'], gold: 300, trust: 20,
    item: { baseId: 'trk-dragon-talisman', quality: 'green', rolls: [{ affixId: 'aff-hp', value: 24 }, { affixId: 'aff-fireguard', value: 0.12 }] },
    reply: '来信被列为王室急件。莉娅送来驭火者坠：“更深处的事还需要准备。今天，先让带信回来的人歇一晚。”本批王国委托至此结案。',
  },
]
