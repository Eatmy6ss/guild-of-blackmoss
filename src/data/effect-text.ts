// 信息透明化(T2/T3):技能效果/传承威能/通用战技的中文说明——从 combat.ts 实装逻辑提炼,单一来源。
// 纪律:说明必须与实装一致(数字随代码演进同步更新);禁止臆造。

/** 技能 effect → 玩家可读说明(数字与 combat.ts useSkill 实装一致) */
export const SKILL_EFFECT_DESC: Record<string, string> = {
  'heavy-strike': '重击:造成 180% 伤害。',
  'heal-lowest': '治疗血量最低的队友(约 300% 治疗强度);全员 75% 血以上时不施放。',
  taunt: '嘲讽血量最高的敌人,迫使它攻击自己数秒,并注入大量仇恨。',
  'charge-strike': '冲锋:160% 伤害,并吸引全体敌人的仇恨。',
  'group-heal': '群体治疗:恢复血量低于 70% 的队友各约 300% 治疗强度。',
  'shield-ally': '为血量最低的队友挂护盾(约攻击×6 点吸收);全员 75% 血以上时不施放。',
  'curse-mark': '诅咒血量最高的敌人:其受到的伤害 +25%,持续 12 秒。',
  'frost-nova': '霜寒新星:全体敌人减速 8 秒,并受 50% 伤害。',
  multishot: '弹幕:同时命中至多两个敌人(各 100% 伤害)。',
  'trap-bind': '捕兽夹:束缚血量最高的敌人约 2 秒(首领抗性缩短)。',
  'summon-pet': '召唤战狼/契约小鬼并肩作战(每场一只;存活期间技能转冷)。',
  'armor-break': '破甲:80% 伤害,并永久削减目标 4 点防御。',
  'combo-strike': '连击循环:每 2 次积攒 1 层,第 3 刀爆发 220% 伤害并清空。',
  reposition: '战术换位:救回被拉拽的队友,或把血量最低的前排换到后排。',
  'channel-heal': '引导祷言:吟唱 4 秒后全队大治疗——期间被打掉足够血量就会前功尽弃。',
  'enchant-self': '符文赋能:攻击提升 30%,持续 15 秒。',
}

/** 技能说明整句(名称+冷却+说明),面板与转职卡片共用 */
export function skillLine(skill: { name: string; effect: string; cooldownTicks: number }, weaponFamily?: import('../sim/types').WeaponFamily[] | 'universal'): string {
  const desc = SKILL_EFFECT_DESC[skill.effect] ?? '效果说明待补。'
  const sec = (skill.cooldownTicks / 10).toFixed(skill.cooldownTicks % 10 === 0 ? 0 : 1)
  const famTag = !weaponFamily || weaponFamily === 'universal' ? ''
    : `(需${weaponFamily.map((f) => WEAPON_FAMILY_NAMES[f]).join('/')})`
  return `【${skill.name}】${famTag}(冷却 ${sec} 秒)${desc}`
}

const WEAPON_FAMILY_NAMES: Record<string, string> = { blade: '刃', bow: '弓', staff: '杖', axe: '锤斧', polearm: '长柄' }

/** 传承威能(A13 后续:名称+说明单一来源;与 combat.ts 实装一一对应) */
export const LEGACY_INFO: Record<string, { name: string; desc: string }> = {
  focus: { name: '锋镝', desc: '对集火目标的伤害额外 +10%。' },
  killheal: { name: '饮血', desc: '击杀敌人后,回复少量生命。' },
  bulwark: { name: '磐石', desc: '受到首领的伤害降低 8%。' },
  mend: { name: '春霖', desc: '受到的治疗提高。' },
  elitewarden: { name: '嗜功', desc: '对精英与首领的伤害 +8%。' },
  emberward: { name: '烬衣', desc: '灼热地形与灼烧伤害减半。' },
  triumph: { name: '凯歌', desc: '远征战胜利后,全队士气 +2。' },
  scavenger: { name: '拾荒', desc: '远征掉落概率提升。' },
}

/** 专精被动说明(与 jobs.ts passive 字段对应) */
export const SPEC_PASSIVE_DESC: Record<string, string> = {
  counter: '被动·反击:被近战命中后,有几率立即还击(30% 伤害)。',
}
