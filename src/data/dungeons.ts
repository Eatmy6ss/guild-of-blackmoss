import type { DungeonDef } from '../sim/types'

// M0 唯一副本：3 人本，2 boss，覆盖全部 5 种机制（机制引擎 D8-9 实装）
export const BLACKMOSS: DungeonDef = {
  id: 'blackmoss',
  name: '黑苔沼泽',
  enemyPower: 1.0,
  expectedLevel: 3,
  size: 3,
  branches: [
    {
      id: 'shortcut',
      name: '蛙人小径',
      risk: 3,
      reward: 2,
      desc: '快而险：蛙人拦路，但离 boss 巢穴更近',
    },
    {
      id: 'safepath',
      name: '枯木栈道',
      risk: 1,
      reward: 1,
      desc: '慢而稳：多绕一段路，几乎无埋伏',
    },
  ],
  enemyGroups: {
    frogs: [
      { id: 'frog-a',
      traits: ['regen'], name: '沼泽蛙人', maxHp: 450, attack: 8, defense: 4, speed: 7, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'frog-b',
      traits: ['regen'], name: '沼泽蛙人', maxHp: 450, attack: 8, defense: 4, speed: 7, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'frog-c',
      traits: ['regen'], skills: [{ id: 'frog-heal', name: '蛙群愈疗', effect: 'heal-lowest', target: 'ally', cooldownTicks: 90 }], name: '蛙人萨满', maxHp: 340, attack: 11, defense: 2, speed: 8, position: 'back', range: 'ranged', archetype: 'striker' },
    ],
    wolves: [
      { id: 'wolf-a',
      traits: ['pack-hunter'], name: '腐化狼', maxHp: 540, attack: 14, defense: 3, speed: 12, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'wolf-b',
      traits: ['pack-hunter'], name: '腐化狼', maxHp: 540, attack: 14, defense: 3, speed: 12, position: 'front', range: 'melee', archetype: 'bruiser' },
    ],
    // D15 反馈调参：节奏太快——新增缓冲场（肉度高、威胁低的杂兵）
    'frogs-frail': [
      { id: 'frog-add-a',
      traits: ['regen'], name: '沼泽蛙人', maxHp: 280, attack: 8, defense: 3, speed: 7, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'frog-add-b',
      traits: ['regen'], name: '沼泽蛙人', maxHp: 280, attack: 8, defense: 3, speed: 7, position: 'front', range: 'melee', archetype: 'shield' },
    ],
    'wolves-frail': [
      { id: 'wolf-add-a',
      traits: ['pack-hunter'], name: '腐化狼', maxHp: 360, attack: 9, defense: 2, speed: 11, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'wolf-add-b',
      traits: ['pack-hunter'], name: '腐化狼', maxHp: 360, attack: 9, defense: 2, speed: 11, position: 'front', range: 'melee', archetype: 'bruiser' },
    ],
    leeches: [
      { id: 'leech-a',
      traits: ['regen'], name: '沼泽水蛭', maxHp: 420, attack: 8, defense: 2, speed: 6, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'leech-b',
      traits: ['regen'], name: '沼泽水蛭', maxHp: 420, attack: 8, defense: 2, speed: 6, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'leech-c',
      traits: ['regen'], name: '沼泽水蛭', maxHp: 420, attack: 9, defense: 2, speed: 6, position: 'front', range: 'melee', archetype: 'shield' },
    ],
  },
  bosses: {
    'grush': {
      id: 'grush',
      name: '沼泽食人魔·格鲁什',
      // 节奏改版:boss TTK 目标 35-45s——血 ×1.3;零指挥 54% 越界回调:血 2500/震地 30
      // 试玩反馈④:全场硬化后零指挥 59% 再松一档——血 2400/攻 17
      maxHp: 2400,
      attack: 17,
      defense: 8,
      speed: 7,
      position: 'front',
      range: 'melee',
      mechanics: [
        {
          id: 'grush-slam',
          kind: 'telegraph-aoe',
          name: '震地猛击',
          // D13:40 伤害/每 9s——硬吃 = 每 9s 全队 120 chip,分散 = 28;不切阵型会掉进保护线
          params: { telegraphTicks: 30, damage: 30, everyTicks: 100 },
        },
        {
          id: 'grush-call',
          kind: 'summon',
          name: '呼唤蛙人',
          // D15 反馈:召唤 1→2,增援压力翻倍
          params: { atHpPct: 0.5, count: 2, groupId: 'frogs-frail' },
        },
      ],
      dropTable: [
        { baseId: 'wpn-t2-bow', chance: 0.3 },
        { baseId: 'arm-t2-plate', chance: 0.3 },
        { baseId: 'wpn-line-guard', chance: 0.2 },
        { baseId: 'trk-sign-frogeye', chance: 0.3 },
      ],
    },
    'talma': {
      id: 'talma',
      name: '深渊祭司·塔尔玛',
      // D15 反馈:压迫感应强于格鲁什——全面加压(试玩反馈 #4)
      // 指挥有感补偿:打断变可达后中位胜率 86→98 越界,加血+狂暴提前把压力买回来
      // 节奏改版:血 ×1.25;中位 94% 越界回压:攻 15/束缚伤 22/狂暴提前 130
      // 属性改革+种族钉人后小队抽取变化,⑲ 验收 3/8 差一档:软化狂暴与束缚把长败局转成胜局
      // 试玩反馈④节奏重校准:全场敌人硬化后 3000 血拖成 80s+ 狂暴拉锯——血 2450/攻 14 压回带内
      maxHp: 2450,
      attack: 14,
      defense: 6,
      speed: 9,
      position: 'back',
      range: 'ranged',
      mechanics: [
        {
          id: 'talma-call',
          kind: 'summon',
          name: '唤起腐狼',
          params: { atHpPct: 0.75, count: 2, groupId: 'wolves-frail' },
        },
        {
          id: 'talma-void',
          kind: 'cast-buff',
          name: '虚空咏唱',
          // 指挥有感修正:实测 5 级小队 25tick 内仅能打出 65-80 伤害,180 门槛让打断形同虚设
          // (打断是指令映射的核心 payoff,门槛必须可达)——窗口 3s 供人反应,门槛压到小队可及
          params: { castTicks: 30, attackBuff: 10, durationTicks: 120, everyTicks: 240, breakDamage: 110 },
        },
        {
          id: 'talma-bind',
          kind: 'bind',
          name: '深渊束缚',
          // 节奏改版:0.5→0.6——战斗拉长后小队到不了半血线,束缚提前到 60% 保证中段机制必触发
          params: { atHpPct: 0.6, bindTicks: 24, damage: 16 },
        },
        {
          id: 'talma-enrage',
          kind: 'enrage',
          name: '狂暴软墙',
          params: { atTick: 140, attackMult: 1.78 },
        },
      ],
      dropTable: [
        { baseId: 'trk-t2-totem', chance: 0.4 },
        { baseId: 'wpn-t2-bow', chance: 0.2 },
        { baseId: 'wpn-line-mage', chance: 0.2 },
      ],
    },
  },
  routeNodes: [
    { id: 'bm-frogs', name: '蛙人哨兵', kind: 'battle', encounterId: 'enc-frogs', desc: '蛙人拦路的哨戒线' },
    { id: 'bm-wolves', name: '狼群猎场', kind: 'elite', encounterId: 'enc-wolves', desc: '腐化狼群,凶险但掉落翻倍' },
    { id: 'bm-leeches', name: '水蛭洼地', kind: 'battle', encounterId: 'enc-leeches', desc: '水蛭成片,磨人的泥沼' },
    { id: 'bm-camp', name: '药贩营地', kind: 'event', desc: '一个行脚药贩在营地等候' },
    { id: 'bm-hut', name: '隐士棚屋', kind: 'rest', desc: '隐士允许你们歇歇脚' },
    { id: 'bm-quirrel', name: '混编伏击', kind: 'battle', encounterId: 'enc-quirrel', desc: '蛙人与狼联手设伏' },
    { id: 'bm-mire', name: '沼腹深处', kind: 'battle', encounterId: 'enc-mire', desc: '越往里,泥越深' },
    { id: 'bm-chest', name: '沉船货箱', kind: 'treasure', desc: '搁浅的货船残骸,货箱还封着蜡' },
  ],
  encounters: [
    { id: 'enc-frogs', name: '蛙人哨兵', kind: 'wave', enemyGroupIds: ['frogs'] },
    { id: 'enc-wolves', name: '腐化狼群', kind: 'wave', enemyGroupIds: ['wolves'] },
    { id: 'enc-leeches', name: '沼泽水蛭', kind: 'wave', enemyGroupIds: ['leeches'] },
    { id: 'enc-grush', name: '沼泽食人魔·格鲁什', kind: 'boss', enemyGroupIds: [], bossId: 'grush' },
    { id: 'enc-talma', name: '深渊祭司·塔尔玛', kind: 'boss', enemyGroupIds: [], bossId: 'talma' },
    { id: 'enc-quirrel', name: '蛙人狼群混编', kind: 'wave', enemyGroupIds: ['frogs-frail', 'wolves'] },
    { id: 'enc-mire', name: '水蛭蛙人沼腹', kind: 'wave', enemyGroupIds: ['leeches', 'frogs-frail'] },
  ],
}

