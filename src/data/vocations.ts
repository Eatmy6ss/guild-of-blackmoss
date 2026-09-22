import type { JobId, SpecDef } from '../sim/types'

// 15 混合职阶(宪法 v3 角色篇):六基础全配对 C(6,2),默契解锁+招募可遇。
// 混合职阶自带头部(职业线 base 的混合)+站位/射程/主职——toCombatant 遇到混合 spec
// 时整体走本表,不再叠加基础职业 base。招牌机制全走同一套效果引擎,没有新引擎成本。

export interface HybridDef extends SpecDef {
  /** 两个来源职业线(默契叙事与转职归属用) */
  lines: [JobId, JobId]
  role: 'tank' | 'healer' | 'dps'
  position: 'front' | 'back'
  range: 'melee' | 'ranged'
  base: { maxHp: number; attack: number; defense: number; speed: number; critChance: number }
}

const h = (x: HybridDef): HybridDef => x

export const HYBRIDS: Record<string, HybridDef> = {
  // ===== 守卫系配对 =====
  'hy-saint': h({
    id: 'hy-saint',
    name: '圣盾使',
    identity: '他的盾后面站得住一个公会——吸收盾会转移到最需要它的人身上。',
    lines: ['guard', 'priest'],
    role: 'tank',
    position: 'front',
    range: 'melee',
    base: { maxHp: 150, attack: 7, defense: 8, speed: 7, critChance: 0.05 },
    skills: [
      { id: 'saint-taunt', name: '威吓', effect: 'taunt', target: 'enemy', cooldownTicks: 60 },
      { id: 'saint-shield', name: '移形圣盾', effect: 'shield-ally', target: 'ally', cooldownTicks: 70 },
    ],
  }),
  'hy-ranger-guard': h({
    id: 'hy-ranger-guard',
    name: '游猎卫',
    identity: '能开路也能断后——持盾冲锋,标枪出手比谁都远。',
    lines: ['guard', 'ranger'],
    role: 'tank',
    position: 'front',
    range: 'melee',
    base: { maxHp: 150, attack: 8, defense: 7, speed: 8, critChance: 0.07 },
    skills: [
      { id: 'rg-charge', name: '持盾冲锋', effect: 'charge-strike', target: 'enemy', cooldownTicks: 70 },
    ],
  }),
  'hy-warlord': h({
    id: 'hy-warlord',
    name: '裂阵者',
    identity: '你打他的每一记,都在为你的葬礼添柴——格挡反击流的极致。',
    lines: ['guard', 'warrior'],
    role: 'tank',
    position: 'front',
    range: 'melee',
    base: { maxHp: 162, attack: 8, defense: 7, speed: 7, critChance: 0.06 },
    skills: [
      { id: 'wl-cleave', name: '裂阵重劈', effect: 'heavy-strike', target: 'enemy', cooldownTicks: 70 },
    ],
    passive: 'counter',
  }),
  'hy-runeblade': h({
    id: 'hy-runeblade',
    name: '符文骑士',
    identity: '符文在甲上发亮——每一记落在盾上的攻击都会化作奥术反冲。',
    lines: ['guard', 'mage'],
    role: 'tank',
    position: 'front',
    range: 'melee',
    base: { maxHp: 148, attack: 8, defense: 8, speed: 6, critChance: 0.05 },
    skills: [
      { id: 'rb-taunt', name: '威吓', effect: 'taunt', target: 'enemy', cooldownTicks: 60 },
      { id: 'rb-enchant', name: '符文赋能', effect: 'enchant-self', target: 'ally', cooldownTicks: 150 },
    ],
  }),
  'hy-soulbinder': h({
    id: 'hy-soulbinder',
    name: '缚魂卫',
    identity: '锁链一头拴着敌人,一头拴着仇恨——谁也别想越过他去。',
    lines: ['guard', 'warlock'],
    role: 'tank',
    position: 'front',
    range: 'melee',
    base: { maxHp: 150, attack: 8, defense: 8, speed: 7, critChance: 0.05 },
    skills: [
      { id: 'sb-chain', name: '缚魂锁链', effect: 'trap-bind', target: 'enemy', cooldownTicks: 100 },
      { id: 'sb-taunt', name: '威吓', effect: 'taunt', target: 'enemy', cooldownTicks: 60 },
    ],
  }),

  // ===== 牧师系配对(守×牧已列) =====
  'hy-hexer': h({
    id: 'hy-hexer',
    name: '咒印手',
    identity: '中箭的人才知道疼——他的每一箭都带着减速与标记。',
    lines: ['priest', 'ranger'],
    role: 'dps',
    position: 'back',
    range: 'ranged',
    base: { maxHp: 128, attack: 8.5, defense: 4, speed: 8, critChance: 0.09 },
    skills: [
      { id: 'hx-mark', name: '咒印之箭', effect: 'curse-mark', target: 'enemy', cooldownTicks: 95 },
    ],
  }),
  'hy-luminary': h({
    id: 'hy-luminary',
    name: '辉光法师',
    identity: '光既是治疗也是审判——圣光铺开时,敌人的阴影无处躲。',
    lines: ['priest', 'mage'],
    role: 'healer',
    position: 'back',
    range: 'ranged',
    base: { maxHp: 118, attack: 8, defense: 4, speed: 6, critChance: 0.07 },
    skills: [
      { id: 'lu-heal', name: '辉光颂', effect: 'heal-lowest', target: 'ally', cooldownTicks: 18 },
      { id: 'lu-nova', name: '圣光新星', effect: 'group-heal', target: 'ally', cooldownTicks: 140 },
    ],
  }),
  'hy-pactpriest': h({
    id: 'hy-pactpriest',
    name: '契灵祭司',
    identity: '祈祷要回音,契约要回报——小鬼替他挡刀,他替全队续命。',
    lines: ['priest', 'warlock'],
    role: 'healer',
    position: 'back',
    range: 'ranged',
    base: { maxHp: 122, attack: 7.5, defense: 4, speed: 6, critChance: 0.05 },
    skills: [
      { id: 'pp-heal', name: '圣光术', effect: 'heal-lowest', target: 'ally', cooldownTicks: 20 },
      { id: 'pp-imp', name: '召唤契灵', effect: 'summon-pet', target: 'ally', cooldownTicks: 200 },
    ],
  }),
  'hy-crusader': h({
    id: 'hy-crusader',
    name: '战地牧者',
    identity: '一手锤子一手绷带——他在最乱的地方救人,顺便敲晕挡路的。',
    lines: ['priest', 'warrior'],
    role: 'healer',
    position: 'front',
    range: 'melee',
    base: { maxHp: 145, attack: 8, defense: 7, speed: 7, critChance: 0.05 },
    skills: [
      { id: 'cr-heal', name: '战地急救', effect: 'heal-lowest', target: 'ally', cooldownTicks: 22 },
      { id: 'cr-channel', name: '战地祷告', effect: 'channel-heal', target: 'ally', cooldownTicks: 175 },
    ],
  }),

  // ===== 游侠/战士/法师/术士 相互配对 =====
  'hy-magickarcher': h({
    id: 'hy-magickarcher',
    name: '魔弓手',
    identity: '向龙之信条致敬——元素附魔的箭,火焰与冰霜都在弦上。',
    lines: ['ranger', 'mage'],
    role: 'dps',
    position: 'back',
    range: 'ranged',
    base: { maxHp: 126, attack: 9, defense: 3, speed: 9, critChance: 0.1 },
    skills: [
      { id: 'ma-nova', name: '冰霜箭雨', effect: 'frost-nova', target: 'enemy', cooldownTicks: 130 },
      { id: 'ma-aimed', name: '元素瞄准', effect: 'heavy-strike', target: 'enemy', cooldownTicks: 70 },
    ],
  }),
  'hy-hexarcher': h({
    id: 'hy-hexarcher',
    name: '蚀箭手',
    identity: '中了他的箭,伤口自己会开口——诅咒与吸血同行。',
    lines: ['ranger', 'warlock'],
    role: 'dps',
    position: 'back',
    range: 'ranged',
    base: { maxHp: 128, attack: 8.5, defense: 3, speed: 9, critChance: 0.1 },
    skills: [
      { id: 'ha-curse', name: '蚀魂咒箭', effect: 'curse-mark', target: 'enemy', cooldownTicks: 100 },
      { id: 'ha-aimed', name: '瞄准射击', effect: 'heavy-strike', target: 'enemy', cooldownTicks: 75 },
    ],
  }),
  'hy-skirmisher': h({
    id: 'hy-skirmisher',
    name: '游击刃',
    identity: '十步之内刀快,十步之外箭快——两种杀法,一张脸。',
    lines: ['ranger', 'warrior'],
    role: 'dps',
    position: 'front',
    range: 'melee',
    base: { maxHp: 150, attack: 9, defense: 5, speed: 9, critChance: 0.09 },
    skills: [
      { id: 'sk-reposition', name: '游刃换位', effect: 'reposition', target: 'ally', cooldownTicks: 90 },
      { id: 'sk-whirl', name: '回旋刃', effect: 'multishot', target: 'enemy', cooldownTicks: 80 },
    ],
  }),
  'hy-battlemage': h({
    id: 'hy-battlemage',
    name: '战斗法师',
    identity: '剑刃上流淌着奥术——附魔之后,每一剑都算两次。',
    lines: ['warrior', 'mage'],
    role: 'dps',
    position: 'front',
    range: 'melee',
    base: { maxHp: 148, attack: 9.5, defense: 5, speed: 7, critChance: 0.07 },
    skills: [
      { id: 'bm-enchant', name: '武器附魔', effect: 'enchant-self', target: 'ally', cooldownTicks: 150 },
      { id: 'bm-combo', name: '符文连斩', effect: 'combo-strike', target: 'enemy', cooldownTicks: 65 },
    ],
  }),
  'hy-bloodreaver': h({
    id: 'hy-bloodreaver',
    name: '血武士',
    identity: '他砍人像喝酒,越喝越醉,越醉越狠——伤害换血的狂化路数。',
    lines: ['warrior', 'warlock'],
    role: 'dps',
    position: 'front',
    range: 'melee',
    base: { maxHp: 158, attack: 10, defense: 4, speed: 8, critChance: 0.08 },
    skills: [
      { id: 'br-combo', name: '血宴连击', effect: 'combo-strike', target: 'enemy', cooldownTicks: 70 },
    ],
  }),
  'hy-spellfire': h({
    id: 'hy-spellfire',
    name: '咒火术士',
    identity: '火与暗从来不是两回事——在他的手里,它们是同一场爆炸。',
    lines: ['mage', 'warlock'],
    role: 'dps',
    position: 'back',
    range: 'ranged',
    base: { maxHp: 112, attack: 10.5, defense: 3, speed: 7, critChance: 0.1 },
    skills: [
      { id: 'sf-bolt', name: '咒火弹', effect: 'heavy-strike', target: 'enemy', cooldownTicks: 60 },
      { id: 'sf-missiles', name: '咒火飞弹', effect: 'multishot', target: 'enemy', cooldownTicks: 80 },
    ],
  }),
}

/** 混合职阶归属判断:成员 spec 是否混合职阶 */
export function isHybrid(specId?: string): boolean {
  return !!specId && specId.startsWith('hy-') && !!HYBRIDS[specId]
}
