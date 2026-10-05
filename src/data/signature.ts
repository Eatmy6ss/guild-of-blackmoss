import type { WeaponFamily } from '../sim/types'

// A3 #1.1 招牌技能(玩家可点名释放的主动技,每专精一个)。
// 设计约束(实施计划 #1.1):每个招牌技必须是 effect 层新动词或新目标形状,禁止与基础技同 effect 只改 CD;
// 即时打断不经累计 taken 阈值——但实现上走同一条 stepCastWindow 打断管线(置 rt.taken=阈值,≤1 tick 生效),
// 保证打断日志/演出/rt.next 语义单一路径;rt.brokenBy 让编年史与战报区分"集火奏效"与"招牌拍碎"。

export type SignatureEffect =
  | 'detonate-burn'         // A5 #1.3:消耗目标灼烧层数换爆发(火法身份:叠灼烧→选时机引爆)
  | 'interrupt-shield'      // 打断 + 自身护盾
  | 'interrupt-bind'        // 打断 + 束缚目标
  | 'interrupt-curse'       // 打断 + 目标易伤
  | 'heal-target-cleanse'   // 新目标形状:指定友方治疗 + 清除束缚/灼烧
  | 'pierce-shot'           // 新动词:无视防御的贯穿射击
  | 'enchant-pet'           // 新目标形状:强化宠物(新召唤目标)
  | 'execute-strike'        // 新动词:随目标已损生命增伤的处决
  | 'freeze-backline'       // 新目标形状:敌方后排群体冰封
  | 'sacrifice-strike'      // 新动词:以自身生命为引的重击
  | 'harvest-dots'          // 新动词:收割目标身上的持续伤害转为爆发
  | 'taunt-all-thorns'      // 新目标形状:敌方全体嘲讽 + 反甲

export interface SignatureSkill {
  id: string
  specId: string
  name: string
  cdTicks: number
  effect: SignatureEffect
  targeting: 'enemy' | 'ally' | 'self' | 'none'
  desc: string
  /** R3/W3 武器族门槛:'universal'=通用;族数组=需装备其中一族且熟练(技能门槛与 SkillDef 同语义) */
  weaponFamily: WeaponFamily[] | 'universal'
}

/** 键 = 专精 id(src/data/jobs.ts 现读) */
export const SIGNATURE_SKILLS: Record<string, SignatureSkill> = {
  'mage-fire': {
    id: 'sig-fire-detonate',
    specId: 'mage-fire',
    name: '引燃引爆',
    cdTicks: 75,
    weaponFamily: ['staff'],
    effect: 'detonate-burn',
    targeting: 'enemy',
    desc: '点燃积攒的火焰:消耗目标身上的全部灼烧层数换一次爆发——攒得越久越痛,烧尽即清空。',
  },
  'guard-ironwall': {
    id: 'sig-ironwall-break',
    specId: 'guard-ironwall',
    name: '破咒盾击',
    cdTicks: 60,
    weaponFamily: ['blade', 'axe'],
    effect: 'interrupt-shield',
    targeting: 'enemy',
    desc: '盾面拍碎咒文:立即打断目标的咏唱,并举盾格挡接下来的几下攻击。',
  },
  'warrior-vanguard': {
    id: 'sig-charge-lock',
    specId: 'warrior-vanguard',
    name: '锁足冲锋',
    cdTicks: 60,
    weaponFamily: ['blade', 'axe'],
    effect: 'interrupt-bind',
    targeting: 'enemy',
    desc: '冲进读条里一记锁足:立即打断目标咏唱,并将其钉在原地数息。',
  },
  'priest-discipline': {
    id: 'sig-disc-silence',
    specId: 'priest-discipline',
    name: '诫命沉默',
    cdTicks: 60,
    weaponFamily: ['staff'],
    effect: 'interrupt-curse',
    targeting: 'enemy',
    desc: '以诫命压灭咒文:立即打断目标咏唱,并使其在短时间内受创加深。',
  },
  'priest-holy': {
    id: 'sig-holy-mend',
    specId: 'priest-holy',
    weaponFamily: ['staff', 'blade'],
    name: '圣疗',
    cdTicks: 90,
    effect: 'heal-target-cleanse',
    targeting: 'ally',
    desc: '把圣光送到你点名的人身上:大额治疗,并一并清除其身上的束缚与灼烧。',
  },
  'ranger-hawk': {
    id: 'sig-hawk-pierce',
    specId: 'ranger-hawk',
    name: '贯甲狙击',
    cdTicks: 75,
    weaponFamily: ['bow'],
    effect: 'pierce-shot',
    targeting: 'enemy',
    desc: '看穿甲缝的一箭:无视防御的重击,对集火目标施放。',
  },
  'ranger-beastmaster': {
    id: 'sig-beast-frenzy',
    specId: 'ranger-beastmaster',
    name: '野兽狂暴',
    cdTicks: 300,
    weaponFamily: 'universal',
    effect: 'enchant-pet',
    targeting: 'self',
    desc: '唤起战狼的血性:召唤(若不在场)并强化它——攻击提升,伤势回复。',
  },
  'warrior-weapons': {
    id: 'sig-weapon-execute',
    specId: 'warrior-weapons',
    name: '处决',
    cdTicks: 75,
    weaponFamily: ['blade', 'axe'],
    effect: 'execute-strike',
    targeting: 'enemy',
    desc: '斩向缺口:目标血越少这一刀越重,残血时伤害翻倍以上。对集火目标施放。',
  },
  'mage-frost': {
    id: 'sig-frost-tomb',
    specId: 'mage-frost',
    name: '冰封咒界',
    cdTicks: 120,
    weaponFamily: ['staff'],
    effect: 'freeze-backline',
    targeting: 'none',
    desc: '寒气封住敌方后排的脚踝:所有后排敌人被冻在原地,首领冻得短一些。',
  },
  'warlock-demon': {
    id: 'sig-demon-sacrifice',
    specId: 'warlock-demon',
    name: '恶魔献祭',
    cdTicks: 75,
    weaponFamily: ['staff'],
    effect: 'sacrifice-strike',
    targeting: 'enemy',
    desc: '以自身 12% 最大生命为引,轰出远超寻常的一击。对集火目标施放。',
  },
  'warlock-affliction': {
    id: 'sig-affliction-harvest',
    specId: 'warlock-affliction',
    name: '痛楚收割',
    cdTicks: 75,
    weaponFamily: ['staff'],
    effect: 'harvest-dots',
    targeting: 'enemy',
    desc: '引爆目标身上的灼烧与诅咒:状态越多爆发越痛,灼烧随之耗尽。对集火目标施放。',
  },
  'guard-thorns': {
    id: 'sig-thorns-roar',
    specId: 'guard-thorns',
    name: '荆棘咆哮',
    cdTicks: 120,
    weaponFamily: 'universal',
    effect: 'taunt-all-thorns',
    targeting: 'none',
    desc: '咆哮激怒全体敌人,荆棘自甲上立起:短时间内,凡击中你的人都要流血。',
  },
}