// 副本 #2(节奏改版后开工):锈坑矿道——废弃矿坑,尸化矿工与穴居生物
// boss 掘锚的机制组合(蓄力+召唤+定时狂暴)与黑苔双 boss(蓄力+召唤 / 咏唱+束缚+狂暴)刻意错开
export const RUSTMINE: DungeonDef = {
  id: 'rustmine',
  name: '锈坑矿道',
  enemyPower: 1.05,
  expectedLevel: 3,
  size: 3,
  branches: [
    {
      id: 'cartline',
      name: '矿车轨道',
      risk: 3,
      reward: 3,
      desc: '直下主矿脉：穴蝠盘踞，但矿脉深处遗物更多',
    },
    {
      id: 'airshaft',
      name: '通风巷道',
      risk: 1,
      reward: 1,
      desc: '绕行风道：路远,但几乎不会遇到埋伏',
    },
  ],
  enemyGroups: {
    miners: [
      { id: 'miner-a',
      traits: ['heavy-plate'], name: '尸化矿工', maxHp: 460, attack: 9, defense: 5, speed: 6, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'miner-b',
      traits: ['heavy-plate'], name: '尸化矿工', maxHp: 460, attack: 9, defense: 5, speed: 6, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'lampkeeper',
      skills: [{ id: 'lamp-empower', name: '矿灯赋能', effect: 'enchant-self', target: 'ally', cooldownTicks: 120 }], name: '矿灯术士', maxHp: 340, attack: 11, defense: 2, speed: 8, position: 'back', range: 'ranged', archetype: 'striker' },
    ],
    bats: [
      { id: 'bat-a',
      traits: ['pack-hunter', 'last-stand'], name: '锈穴蝠', maxHp: 420, attack: 13, defense: 2, speed: 14, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'bat-b',
      traits: ['pack-hunter', 'last-stand'], name: '锈穴蝠', maxHp: 420, attack: 13, defense: 2, speed: 14, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'bat-c',
      traits: ['pack-hunter'], name: '锈穴蝠', maxHp: 340, attack: 12, defense: 2, speed: 14, position: 'front', range: 'melee', archetype: 'bruiser' },
    ],
    spiders: [
      { id: 'spider-a',
      traits: ['venom'], name: '岩蛛', maxHp: 500, attack: 12, defense: 4, speed: 8, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'spider-b',
      traits: ['venom'], name: '岩蛛', maxHp: 500, attack: 12, defense: 4, speed: 8, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'spider-queen',
      traits: ['venom'], skills: [{ id: 'queen-venom', name: '淬毒尖刺', effect: 'curse-mark', target: 'enemy', cooldownTicks: 100 }], name: '毒蛛后', maxHp: 360, attack: 13, defense: 2, speed: 9, position: 'back', range: 'ranged', archetype: 'striker' },
    ],
    'bats-frail': [
      { id: 'bat-add-a',
      traits: ['pack-hunter'], name: '锈穴蝠', maxHp: 300, attack: 10, defense: 2, speed: 13, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'bat-add-b',
      traits: ['pack-hunter'], name: '锈穴蝠', maxHp: 300, attack: 10, defense: 2, speed: 13, position: 'front', range: 'melee', archetype: 'bruiser' },
    ],
  },
  bosses: {
    delveanchor: {
      id: 'delveanchor',
      name: '矿脉吞噬者·掘锚',
      // 节奏带:35-45s。慢速重锤(6 速=每 1s 一击),坑道坍塌逼走位,65% 呼蝠群,200tick 过载狂暴
      maxHp: 2600,
      attack: 16,
      defense: 7,
      speed: 6,
      position: 'front',
      range: 'melee',
      mechanics: [
        {
          id: 'delve-collapse',
          kind: 'telegraph-aoe',
          name: '坑道坍塌',
          params: { telegraphTicks: 36, damage: 32, everyTicks: 110 },
        },
        {
          id: 'delve-pull',
          kind: 'pull',
          name: '岩钉钩索',
          params: { everyTicks: 260, durationTicks: 600 },
        },
        {
          id: 'delve-call',
          kind: 'summon',
          name: '唤出蝠群',
          params: { atHpPct: 0.65, count: 2, groupId: 'bats-frail' },
        },
        {
          id: 'delve-overload',
          kind: 'enrage',
          name: '过载运转',
          params: { atTick: 200, attackMult: 1.7 },
        },
      ],
      dropTable: [
        { baseId: 'arm-t2-plate', chance: 0.3 },
        { baseId: 'trk-t2-totem', chance: 0.2 },
        { baseId: 'wpn-t2-bow', chance: 0.2 },
        { baseId: 'wpn-line-ranger', chance: 0.2 },
        { baseId: 'arm-sign-minershell', chance: 0.3 },
      ],
    },
  },
  routeNodes: [
    { id: 'rm-miners', name: '主矿脉', kind: 'battle', encounterId: 'enc-miners', desc: '尸化矿工仍在凿壁' },
    { id: 'rm-bats', name: '穴蝠巢', kind: 'elite', encounterId: 'enc-bats', desc: '锈穴蝠成群,掉落翻倍' },
    { id: 'rm-spiders', name: '蛛网巷道', kind: 'battle', encounterId: 'enc-spiders', desc: '岩蛛与毒蛛后的领地' },
    { id: 'rm-cart', name: '矿车休息站', kind: 'rest', desc: '还能推动的矿车,正好歇脚' },
    { id: 'rm-batmix', name: '蝠蛛混巢', kind: 'battle', encounterId: 'enc-batmix', desc: '蝠群与蛛网在同一巷道' },
    { id: 'rm-deepvein', name: '深层矿脉', kind: 'battle', encounterId: 'enc-deepvein', desc: '越深,矿灯越暗' },
    { id: 'rm-crate', name: '坍塌货仓', kind: 'treasure', desc: '塌方封存的物资仓' },
    { id: 'rm-echo', name: '巷道回声', kind: 'event', desc: '塌方后有敲击声,像求救' },
  ],
  encounters: [
    { id: 'enc-miners', name: '尸化矿工队', kind: 'wave', enemyGroupIds: ['miners'] },
    { id: 'enc-bats', name: '锈穴蝠群', kind: 'wave', enemyGroupIds: ['bats'] },
    { id: 'enc-spiders', name: '岩蛛巢室', kind: 'wave', enemyGroupIds: ['spiders'] },
    { id: 'enc-delveanchor', name: '矿脉吞噬者·掘锚', kind: 'boss', enemyGroupIds: [], bossId: 'delveanchor' },
    { id: 'enc-batmix', name: '蝠蛛混巢', kind: 'wave', enemyGroupIds: ['bats-frail', 'spiders'] },
    { id: 'enc-deepvein', name: '深层矿脉', kind: 'wave', enemyGroupIds: ['miners', 'bats-frail'] },
  ],
}

