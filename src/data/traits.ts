// 特质图鉴(宪法 v3.4 小怪三层):id → 名称/一句解释/首次遭遇提示
// 引擎解释在 sim/combat.ts 特质库;此处为可读性数据源(手册+战报提示)

export interface TraitInfo {
  id: string
  name: string
  desc: string
  /** 首次遭遇时的战报提示 */
  hint: string
}

export const TRAIT_INFO: Record<string, TraitInfo> = {
  volley: { id: 'volley', name: '淬毒连射', desc: '每第 3 次攻击必然暴击', hint: '注意:它的每一第三箭都又狠又准!' },
  'pack-hunter': { id: 'pack-hunter', name: '群猎', desc: '每存活一只同类,全体伤害 +8%', hint: '注意:它们成群行动时越战越勇!' },
  'last-stand': { id: 'last-stand', name: '困兽', desc: '生命低于 30% 时伤害 ×1.4', hint: '小心:重伤的它反而更危险!' },
  'heavy-plate': { id: 'heavy-plate', name: '重甲', desc: '首次受击伤害减半', hint: '它的甲很厚——第一下打不疼!' },
  venom: { id: 'venom', name: '淬毒', desc: '命中后附加易伤,受伤加深', hint: '被它抓伤的地方会溃烂——小心连击!' },
  'death-blast': { id: 'death-blast', name: '湮灭自爆', desc: '死亡时对全队造成伤害', hint: '别高兴太早——它死的时候会炸!' },
  'death-zone': { id: 'death-zone', name: '冰封遗骸', desc: '死亡时冻住击杀者', hint: '杀了它的人会被冻在原地!' },
  'call-reinforce': { id: 'call-reinforce', name: '临终呼援', desc: '死亡时 30% 概率呼唤半血增援', hint: '它的呼喊可能引来同伴!' },
  regen: { id: 'regen', name: '沼泽再生', desc: '持续缓慢恢复生命', hint: '它在回血——尽快压上输出!' },
  // 版图二·龙脊山脉:龙裔特质
  'dragon-scale': { id: 'dragon-scale', name: '龙鳞', desc: '受到的暴击伤害减半', hint: '鳞片弹开了暴击——对它别指望幸运一击!' },
  'ember-breath': { id: 'ember-breath', name: '灼息', desc: '命中后点燃目标,持续灼烧', hint: '被它喷到了会一直烧——治疗留意火伤!' },
  'dragon-fear': { id: 'dragon-fear', name: '龙威', desc: '命中后压制目标,攻击力暂时降低', hint: '它的威压让人手脚发软——被压住就先退后!' },
}

/** 全部已用特质 id(校验用) */
export const TRAIT_IDS = Object.keys(TRAIT_INFO)
