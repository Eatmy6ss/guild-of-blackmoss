// 六种族(宪法 v3 角色篇):WoW 软处理——风味+轻被动,数值压在平衡门禁精度以下。
// 种族影响:名字池(生成器)/身份句(招募卡)/一条轻被动。招募随机,无职业限制。

import type { Attributes, JobId } from '../sim/types'
export interface RaceDef {
  id: string
  name: string
  identity: string
  /** 种族×职业限制矩阵(宪法 v3.1):该族可选的职业线 */
  allowedLines: JobId[]
  /** 种族名字池(生成器按种族取名;称谓池沿用全局) */
  names: string[]
  /** 招牌维加成(宪法 v3.3):每族一个六维招牌 */
  attrBonus: Partial<Attributes>
  passive: {
    /** 人类:经验 +5%(学得快) */
    expMult?: number
    /** 矮人:防御 +2(石头的骨头) */
    defense?: number
    /** 高等精灵:暴击 +2%(千年的手感) */
    crit?: number
    /** 兽人:攻击 +4(天生的力气) */
    attack?: number
    /** 亡灵:阵亡冲击减半(已经死过一次的人,不太怕这个) */
    undeadWill?: boolean
    /** 血精灵:受疗 +5%(魔法血统对治疗反应更好) */
    healReceived?: number
  }
}

export const RACES: Record<string, RaceDef> = {
  human: {
    id: 'human',
  attrBonus: { lck: 2 },
  allowedLines: ['guard', 'priest', 'ranger', 'warrior', 'mage', 'warlock'],
    name: '人类',
    identity: '四海为家的短命种,却总能把日子过成事业——学什么都快。',
    names: ['加雷斯', '索恩', '布伦丹', '罗温', '卡尔文', '奥斯蒙', '巴尔德', '克莱门特', '达斯汀', '威尔弗雷德', '艾莉娅', '温娜', '罗莎琳', '布莉安娜', '塞莱斯特', '莫薇拉', '伊丝特拉', '薇尔玛', '奥萝拉', '芙蕾雅'],
    passive: { expMult: 0.05 },
  },
  dwarf: {
    id: 'dwarf',
  attrBonus: { vit: 5 },
  allowedLines: ['guard', 'priest', 'warrior', 'ranger'],
    name: '矮人',
    identity: '石头的骨头,炉火的脾气——站得住的地方就有矮人。',
    names: ['索格林', '巴尔丹', '杜罗克', '布洛姆', '海尔加', '格丽德', '莫达娜', '托尔文'],
    passive: { defense: 2 },
  },
  elf: {
    id: 'elf',
  attrBonus: { agi: 3 },
  allowedLines: ['priest', 'ranger', 'mage', 'warlock'],
    name: '高等精灵',
    identity: '千年的手感,百年的傲气——他们的箭很少落空两次。',
    names: ['洛瑟兰', '塞拉娜', '奥利安', '伊露维雅', '泰兰尼尔', '艾洛蒂', '芬威洛', '丝琳恩'],
    passive: { crit: 0.02 },
  },
  orc: {
    id: 'orc',
  attrBonus: { str: 4 },
  allowedLines: ['guard', 'ranger', 'warrior', 'warlock'],
    name: '兽人',
    identity: '荣耀即力量——别的种族健身,他们出生就在健身。',
    names: ['洛卡尔', '布拉克', '索尔加', '玛卡朵', '格罗娜', '卡尔戈', '乌尔格', '塔玛拉'],
    passive: { attack: 4 },
  },
  undead: {
    id: 'undead',
  attrBonus: { spr: 4 },
  allowedLines: ['ranger', 'warrior', 'mage', 'warlock'],
    name: '亡灵',
    identity: '已经死过一次的人,不太在乎第二次——恐惧对他们失效。',
    names: ['莫里斯', '奥古斯特', '薇拉', '阿尔弗雷德', '克劳迪娅', '埃德蒙', '瑟琳娜', '巴尔萨泽'],
    passive: { undeadWill: true },
  },
  bloodelf: {
    id: 'bloodelf',
  attrBonus: { int: 3 },
  allowedLines: ['priest', 'ranger', 'mage', 'warlock'],
    name: '血精灵',
    identity: '魔力在血里烧——他们对治疗的反应,好得让人嫉妒。',
    names: ['奥菲莉亚', '瑟蕾娜', '凯尔朗', '艾泽莉', '洛萨兰', '薇欧拉', '塞隆', '伊莎娜'],
    passive: { healReceived: 0.05 },
  },
}

export const RACE_IDS = Object.keys(RACES)