// 副本 #3:灰烬旧战场——一代王朝的葬身之地,骸骨仍在列队
// boss 摩尔德雷克首个「双指令 boss」:葬仪横扫逼分散 + 亡者号角逼打断 + 唤怨灵逼转火,
// 三条指挥线同时在手,难度阶梯压在 #4/#5 之前
export const ASHFIELD: DungeonDef = {
  id: 'ashfield',
  name: '灰烬旧战场',
  enemyPower: 1.1,
  expectedLevel: 5,
  size: 3,
  branches: [
    {
      id: 'boneroad',
      name: '白骨大道',
      risk: 3,
      reward: 3,
      desc: '直取王帐废墟：骸骨列队守路，但军械库的遗物就在深处',
    },
    {
      id: 'riverwash',
      name: '河滩绕行',
      risk: 1,
      reward: 1,
      desc: '沿灰河绕行：路远泥泞，但亡者不喜水声',
    },
  ],
  enemyGroups: {
    skeletons: [
      { id: 'skeleton-a',
      traits: ['heavy-plate'], name: '骸骨盾兵', maxHp: 460, attack: 9, defense: 5, speed: 6, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'skeleton-b',
      traits: ['heavy-plate'], name: '骸骨盾兵', maxHp: 460, attack: 9, defense: 5, speed: 6, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'wraith-caster', traits: ['venom', 'volley'], name: '怨灵术士', maxHp: 340, attack: 11, defense: 2, speed: 8, position: 'back', range: 'ranged', archetype: 'striker' },
    ],
    wraiths: [
      { id: 'wraith-a',
      traits: ['last-stand'], name: '战场怨灵', maxHp: 400, attack: 12, defense: 2, speed: 14, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'wraith-b',
      traits: ['last-stand'], name: '战场怨灵', maxHp: 400, attack: 12, defense: 2, speed: 14, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'wraith-c',
      traits: ['last-stand'], name: '战场怨灵', maxHp: 360, attack: 12, defense: 2, speed: 14, position: 'front', range: 'melee', archetype: 'bruiser' },
    ],
    knights: [
      { id: 'tombknight-a',
      traits: ['heavy-plate', 'last-stand'], name: '墓骑', maxHp: 520, attack: 12, defense: 4, speed: 8, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'tombknight-b',
      traits: ['heavy-plate', 'last-stand'], name: '墓骑', maxHp: 520, attack: 12, defense: 4, speed: 8, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'elegist',
      skills: [{ id: 'elegy-heal', name: '亡者挽歌', effect: 'heal-lowest', target: 'ally', cooldownTicks: 100 }], name: '挽歌者', maxHp: 360, attack: 13, defense: 2, speed: 9, position: 'back', range: 'ranged', archetype: 'striker' },
    ],
    'wraiths-frail': [
      { id: 'wraith-add-a',
      traits: ['last-stand'], name: '战场怨灵', maxHp: 300, attack: 10, defense: 2, speed: 13, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'wraith-add-b',
      traits: ['last-stand'], name: '战场怨灵', maxHp: 300, attack: 10, defense: 2, speed: 13, position: 'front', range: 'melee', archetype: 'bruiser' },
    ],
  },
  bosses: {
    moldreke: {
      id: 'moldreke',
      name: '破誓大公·摩尔德雷克',
      // 节奏带 35-45s:横扫(分散)/号角(打断)/怨灵(转火)三线指挥,参数沿用已校准线
      maxHp: 2600,
      attack: 15,
      defense: 7,
      speed: 7,
      position: 'front',
      range: 'melee',
      mechanics: [
        {
          id: 'mold-sweep',
          kind: 'telegraph-aoe',
          name: '葬仪横扫',
          params: { telegraphTicks: 36, damage: 30, everyTicks: 105 },
        },
        {
          id: 'mold-horn',
          kind: 'cast-buff',
          name: '亡者号角',
          params: { castTicks: 30, attackBuff: 9, durationTicks: 120, everyTicks: 240, breakDamage: 110 },
        },
        {
          id: 'mold-phase',
          kind: 'phase-invuln',
          name: '亡者相位',
          params: { everyTicks: 300, durationTicks: 30 },
        },
        {
          id: 'mold-call',
          kind: 'summon',
          name: '唤起怨灵',
          params: { atHpPct: 0.6, count: 2, groupId: 'wraiths-frail' },
        },
      ],
      dropTable: [
        { baseId: 'wpn-t2-bow', chance: 0.3 },
        { baseId: 'arm-t2-plate', chance: 0.2 },
        { baseId: 'wpn-line-warrior', chance: 0.2 },
        { baseId: 'wpn-sign-warbrand', chance: 0.3 },
      ],
    },
  },
  routeNodes: [
    { id: 'af-skeletons', name: '白骨大道', kind: 'battle', encounterId: 'enc-skeletons', desc: '骸骨仍在列队行军' },
    { id: 'af-wraiths', name: '怨灵游荡', kind: 'elite', encounterId: 'enc-wraiths', desc: '游荡的怨灵,掉落翻倍' },
    { id: 'af-knights', name: '墓骑巡境', kind: 'battle', encounterId: 'enc-knights', desc: '墓骑的巡逻路线' },
    { id: 'af-camp', name: '旧军营垒', kind: 'rest', desc: '半塌的营垒,还能挡风' },
    { id: 'af-bonemix', name: '骨怨混编', kind: 'battle', encounterId: 'enc-bonemix', desc: '骸骨与怨灵同行' },
    { id: 'af-funeral', name: '葬仪行列', kind: 'battle', encounterId: 'enc-funeral', desc: '墓骑开道,挽歌相随' },
    { id: 'af-relic', name: '军械库残堆', kind: 'treasure', desc: '王朝军械库的最后一角' },
    { id: 'af-trumpet', name: '未响的号角', kind: 'event', desc: '号角一响,亡者当立正位' },
  ],
  encounters: [
    { id: 'enc-skeletons', name: '骸骨列队', kind: 'wave', enemyGroupIds: ['skeletons'] },
    { id: 'enc-wraiths', name: '怨灵游荡', kind: 'wave', enemyGroupIds: ['wraiths'] },
    { id: 'enc-knights', name: '墓骑巡境', kind: 'wave', enemyGroupIds: ['knights'] },
    { id: 'enc-moldreke', name: '破誓大公·摩尔德雷克', kind: 'boss', enemyGroupIds: [], bossId: 'moldreke' },
    { id: 'enc-bonemix', name: '骨怨混编', kind: 'wave', enemyGroupIds: ['wraiths-frail', 'skeletons'] },
    { id: 'enc-funeral', name: '葬仪行列', kind: 'wave', enemyGroupIds: ['knights'] },
  ],
}

