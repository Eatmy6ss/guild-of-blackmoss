import type { JobDef, SpecDef } from '../sim/types'

// 六职业 × 三专精(宪法 v3 角色篇,grilling 定稿 2026-09-22):
//   职业线提供 base 数值与站位/射程;专精提供 数值修正 + 技能组 + 职业被动 + 身份句。
//   铁律:每线的 defaultSpec = 宪法 v3 之前的经典数值与技能——老存档(spec 缺省)与
//   22 项平衡门禁(⑨/⑲ 的铁壁/圣光/鹰眼假设)原样保留,任何新专精不得改动经典线数值。
// 专精差异全部是机制(反伤/护盾/光环/陷阱/宠物/诅咒/弹幕/附魔),没有纯数值专精。

const spec = (s: SpecDef): SpecDef => s

export const JOBS: Record<string, JobDef> = {
  // ===== 守卫线(坦克) =====
  guard: {
    id: 'guard',
    name: '守卫',
    defaultSpec: 'guard-ironwall',
    role: 'tank',
    attackAttr: 'str',
    position: 'front',
    range: 'melee',
    // D15 反馈调参：坦克太硬（试玩反馈 #2）——削基础血与防御，压力感给足
    // 节奏改版(2026-09-20):攻速分化=守卫适中 0.9s/刀(60/7≈9tick);血量×1.5 拉长双向 TTK
    base: { maxHp: 156, attack: 7, defense: 9, speed: 6, critChance: 0.05 },
    growth: { maxHp: 18, attack: 1.0, defense: 1.0 },
    specs: {
      'guard-ironwall': spec({
        id: 'guard-ironwall',
        name: '铁壁卫士',
        identity: '盾墙即誓言——最经典的持盾守卫,嘲讽控场,稳如磐石。',
        skills: [
          { id: 'guard-taunt', name: '威吓', effect: 'taunt', target: 'enemy', cooldownTicks: 60 },
        ],
        advancedSkills: [
          { id: 'guard-wall-slam', name: '盾墙猛击', effect: 'heavy-strike', target: 'enemy', cooldownTicks: 70 },
          { id: 'guard-bulwark', name: '盾墙坚守', effect: 'taunt', target: 'enemy', cooldownTicks: 45 },
          { id: 'guard-shieldbreak', name: '破甲盾击', effect: 'armor-break', target: 'enemy', cooldownTicks: 95 },
        ],
      }),
      'guard-thorns': spec({
        id: 'guard-thorns',
        name: '荆棘重卫',
        identity: '碰我一下,记你一笔——每一记落在盾上的拳头都会被奉还。',
        statMods: { defense: 2, speed: -1 },
        skills: [
          { id: 'guard-taunt', name: '威吓', effect: 'taunt', target: 'enemy', cooldownTicks: 60 },
        ],
        passive: 'counter',
        advancedSkills: [
          { id: 'thorn-wave', name: '荆棘波浪', effect: 'multishot', target: 'enemy', cooldownTicks: 90 },
          { id: 'thorn-taunt', name: '荆棘威吓', effect: 'taunt', target: 'enemy', cooldownTicks: 55 },
        ],
      }),
    },
    synergy: ['shield-wall'],
  },

  // ===== 牧师线(治疗) =====
  priest: {
    id: 'priest',
    name: '牧师',
    defaultSpec: 'priest-holy',
    role: 'healer',
    attackAttr: 'int',
    position: 'back',
    range: 'ranged',
    // 节奏改版:牧师最慢 1.4s/刀(60/4.3≈14tick,治疗循环靠圣光而非平砍);血量×1.5;
    // 攻击 5.4→7.0 = 圣光术治疗量同步 +30%(血池×1.5 后治疗吞吐必须跟上,否则撑不到 boss 中段机制)
    base: { maxHp: 120, attack: 7.0, defense: 5, speed: 4.3, critChance: 0.05 },
    growth: { maxHp: 12, attack: 1.2, defense: 0.7 },
    specs: {
      'priest-holy': spec({
        id: 'priest-holy',
        name: '圣光祭司',
        identity: '光落在伤口上——最经典的治疗,圣光术吞吐量最大。',
        skills: [
          { id: 'priest-heal', name: '圣光术', effect: 'heal-lowest', target: 'ally', cooldownTicks: 15 },
        ],
        advancedSkills: [
          { id: 'holy-nova', name: '神圣新星', effect: 'group-heal', target: 'ally', cooldownTicks: 150 },
          { id: 'holy-smite', name: '惩击', effect: 'heavy-strike', target: 'enemy', cooldownTicks: 90 },
          { id: 'holy-channel', name: '虔信祷告', effect: 'channel-heal', target: 'ally', cooldownTicks: 170 },
        ],
      }),
      'priest-discipline': spec({
        id: 'priest-discipline',
        name: '戒律牧师',
        identity: '先立盾,后颂诗——预防性的真言盾,让伤害根本落不到肉上。',
        skills: [
          { id: 'priest-heal', name: '圣光术', effect: 'heal-lowest', target: 'ally', cooldownTicks: 24 },
          { id: 'priest-shield', name: '真言盾', effect: 'shield-ally', target: 'ally', cooldownTicks: 50 },
        ],
        advancedSkills: [
          { id: 'disc-burst', name: '苦修', effect: 'heavy-strike', target: 'enemy', cooldownTicks: 95 },
          { id: 'disc-shield2', name: '真言盾·固', effect: 'shield-ally', target: 'ally', cooldownTicks: 45 },
        ],
      }),
    },
    synergy: ['blessed-formation'],
  },

  // ===== 游侠线(物理远程) =====
  ranger: {
    id: 'ranger',
    name: '游侠',
    defaultSpec: 'ranger-hawk',
    role: 'dps',
    attackAttr: 'agi',
    position: 'back',
    range: 'ranged',
    // 节奏改版:游侠最快 0.6s/刀(60/10=6tick);血量×1.5,攻击微降抵消杂兵变肉
    base: { maxHp: 135, attack: 8.0, defense: 4, speed: 12, critChance: 0.12 },
    growth: { maxHp: 13, attack: 1.4, defense: 0.7 },
    specs: {
      'ranger-hawk': spec({
        id: 'ranger-hawk',
        name: '鹰眼神射',
        identity: '看哪儿,射哪儿——最经典的射手,瞄准射击一击致命。',
        skills: [
          { id: 'ranger-aimed', name: '瞄准射击', effect: 'heavy-strike', target: 'enemy', cooldownTicks: 70 },
        ],
        advancedSkills: [
          { id: 'hawk-pierce', name: '穿云箭', effect: 'heavy-strike', target: 'enemy', cooldownTicks: 75 },
          { id: 'hawk-double', name: '双重射击', effect: 'multishot', target: 'enemy', cooldownTicks: 85 },
        ],
      }),
      'ranger-beastmaster': spec({
        id: 'ranger-beastmaster',
        name: '兽王猎手',
        identity: '它比你先看到猎物——召唤战狼并肩撕咬。',
        statMods: { attack: -1 },
        skills: [
          { id: 'ranger-aimed', name: '瞄准射击', effect: 'heavy-strike', target: 'enemy', cooldownTicks: 80 },
          { id: 'ranger-wolf', name: '召唤战狼', effect: 'summon-pet', target: 'ally', cooldownTicks: 200 },
        ],
        advancedSkills: [
          { id: 'beast-frenzy', name: '野性鼓舞', effect: 'enchant-self', target: 'ally', cooldownTicks: 170 },
          { id: 'beast-hawk', name: '猎鹰召唤', effect: 'summon-pet', target: 'ally', cooldownTicks: 210 },
        ],
      }),
    },
    synergy: ['shield-wall'],
  },

  // ===== 战士线(近战输出,与守卫的剑盾坦克分家) =====
  warrior: {
    id: 'warrior',
    name: '战士',
    defaultSpec: 'warrior-weapons',
    role: 'dps',
    attackAttr: 'str',
    position: 'front',
    range: 'melee',
    base: { maxHp: 168, attack: 10, defense: 6, speed: 8, critChance: 0.07 },
    growth: { maxHp: 15, attack: 1.5, defense: 0.8 },
    specs: {
      'warrior-weapons': spec({
        id: 'warrior-weapons',
        name: '武器大师',
        identity: '每一下都劈在甲缝上——大开大合的重剑路数。',
        statMods: { attack: 1.5, speed: -1 },
        skills: [
          { id: 'warrior-cleave', name: '重型劈砍', effect: 'heavy-strike', target: 'enemy', cooldownTicks: 65 },
        ],
        advancedSkills: [
          { id: 'wpn-giant', name: '巨人杀手', effect: 'heavy-strike', target: 'enemy', cooldownTicks: 75 },
          { id: 'wpn-break', name: '破甲斩', effect: 'curse-mark', target: 'enemy', cooldownTicks: 110 },
          { id: 'wpn-combo', name: '连环三斩', effect: 'combo-strike', target: 'enemy', cooldownTicks: 60 },
        ],
      }),
      'warrior-vanguard': spec({
        id: 'warrior-vanguard',
        name: '冲锋队长',
        identity: '第一个冲进去,最后一个撤出来——也负责把阵型撕开口子。',
        statMods: { maxHp: 8 },
        skills: [
          { id: 'warrior-charge', name: '冲锋号令', effect: 'charge-strike', target: 'enemy', cooldownTicks: 70 },
        ],
        passive: 'counter',
        advancedSkills: [
          { id: 'vg-horn', name: '冲锋号角', effect: 'charge-strike', target: 'enemy', cooldownTicks: 75 },
          { id: 'vg-horn2', name: '战吼', effect: 'taunt', target: 'enemy', cooldownTicks: 60 },
          { id: 'vg-reposition', name: '战术转移', effect: 'reposition', target: 'ally', cooldownTicks: 90 },
        ],
      }),
    },
    synergy: ['shield-wall'],
  },

  // ===== 法师线(奥法输出) =====
  mage: {
    id: 'mage',
    name: '法师',
    defaultSpec: 'mage-fire',
    role: 'dps',
    attackAttr: 'int',
    position: 'back',
    range: 'ranged',
    base: { maxHp: 105, attack: 11, defense: 3, speed: 7, critChance: 0.1 },
    growth: { maxHp: 10, attack: 1.6, defense: 0.5 },
    specs: {
      'mage-fire': spec({
        id: 'mage-fire',
        name: '火焰法师',
        identity: '一发火球解决的事,不要用第二发——高爆单发的极致。',
        statMods: { critChance: 0.02 },
        skills: [
          { id: 'mage-fireball', name: '火球术', effect: 'heavy-strike', target: 'enemy', cooldownTicks: 60 },
        ],
        advancedSkills: [
          { id: 'fire-storm', name: '烈焰风暴', effect: 'multishot', target: 'enemy', cooldownTicks: 90 },
          { id: 'fire-blast', name: '炎爆术', effect: 'heavy-strike', target: 'enemy', cooldownTicks: 70 },
        ],
      }),
      'mage-frost': spec({
        id: 'mage-frost',
        name: '冰霜法师',
        identity: '寒冷不是杀伤,是判决——霜寒新星能让整片敌人慢下来。',
        statMods: { attack: -0.5 },
        skills: [
          { id: 'mage-nova', name: '霜寒新星', effect: 'frost-nova', target: 'enemy', cooldownTicks: 120 },
        ],
        advancedSkills: [
          { id: 'frost-field', name: '极寒领域', effect: 'frost-nova', target: 'enemy', cooldownTicks: 150 },
          { id: 'frost-spear', name: '冰锥术', effect: 'heavy-strike', target: 'enemy', cooldownTicks: 80 },
        ],
      }),
    },
    synergy: ['blessed-formation'],
  },

  // ===== 术士线(暗影契约) =====
  warlock: {
    id: 'warlock',
    name: '术士',
    defaultSpec: 'warlock-demon',
    role: 'dps',
    attackAttr: 'int',
    position: 'back',
    range: 'ranged',
    base: { maxHp: 115, attack: 10, defense: 3, speed: 7, critChance: 0.08 },
    growth: { maxHp: 11, attack: 1.5, defense: 0.5 },
    specs: {
      'warlock-demon': spec({
        id: 'warlock-demon',
        name: '恶魔术士',
        identity: '契约已签,小鬼已到——让召唤物替你挨刀、替你撕咬。',
        statMods: { maxHp: 8 },
        skills: [
          { id: 'warlock-imp', name: '召唤小鬼', effect: 'summon-pet', target: 'ally', cooldownTicks: 190 },
        ],
        advancedSkills: [
          { id: 'demon-infernal', name: '地狱火降临', effect: 'summon-pet', target: 'ally', cooldownTicks: 210 },
          { id: 'demon-rage', name: '恶魔之怒', effect: 'enchant-self', target: 'ally', cooldownTicks: 155 },
        ],
      }),
      'warlock-affliction': spec({
        id: 'warlock-affliction',
        name: '痛苦术士',
        identity: '伤口会好,诅咒不会——易伤之靶,全队的刀都更进一寸。',
        statMods: { attack: -0.5 },
        skills: [
          { id: 'warlock-curse', name: '痛苦诅咒', effect: 'curse-mark', target: 'enemy', cooldownTicks: 100 },
        ],
        advancedSkills: [
          { id: 'afflict-erode', name: '侵蚀诅咒', effect: 'curse-mark', target: 'enemy', cooldownTicks: 110 },
          { id: 'afflict-bolt', name: '暗影箭', effect: 'heavy-strike', target: 'enemy', cooldownTicks: 80 },
        ],
      }),
    },
    synergy: ['blessed-formation'],
  },
}

/** 职业名清单(招募 UI/悬赏用) */
export const LINE_IDS = ['guard', 'priest', 'ranger', 'warrior', 'mage', 'warlock'] as const

/** 专精解析:成员未指定 spec 时回落经典专精(老存档零迁移) */
export function specOf(jobId: string, specId?: string): SpecDef {
  const job = JOBS[jobId]
  const s = specId ? job.specs[specId] : job.specs[job.defaultSpec]
  if (!s) throw new Error(`未知专精: ${jobId}/${specId ?? '(缺省)'}`)
  return s
}

// 轻协同词条（Q13）：效果引擎 D3-4 实装
export const SYNERGY: Record<string, { name: string; desc: string }> = {
  'shield-wall': {
    name: '盾墙掩护',
    desc: '前排坦克存活时，游侠与战士伤害 +15%',
  },
  'blessed-formation': {
    name: '祝福阵型',
    desc: '治疗者存活时，全队防御 +10%',
  },
}
