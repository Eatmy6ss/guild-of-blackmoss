// 公会经济与酒馆事件数据表(M1 P0 切片 2,宪法红线 1:内容皆数据)
// 资源:金币(战斗/变卖获得,招募与悬赏消耗)+ 英灵祝福(阵亡产生,抽取消耗——死亡经济闭环)

export const ECONOMY = {
  /** 胜场金币奖励 */
  battleGold: { wave: 30, boss: 80 },
  /** 副本通关一次性奖励 */
  clearBonus: 100,
  /** 每位阵亡英雄产生的英灵祝福 */
  blessingPerDeath: 3,
  /** 装备变卖:基础按 tier,词条加值 */
  sell: { perTier: 45, perRoll: 12 },
  /** 定向悬赏:花金指定职业招一人 */
  bountyCost: 120,
  /** 酒馆传闻:花金+祝福抽三选一(候选品质更高) */
  taleCost: { gold: 220, blessing: 5 },
  /** 招募冷却:招募一位后需完成 N 次远征;存活不足时减半(防软锁) */
  cooldownRuns: 2,
  cooldownRunsWhenShorthanded: 1,
  /** 每次返回公会触发上门事件的概率 */
  visitorChance: 0.55,
  /** 上门候选等级 = 远征队平均等级 + 偏移区间 */
  visitorLevel: { base: -1, spread: 2 },
  /** 离线累积:存活英雄每人每小时接零工的金币;上限与起算门槛 */
  offline: { perHeroPerHour: 8, capHours: 24, minHours: 0.5 },
  /** 传闻候选等级 = 平均远征等级 + 1 */
  taleLevelBonus: 1,
  /** 药水经济(2026-09 改造):药水入公会库存,出征携带/战斗消耗/回城退回剩余,仓库金币补货 */
  potionCost: { heal: 45, fury: 70 },
  startingPotions: { heal: 3, fury: 3 },
  // 职阶切换(宪法 v3):解锁容易(基础专精间轻消耗),混合职阶另花一次性解锁;回练过的专精不打折
  vocation: { switchGold: 120, switchBlessing: 2, hybridUnlockGold: 200, hybridUnlockBlessing: 5 },
  /** 混合职阶的默契门槛:成员默契星总和(共同远征积累) */
  hybridBondRequirement: 8,
  /** 精进(Lv6+,二选一)与通用战技(祝福学,跨专精)成本 */
  advancedCost: { gold: 150, blessing: 3 },
  augmentCost: 8,
  /** 通用战技表:id → { 名称/说明/效果键 }(效果在 toCombatant 解释) */
  augments: {
    'aug-vit': { name: '体魄', desc: '最大生命 +8%' },
    'aug-iron': { name: '铁骨', desc: '防御 +2' },
    'aug-eye': { name: '锐眼', desc: '暴击 +3%' },
    'aug-blood': { name: '血性', desc: '攻击 +3' },
    'aug-resolve': { name: '韧性', desc: '目睹阵亡的士气冲击减半' },
  },
} as const

/** 上门访客的背景一句话(涌现叙事入口:每个人带着故事进门) */
export const VISITOR_STORIES: string[] = [
  '在酒炉旁坐下,说北边的商路被水蛭搅了,想找点事做。',
  '把一柄断刀放在桌上,只说了一句:"队伍散了,人还没散。"',
  '自称替死去的兄弟来完成最后一纸契约。',
  '斗篷上还带着沼泽的泥,问的最多的却是伙食。',
  '在悬赏板前站了很久,最后说:"只要管饭,营救的谢礼你们留着。"',
  '说自己是听说了"黑苔会吃人"的传闻,特地来会会的。',
  '付了杯酒钱就要签契约,连名字都是喝到一半才说的。',
  '磨了整晚的剑,天亮时敲开了会长的门。',
]