// 副本 #4(2026-09 扩量):白霜墓园——终年不化的冻土墓园,亡者被霜封在临死的一刻
// 主题机制「减速」:霜裔织法者的霜寒裹尸布让挨打的人行动变缓(间隔×2)——
// 教玩家一个新 READ:队伍出手变慢=战报里自己人出手频率骤降,该交爆发药抢节奏
export const FROSTGRAVE: DungeonDef = {
  id: 'frostgrave',
  name: '白霜墓园',
  enemyPower: 0.95,
  expectedLevel: 6,
  size: 3,
  branches: [
    {
      id: 'tombroad',
      name: '拜陵大道',
      risk: 3,
      reward: 3,
      desc: '直抵织法者的冰棺：墓卫列队看守，但陪葬的遗物未被人动过',
    },
    {
      id: 'pinepath',
      name: '松林绕行',
      risk: 1,
      reward: 1,
      desc: '钻松林绕开陵道：路远雪深，但霜狼不喜欢松脂味',
    },
  ],
  enemyGroups: {
    wights: [
      { id: 'wight-a', traits: ['death-zone', 'last-stand'], name: '冻僵的墓卫', maxHp: 500, attack: 10, defense: 6, speed: 6, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'wight-b', traits: ['death-zone', 'last-stand'], name: '冻僵的墓卫', maxHp: 500, attack: 10, defense: 6, speed: 6, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'jackdaw', traits: ['volley', 'pack-hunter'], skills: [{ id: 'jack-frost', name: '寒鸦冰箭', effect: 'frost-nova', target: 'enemy', cooldownTicks: 999 }], name: '寒鸦术士', maxHp: 360, attack: 12, defense: 2, speed: 9, position: 'back', range: 'ranged', archetype: 'striker' },
    ],
    frostwolves: [
      { id: 'fwolf-a',
      traits: ['pack-hunter', 'last-stand'], name: '霜狼', maxHp: 460, attack: 14, defense: 3, speed: 13, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'fwolf-b',
      traits: ['pack-hunter', 'last-stand'], name: '霜狼', maxHp: 460, attack: 14, defense: 3, speed: 13, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'fwolf-c',
      traits: ['pack-hunter'], name: '霜狼', maxHp: 420, attack: 13, defense: 3, speed: 13, position: 'front', range: 'melee', archetype: 'bruiser' },
    ],
    gravekeepers: [
      { id: 'graver-a', traits: ['call-reinforce', 'heavy-plate'], name: '掘墓人', maxHp: 540, attack: 10, defense: 6, speed: 5, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'graver-b', traits: ['call-reinforce', 'heavy-plate'], name: '掘墓人', maxHp: 540, attack: 10, defense: 6, speed: 5, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'graver-c', traits: ['call-reinforce', 'heavy-plate'], name: '掘墓人', maxHp: 500, attack: 11, defense: 5, speed: 5, position: 'front', range: 'melee', archetype: 'shield' },
    ],
    'wights-frail': [
      { id: 'wight-add-a',
      traits: ['death-zone'], name: '冻僵的墓卫', maxHp: 300, attack: 9, defense: 3, speed: 6, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'wight-add-b',
      traits: ['death-zone'], name: '冻僵的墓卫', maxHp: 300, attack: 9, defense: 3, speed: 6, position: 'front', range: 'melee', archetype: 'shield' },
    ],
  },
  bosses: {
    velhola: {
      id: 'velhola',
      name: '霜裔织法者·薇尔霍拉',
      // 减速系考试:裹尸布(挨打变慢)+ 冰葬风暴(分散)+ 凛冬(软墙)——后排施法者,坦克拉不住她的视线
      // ⑲ 校准:2800 血 28.9s 越下带(减速还没发力人就死了)→ 3200 拉进 35-45s 带
      maxHp: 3200,
      attack: 15,
      defense: 7,
      speed: 8,
      position: 'back',
      range: 'ranged',
      mechanics: [
        {
          id: 'velhola-shroud',
          kind: 'slow-touch',
          name: '霜寒裹尸布',
          params: { chance: 0.35, ticks: 30 },
        },
        {
          id: 'velhola-storm',
          kind: 'telegraph-aoe',
          name: '冰葬风暴',
          params: { telegraphTicks: 36, damage: 28, everyTicks: 105 },
        },
        {
          id: 'velhola-winter',
          kind: 'enrage',
          name: '凛冬之怒',
          params: { atTick: 200, attackMult: 1.7 },
        },
      ],
      dropTable: [
        { baseId: 'wpn-t2-bow', chance: 0.3 },
        { baseId: 'trk-t2-totem', chance: 0.2 },
        { baseId: 'wpn-line-priest', chance: 0.2 },
        { baseId: 'trk-sign-frostheart', chance: 0.3 },
      ],
    },
  },
  routeNodes: [
    { id: 'fg-wights', name: '墓卫列队', kind: 'battle', encounterId: 'enc-wights', desc: '冻僵的墓卫仍在站岗' },
    { id: 'fg-wolves', name: '霜狼猎场', kind: 'elite', encounterId: 'enc-frostwolves', desc: '霜狼成群,掉落翻倍' },
    { id: 'fg-gravers', name: '掘墓工棚', kind: 'battle', encounterId: 'enc-gravekeepers', desc: '掘墓人昼夜不休' },
    { id: 'fg-altar', name: '冰封祭坛', kind: 'event', desc: '祭坛上结着不化的冰' },
    { id: 'fg-tent', name: '猎户帐篷', kind: 'rest', desc: '猎户留下的帐篷,火塘还温着' },
    { id: 'fg-frostmix', name: '墓卫鸦士混编', kind: 'battle', encounterId: 'enc-frostmix', desc: '墓卫与寒鸦同巡' },
    { id: 'fg-icetomb', name: '冰棺回廊', kind: 'battle', encounterId: 'enc-icetomb', desc: '冰棺排满回廊两侧' },
    { id: 'fg-cache', name: '陪葬冰窖', kind: 'treasure', desc: '冰层里封着陪葬品' },
  ],
  encounters: [
    { id: 'enc-wights', name: '墓卫列队', kind: 'wave', enemyGroupIds: ['wights'] },
    { id: 'enc-frostwolves', name: '霜狼游猎', kind: 'wave', enemyGroupIds: ['frostwolves'] },
    { id: 'enc-gravekeepers', name: '掘墓工棚', kind: 'wave', enemyGroupIds: ['gravekeepers'] },
    { id: 'enc-velhola', name: '霜裔织法者·薇尔霍拉', kind: 'boss', enemyGroupIds: [], bossId: 'velhola' },
    { id: 'enc-frostmix', name: '墓卫鸦士混编', kind: 'wave', enemyGroupIds: ['wights-frail', 'gravekeepers'] },
    { id: 'enc-icetomb', name: '冰棺回廊', kind: 'wave', enemyGroupIds: ['gravekeepers'] },
  ],
}

// 副本 #5(2026-09 扩量):渊底祭坛——深渊教团的地底圣所,血契让伤口在祷词中愈合
// 主题机制「治疗链」:主教的血契共感为全家回血,不打断就永远打不完——
// 「杀治疗/打断咏唱」这一课的毕业考,双咏唱线(治疗+圣歌)同时考验集火优先级
export const ABYSSALTAR: DungeonDef = {
  id: 'abyssaltar',
  name: '渊底祭坛',
  enemyPower: 1.05,
  expectedLevel: 7,
  size: 3,
  branches: [
    {
      id: 'altarstairs',
      name: '献祭阶梯',
      risk: 3,
      reward: 3,
      desc: '沿血槽石阶直下圣所：教徒阻路，但祭坛上的供品浸着古金',
    },
    {
      id: 'darkriver',
      name: '暗河渡道',
      risk: 1,
      reward: 1,
      desc: '从暗河泅渡潜入：路湿难行，但祷声盖不过水声',
    },
  ],
  enemyGroups: {
    cultists: [
      { id: 'cultist-a', traits: ['death-blast', 'last-stand'], name: '血祭教徒', maxHp: 520, attack: 11, defense: 6, speed: 6, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'cultist-b', traits: ['death-blast', 'last-stand'], name: '血祭教徒', maxHp: 520, attack: 11, defense: 6, speed: 6, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'cantor',
      traits: ['volley'], name: '渊语咏叹者', maxHp: 380, attack: 13, defense: 2, speed: 9, position: 'back', range: 'ranged', archetype: 'striker' },
    ],
    ghouls: [
      { id: 'ghoul-a',
      traits: ['regen', 'last-stand'], name: '食尸鬼', maxHp: 500, attack: 15, defense: 3, speed: 13, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'ghoul-b',
      traits: ['regen', 'last-stand'], name: '食尸鬼', maxHp: 500, attack: 15, defense: 3, speed: 13, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'ghoul-c',
      traits: ['regen'], name: '食尸鬼', maxHp: 460, attack: 14, defense: 3, speed: 13, position: 'front', range: 'melee', archetype: 'bruiser' },
    ],
    eyes: [
      { id: 'eye-a',
      traits: ['volley'], name: '观渊之眼', maxHp: 360, attack: 13, defense: 2, speed: 10, position: 'back', range: 'ranged', archetype: 'striker' },
      { id: 'eye-b',
      traits: ['volley'], name: '观渊之眼', maxHp: 360, attack: 13, defense: 2, speed: 10, position: 'back', range: 'ranged', archetype: 'striker' },
      { id: 'eye-c',
      traits: ['volley'], name: '观渊之眼', maxHp: 320, attack: 12, defense: 2, speed: 10, position: 'back', range: 'ranged', archetype: 'striker' },
    ],
    'ghouls-frail': [
      { id: 'ghoul-add-a',
      traits: ['regen'], name: '食尸鬼', maxHp: 320, attack: 10, defense: 2, speed: 12, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'ghoul-add-b',
      traits: ['regen'], name: '食尸鬼', maxHp: 320, attack: 10, defense: 2, speed: 12, position: 'front', range: 'melee', archetype: 'bruiser' },
    ],
  },
  bosses: {
    malsau: {
      id: 'malsau',
      name: '深渊主教·马尔萨乌斯',
      // 治疗链毕业考:血契共感(打断!否则全家回血)+ 渊语圣歌(第二条咏唱线,打断优先级抉择)
      // + 唤起饿殍(转火)+ 深渊降临(软墙)——打断 110 门槛与塔尔玛同线,窗口 3s
      // ⑲ 校准:首版 1/8(无打断机器人扛不住双咏唱线)→ 血 2700/共感 160/圣歌减压到 8
      maxHp: 2700,
      attack: 16,
      defense: 7,
      speed: 8,
      position: 'back',
      range: 'ranged',
      mechanics: [
        {
          id: 'malsau-communion',
          kind: 'cast-heal',
          name: '血契共感',
          params: { castTicks: 30, healAmount: 160, everyTicks: 260, breakDamage: 110 },
        },
        {
          id: 'malsau-call',
          kind: 'summon',
          name: '唤起饿殍',
          params: { atHpPct: 0.65, count: 2, groupId: 'ghouls-frail' },
        },
        {
          id: 'malsau-hymn',
          kind: 'cast-buff',
          name: '渊语圣歌',
          params: { castTicks: 30, attackBuff: 8, durationTicks: 120, everyTicks: 280, breakDamage: 110 },
        },
        {
          id: 'malsau-descend',
          kind: 'enrage',
          name: '深渊降临',
          params: { atTick: 210, attackMult: 1.75 },
        },
      ],
      dropTable: [
        { baseId: 'wpn-t2-bow', chance: 0.3 },
        { baseId: 'trk-t2-totem', chance: 0.2 },
        { baseId: 'wpn-line-warlock', chance: 0.2 },
        { baseId: 'wpn-sign-bloodletter', chance: 0.3 },
      ],
    },
  },
  routeNodes: [
    { id: 'ab-cultists', name: '教徒环阵', kind: 'battle', encounterId: 'enc-cultists', desc: '血祭教徒的祷告环' },
    { id: 'ab-ghouls', name: '饿殍坑', kind: 'elite', encounterId: 'enc-ghouls', desc: '食尸鬼争食,掉落翻倍' },
    { id: 'ab-eyes', name: '观渊回廊', kind: 'battle', encounterId: 'enc-eyes', desc: '无数眼睛在黑暗里眨动' },
    { id: 'ab-stone', name: '暗河石台', kind: 'rest', desc: '暗河边干燥的石台' },
    { id: 'ab-abyssmix', name: '眼目咏叹混编', kind: 'battle', encounterId: 'enc-abyssmix', desc: '眼睛与祷声同行' },
    { id: 'ab-bloodfeast', name: '血宴残席', kind: 'battle', encounterId: 'enc-bloodfeast', desc: '宴席未散,饿殍未走' },
    { id: 'ab-relic', name: '沉供奉龛', kind: 'treasure', desc: '供奉沉在血池底,泛着金光' },
    { id: 'ab-whisper', name: '渊底低语', kind: 'event', desc: '低语许诺力量,代价未提' },
  ],
  encounters: [
    { id: 'enc-cultists', name: '血祭教徒环', kind: 'wave', enemyGroupIds: ['cultists'] },
    { id: 'enc-ghouls', name: '饿殍争食', kind: 'wave', enemyGroupIds: ['ghouls'] },
    { id: 'enc-eyes', name: '观渊之眼', kind: 'wave', enemyGroupIds: ['eyes'] },
    { id: 'enc-malsau', name: '深渊主教·马尔萨乌斯', kind: 'boss', enemyGroupIds: [], bossId: 'malsau' },
    { id: 'enc-abyssmix', name: '眼目咏叹混编', kind: 'wave', enemyGroupIds: ['eyes', 'cultists'] },
    { id: 'enc-bloodfeast', name: '血宴残席', kind: 'wave', enemyGroupIds: ['ghouls-frail', 'cultists'] },
  ],
}

// 副本 #6(2026-09 扩量,首个 5 人团本):荆棘要塞——割据佣兵团"荆棘团"的老巢
// 首个人类敌人阵营(此前六图皆为亡灵/野兽):刀盾卫/弩手/重斧手,两段 boss 考试。
// 5 人编制=更高 DPS 与双治疗,数值按 5/3 换算加压;⑲ 验收按 dungeon.size 出同编制机器人
export const THORNHOLD: DungeonDef = {
  id: 'thornhold',
  name: '荆棘要塞',
  enemyPower: 1.32,
  expectedLevel: 9,
  size: 5,
  branches: [
    {
      id: 'gateassault',
      name: '正门强攻',
      risk: 3,
      reward: 3,
      desc: '撞开正门直取内庭：佣兵团主力列阵以待，但团库就在门后',
    },
    {
      id: 'sewerin',
      name: '水道潜入',
      risk: 1,
      reward: 1,
      desc: '从排水暗渠摸进内庭：路臭且窄，但守军不设防',
    },
  ],
  enemyGroups: {
    swords: [
      { id: 'sword-a',
      traits: ['heavy-plate'], name: '荆棘刀盾卫', maxHp: 560, attack: 10, defense: 6, speed: 6, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'sword-b',
      traits: ['heavy-plate'], name: '荆棘刀盾卫', maxHp: 560, attack: 10, defense: 6, speed: 6, position: 'front', range: 'melee', archetype: 'shield' },
      { id: 'xbow-a',
      traits: ['volley'], name: '荆棘弩手', maxHp: 420, attack: 13, defense: 2, speed: 8, position: 'back', range: 'ranged', archetype: 'striker' },
      { id: 'xbow-b',
      traits: ['volley'], name: '荆棘弩手', maxHp: 420, attack: 13, defense: 2, speed: 8, position: 'back', range: 'ranged', archetype: 'striker' },
    ],
    heavies: [
      { id: 'heavy-a',
      traits: ['heavy-plate', 'last-stand'], name: '荆棘重斧手', maxHp: 640, attack: 14, defense: 4, speed: 11, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'heavy-b',
      traits: ['heavy-plate', 'last-stand'], name: '荆棘重斧手', maxHp: 640, attack: 14, defense: 4, speed: 11, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'heavy-c',
      traits: ['heavy-plate'], name: '荆棘重斧手', maxHp: 640, attack: 14, defense: 4, speed: 11, position: 'front', range: 'melee', archetype: 'bruiser' },
    ],
    'honor-frail': [
      { id: 'honor-add-a',
      traits: ['last-stand'], name: '荆棘亲卫', maxHp: 380, attack: 10, defense: 3, speed: 8, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'honor-add-b',
      traits: ['last-stand'], name: '荆棘亲卫', maxHp: 380, attack: 10, defense: 3, speed: 8, position: 'front', range: 'melee', archetype: 'bruiser' },
    ],
    'mercs-frail': [
      { id: 'merc-add-a',
      traits: ['last-stand'], name: '应征佣兵', maxHp: 340, attack: 10, defense: 2, speed: 9, position: 'front', range: 'melee', archetype: 'bruiser' },
      { id: 'merc-add-b',
      traits: ['last-stand'], name: '应征佣兵', maxHp: 340, attack: 10, defense: 2, speed: 9, position: 'front', range: 'melee', archetype: 'bruiser' },
    ],
  },
  bosses: {
    colt: {
      id: 'colt',
      name: '掌旗官·科尔特',
      // 门考试(5 人版掘锚):战鼓冲锋(分散)+ 亲卫旗召唤(转火)+ 战吼咏唱(打断)
      maxHp: 4200,
      attack: 15,
      defense: 7,
      speed: 7,
      position: 'front',
      range: 'melee',
      mechanics: [
        {
          id: 'colt-drum',
          kind: 'telegraph-aoe',
          name: '战鼓冲锋',
          params: { telegraphTicks: 36, damage: 30, everyTicks: 105 },
        },
        {
          id: 'colt-banner',
          kind: 'summon',
          name: '亲卫旗',
          params: { atHpPct: 0.65, count: 2, groupId: 'honor-frail' },
        },
        {
          id: 'colt-mire',
          kind: 'ground-zone',
          name: '血污旗阵',
          params: { castTicks: 30, durationTicks: 100, everyTicks: 340, breakDamage: 200 },
        },
        {
          id: 'colt-warcry',
          kind: 'cast-buff',
          name: '破胆战吼',
          params: { castTicks: 30, attackBuff: 9, durationTicks: 120, everyTicks: 260, breakDamage: 110 },
        },
      ],
      dropTable: [
        { baseId: 'arm-t2-plate', chance: 0.4 },
        { baseId: 'wpn-t2-bow', chance: 0.25 },
        { baseId: 'arm-sign-thornmail', chance: 0.35 },
      ],
    },
    victor: {
      id: 'victor',
      name: '割据团长·维克托',
      // 团本毕业考:四线全开——长枪风暴(分散)/断头锁链(束缚赌撤退)/征募令(转火)/困兽(软墙)
      // ⑲ 校准:5 人双游侠 DPS 高,4800 血 29.0s 越下带 → 5300
      maxHp: 5300,
      attack: 17,
      defense: 8,
      speed: 8,
      position: 'front',
      range: 'melee',
      mechanics: [
        {
          id: 'victor-lance',
          kind: 'telegraph-aoe',
          name: '长枪风暴',
          params: { telegraphTicks: 36, damage: 34, everyTicks: 105 },
        },
        {
          id: 'victor-chain',
          kind: 'bind',
          name: '断头锁链',
          params: { atHpPct: 0.55, bindTicks: 24, damage: 22 },
        },
        {
          id: 'victor-levy',
          kind: 'summon',
          name: '征募令',
          params: { atHpPct: 0.5, count: 2, groupId: 'mercs-frail' },
        },
        {
          id: 'victor-stand',
          kind: 'enrage',
          name: '困兽之斗',
          params: { atTick: 220, attackMult: 1.75 },
        },
      ],
      dropTable: [
        { baseId: 'wpn-t2-bow', chance: 0.45 },
        { baseId: 'trk-t2-totem', chance: 0.3 },
        { baseId: 'wpn-sign-warbrand', chance: 0.35 },
      ],
    },
  },
  routeNodes: [
    { id: 'th-swords', name: '正门刀盾阵', kind: 'battle', encounterId: 'enc-swords', desc: '刀盾与弩手的正面阵' },
    { id: 'th-heavies', name: '重斧亲卫', kind: 'elite', encounterId: 'enc-heavies', desc: '重斧手成队,掉落翻倍' },
    { id: 'th-yard', name: '校场', kind: 'rest', desc: '空置的校场,正好整队' },
    { id: 'th-siege', name: '攻城混编', kind: 'battle', encounterId: 'enc-siege', desc: '围攻的完整编制' },
    { id: 'th-vanguard2', name: '前卫余部', kind: 'battle', encounterId: 'enc-vanguard2', desc: '败退的前卫重整再战' },
    { id: 'th-armory', name: '团库武械房', kind: 'treasure', desc: '荆棘团的团库就在门后' },
    { id: 'th-deserter', name: '逃兵求见', kind: 'event', desc: '一名荆棘逃兵想谈条件' },
  ],
  encounters: [
    { id: 'enc-swords', name: '正门刀盾阵', kind: 'wave', enemyGroupIds: ['swords'] },
    { id: 'enc-heavies', name: '重斧亲卫', kind: 'wave', enemyGroupIds: ['heavies'] },
    { id: 'enc-colt', name: '掌旗官·科尔特', kind: 'boss', enemyGroupIds: [], bossId: 'colt' },
    { id: 'enc-victor', name: '割据团长·维克托', kind: 'boss', enemyGroupIds: [], bossId: 'victor' },
    { id: 'enc-siege', name: '攻城混编', kind: 'wave', enemyGroupIds: ['swords', 'heavies'] },
    { id: 'enc-vanguard2', name: '前卫余部', kind: 'wave', enemyGroupIds: ['honor-frail', 'mercs-frail'] },
  ],
}

/** 副本注册表(UI 选择/完整性校验用)——新副本在这里登记 */
export const DUNGEONS: DungeonDef[] = [BLACKMOSS, RUSTMINE, ASHFIELD, FROSTGRAVE, ABYSSALTAR, THORNHOLD]
