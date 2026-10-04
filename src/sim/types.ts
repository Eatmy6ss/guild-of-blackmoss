// ============================================================
// 核心数据 schema（架构铁律：所有内容皆数据表，引擎只解释数据）
// 上游设计：docs/M0-plan.md + 设计共识 v4
// ============================================================

// ===== 属性与天性（Q18：天性出生定死，洗点不改上限方向）=====
export type AttrKey = 'str' | 'agi' | 'int'
export interface Attributes {
  str: number
  agi: number
  int: number
  /** 体质:最大生命 */
  vit: number
  /** 精神:受疗加成 + 控制韧性 */
  spr: number
  /** 幸运:暴击 + 掉落品质 */
  lck: number
}

/** 天性：成长方向与上限，由出身背景生成，永不改变 */
export interface Nature {
  base: Attributes
  /** 每级升级的属性成长权重 */
  growth: Attributes
  caps: Attributes
}

// ===== 性格（M0 简化四轴；行为层可见不当值，Q19）=====
export interface Personality {
  /** 勇猛：开怪/搏险倾向 */
  bravery: number
  /** 谨慎：撤退/保守路线阈值 */
  caution: number
  /** 贪婪：拾取与分配偏向（D12 分配代打用） */
  greed: number
  /** 忠诚：会长忠诚边初值（声望系统 M1 实装） */
  loyalty: number
}

// ===== 职业（Q13：轻协同——协同用词条表达，非硬门槛）=====
export type JobId = 'guard' | 'priest' | 'ranger' | 'warrior' | 'mage' | 'warlock'
export type Role = 'tank' | 'healer' | 'dps'
export type Position = 'front' | 'back'
export type AttackRange = 'melee' | 'ranged'

export interface SkillDef {
  id: string
  name: string
  /** 效果由战斗引擎解释（D3-4;宪法 v3 角色篇扩容） */
  effect:
    | 'heavy-strike'
    | 'heal-lowest'
    | 'taunt'
    | 'group-heal'
    | 'shield-ally'
    | 'curse-mark'
    | 'summon-pet'
    | 'multishot'
    | 'frost-nova'
    | 'enchant-self'
    | 'charge-strike'
    | 'trap-bind'
    | 'armor-break'
    | 'combo-strike'
    | 'reposition'
    | 'channel-heal'
  target: 'enemy' | 'ally'
  cooldownTicks: number
}

/** 专精(宪法 v3 角色篇):同职业的三种打法,招募即带;undefined 引用 = defaultSpec(经典线,平衡假设保留) */
export interface SpecDef {
  id: string
  name: string
  /** 身份句(BG3):招募卡展示"你为什么是这个子类" */
  identity: string
  /** 数值修正:相对职业 base 的加算偏移 */
  statMods?: { maxHp?: number; attack?: number; defense?: number; speed?: number; critChance?: number }
  skills: SkillDef[]
  /** 精进技能池(宪法 v3 精进层):Lv6 训练场二选一,选中的追加进技能组 */
  advancedSkills?: SkillDef[]
  /** 职业被动:反伤(荆棘/裂阵)/增益光环(咏叹) */
  passive?: 'counter' | 'aura-attack'
}

export interface JobDef {
  /** 经典专精(=宪法 v3 前的数值与技能,老存档/门禁的平衡假设) */
  defaultSpec: string
  specs: Record<string, SpecDef>
  id: JobId
  name: string
  role: Role
  /** 主属性：该职业攻击力随哪个属性成长 */
  attackAttr: AttrKey
  /** 站位：前排承伤，后排输出/治疗（D3-4 实装） */
  position: Position
  /** 射程：近战只能打前排存活者，远程任意 */
  range: AttackRange
  base: {
    maxHp: number
    attack: number
    defense: number
    /** 每 60 tick 攻击速度基准 */
    speed: number
    critChance: number
  }
  growth: { maxHp: number; attack: number; defense: number }
  /** 轻协同词条 id(#1.4 已清空;容器留给批次 4 后羁绊系统) */
  synergy?: string[]
}

// ===== 装备与词缀（Q17：掉什么固定，什么词条随机）=====
export type Slot = 'weapon' | 'armor' | 'trinket'

export type StatKey =
  | 'attack'
  | 'maxHp'
  | 'defense'
  | 'speed'
  | 'critChance'
  | 'lifesteal'
  | 'healReceived'
  /** 火抗(0-1):灼热地形与环境火伤按此减免(版图二·龙脊山脉) */
  | 'fireResist'

export interface AffixDef {
  id: string
  name: string
  stat: StatKey
  /** roll 区间 [min, max]，按装备 tier 缩放 */
  range: [number, number]
}

export interface ItemBaseDef {
  id: string
  name: string
  slot: Slot
  tier: number
  /** 基础属性 */
  stat: StatKey
  value: number
  /** 词条条数区间 [min, max] */
  affixCount: [number, number]
  /** 装备 2.0 传承威能(DESIGN 13.3) */
  legacy?: string
  /** K08 套装系:gray-crown(灰冠)/wind-hunt(猎风) */
  setName?: string
}

/** 一次具体的掉落实例：baseId 固定来源，词条掉落时 roll（Q22） */
export type ItemQuality = 'white' | 'green' | 'purple'

export interface ItemInstance {
  id: string
  baseId: string
  /** 品级(宪法 v3.3 装备三轴):白/绿/紫——绿精良,紫史诗 */
  quality?: ItemQuality
  rolls: { affixId: string; value: number }[]
}

// ===== 成员（公会的人，战斗外的持久实体）=====
export interface Member {
  id: string
  name: string
  job: JobId
  /** 专精 id(宪法 v3);undefined = 职业 defaultSpec(经典线) */
  spec?: string
  /** 种族(宪法 v3 六族);undefined = 人类(老存档) */
  race?: string
  /** 精进记录:specId → 选中的精进技能 id(切回该专精即恢复) */
  specAdvanced?: Record<string, string>
  /** K06 个人心愿层(U14):可选;老档无此字段 = 暂无心愿 */
  wish?: import('./wish').Wish
  /** K09 人物特性·非战斗向(U16):drinker 爱喝酒/lucky 幸运儿/cool 冷静;可选=朴素 */
  trait?: string
  /** S1 创伤(DESIGN 14):持久属性减益;可选=无创伤 */
  scars?: import('./scars').Scar[]
  /** 通用战技(DD Augment):学过的被动,跨专精携带 */
  augments?: string[]
  level: number
  nature: Nature
  personality: Personality
  attrs: Attributes
  hp: number
  equipment: Partial<Record<Slot, ItemInstance>>
  alive: boolean
  /** M1 P0:经验与升到下一级所需——成长路线的数值半边 */
  exp: number
  /** M1 P0:与其他英雄的默契(共同远征次数),羁绊半边;死者 bonds 随之消逝 */
  bonds: Record<string, number>
  /** M1 P2 灵魂层:士气(0-100,低士气拒绝出击);grudges=被遗弃的信任裂痕(负关系偏移) */
  morale?: number
  grudges?: number
}

// ===== 战斗实体（战斗内的临时投影，战斗结束即弃）=====
export type Team = 'guild' | 'enemy'

export interface Combatant {
  id: string
  name: string
  team: Team
  maxHp: number
  hp: number
  attack: number
  defense: number
  critChance: number
  /** 攻击间隔（tick） */
  attackInterval: number
  cooldownLeft: number
  alive: boolean
  memberId?: string
  /** 技能独立冷却 */
  skills: { def: SkillDef; cooldownLeft: number }[]
  /** 装备 2.0 传承威能(DESIGN 13.3):行为类威能标记 */
  legacyFocus?: boolean
  legacyKillheal?: boolean
  legacyBulwark?: boolean
  legacyElitewarden?: boolean
  legacyEmberward?: boolean
  /** K08 套装件数:灰冠(T3)/猎风(T2 猎装) */
  setCrown?: number
  setHunt?: number
  /** #0.2:原始敌人定义(summon 缩放校验用) */
  enemyDef?: import('./types').EnemyDef
  /** #0.2:召唤增援继承的缩放因子(summon 机制消费) */
  scaleFactors?: import('./difficulty').EnemyScaleFactors
  /** 被嘲讽剩余 tick（威胁系统 D3-4 扩展） */
  tauntedTicks: number
  taunterId?: string
  // ---- D3-4 深化 ----
  position: Position
  range: AttackRange
  /** 仅我方有职业角色（敌我判别辅助协同判定） */
  role?: Role
  synergyIds: string[]
  /** 威胁表：对每个我方成员积累的仇恨值（敌方实体持有） */
  threat: Record<string, number>
  /** 当前遭遇中的精英实体，供威能和掉落判定使用 */
  elite?: boolean
  /** boss 实体标记（演出层放大体型） */
  boss?: boolean
  /** 本场实际受到的 Boss 恐惧/灼烧/束缚/拉拽次数，结算创伤用 */
  scarMechanicHits?: number
  // ---- D8-9 指挥台与机制 ----
  /** 被束缚：到该 tick 前无法行动、无法撤离 */
  boundUntilTick?: number
  /** boss 机制定义（仅 boss 实体携带） */
  /** Mechanism list for ordinary enemies as well as bosses; runtime is keyed by unique kind. */
  bossMechanics?: BossMechanicDef[]
  /** 召唤机制的增援池（从副本 enemyGroups 解析） */
  summonPool?: EnemyDef[]
  /** 机制运行时状态：按机制 kind 存 until/next/taken/fired;brokenBy=A3 招牌技打断出处 */
  mech?: Record<string, { until?: number; next?: number; taken?: number; fired?: number; resolvedAt?: number; brokenBy?: string }>
  /** 咏唱成功获得的临时攻击加成 */
  buffAttack?: number
  buffUntil?: number
  /** 吸血比例（装备词条聚合） */
  lifesteal?: number
  /** 被减速：到该 tick 前攻击间隔 ×slowMult（霜寒系机制） */
  slowUntilTick?: number
  /** 吸收盾(戒律/圣盾使):伤害先扣盾 */
  absorbShield?: number
  /** 诅咒易伤(痛苦/咒印):到 tick 前受伤 ×vulnMult */
  vulnUntilTick?: number
  vulnMult?: number
  /** 反伤被动(荆棘/裂阵):近战命中者反弹 fraction */
  counterMult?: number
  /** 光环(咏叹):存活时全队伤害 ×auraMult,每 tick 由 stepBattle 刷新 */
  auraMult?: number
  /** 召唤物归属(兽王狼/恶魔小鬼/契灵):无 memberId,阵亡不进纪念堂 */
  petOf?: string
  /** 受疗加成(忠诚性格/血精灵/受疗词条):治疗量 ×(1+healReceived) */
  healReceived?: number
  /** 火抗(0-0.75,装备聚合):灼热地形与环境火伤减免(版图二) */
  fireResist?: number
  /** 灼息(版图二 ember-breath 特质):被点燃,期间持续掉血 */
  burnUntilTick?: number
  burnFrom?: string
  /** A3 荆棘咆哮:反甲——受击时将部分伤害奉还攻击者 */
  thornsUntilTick?: number
  /** A5 #1.3 灼烧层数(火法叠层→引爆的资源,挂在目标身上;每次刷新灼烧 +1) */
  burnStacks?: number
  /** 龙威(版图二 dragon-fear 特质/龙威光环):被压制,出伤 ×0.85 */
  fearUntilTick?: number
  /** 被拉拽(敌人侧机制):到 tick 前站位被强制为前排 */
  pulledUntilTick?: number
  originalPosition?: Position
  /** 处于地面效果区(敌人侧机制):到 tick 前每 10 tick 受持续伤害 */
  zonedUntilTick?: number
  /** 相位无敌(敌人侧机制):到 tick 前免疫一切伤害 */
  invulnUntilTick?: number
  /** 连击资源(宪法 v3.2 回归池):连击层数,combo-strike 消耗 */
  combo?: number
  /** 精神(六维投影):控制韧性计算用 */
  spr?: number
  /** 被动特质(小怪三层):引擎特质库解释 */
  traits?: string[]
  /** 攻击计数(volley:每第 3 击必暴) */
  atkCount?: number
  /** 再生累积(regen) */
  regenAcc?: number
  /** 重甲:首次受击已消耗 */
  plateUsed?: boolean
  /** 我方引导咏唱:到 tick 前引导,被打断阈值见 channelBreak */
  channelUntilTick?: number
  channelTaken?: number
  channelBreak?: number
  channelAmount?: number
  specId?: string
  /** 性格（仅我方，挂机 AI 代打用） */
  personality?: Personality
}

// ===== 副本（Q22：3/5/10 人本 + 固定掉落表 + 机制）=====
export interface EnemyDef {
  /** Runtime-only scaled definition (e.g. tower floor); prevents a second scaling pass. */
  difficultyScaled?: true
  id: string
  name: string
  maxHp: number
  attack: number
  defense: number
  speed: number
  position: Position
  range: AttackRange
  /**
   * 小怪原型（节奏改版:小怪差异化)——决定数值线的"职业":
   * 'shield'  盾卫:高血高防低攻慢速,前排磨血   'striker' 弩手/施法者:后排高攻低血
   * 'bruiser' 狂战:高速高攻中血,冲脸威胁       缺省 = 普通杂兵(均衡线)
   */
  archetype?: 'shield' | 'striker' | 'bruiser'
  /** 被动特质(宪法 v3.4 小怪三层):杂兵 1 条,精锐 2 条——引擎特质库解释 */
  traits?: string[]
  /** 主动技能(三层融合·行动层):复用 SkillDef,敌方同样走 useSkill */
  skills?: SkillDef[]
  /** Optional telegraphed mechanics; these do not make a regular enemy a boss. */
  mechanics?: BossMechanicDef[]
}

export type MechanicKind =
  | 'telegraph-aoe'
  | 'cast-buff'
  | 'cast-heal'
  | 'slow-touch'
  | 'pull'
  | 'ground-zone'
  | 'phase-invuln'
  | 'summon'
  | 'bind'
  | 'enrage'
  /** 蓄力吐息(版图二):telegraph 后重击前排——分散无效,坦克减伤是答案 */
  | 'breath-charge'
  /** 龙威光环(版图二):咏唱完成则全队出伤 ×0.85 数轮,可打断 */
  | 'fear-aura'

export interface BossMechanicDef {
  id: string
  kind: MechanicKind
  name: string
  /** 参数由机制引擎（mechanics.ts）解释；groupId 等为字符串 */
  params: Record<string, number | string>
}

export interface BossDef extends EnemyDef {
  mechanics: BossMechanicDef[]
  /** 固定掉落表：这个 boss 掉什么是定的（Q22） */
  dropTable: { baseId: string; chance: number }[]
}

/** 副本地形配置(U27①/redesign R1.1):声明该副本有哪些地形、每种地形的权重/风味名/可出遭遇 */
export interface DungeonTerrainDef {
  weight: number
  names: string[]
  /** 该地形上 battle/elite 节点可抽的遭遇 id(必须是 encounters 里存在的 wave);空=纯非战斗地形 */
  encounters: string[]
}

export interface EncounterDef {
  id: string
  name: string
  kind: 'wave' | 'boss'
  enemyGroupIds: string[]
  bossId?: string
  /** U28(制作人 2026-10-04,怪物猎人式变体):本遭遇是 bossVariantOf 指向的原型遭遇的「地图 Boss 链变体」——
   *  链上用变体替换原型;bossId 不变(首杀/手册/委托/位阶键零迁移);原 encounters 保留供门禁直连单场。 */
  bossVariantOf?: string
  /** 变体参数:开局狂暴(克隆原型机制,把 enrage 改为 atTick=0)+ 新增机制(kind 不得与原型重叠) */
  variant?: { name?: string; startEnrage?: number; addMechanics?: BossMechanicDef[] }
}

export interface DungeonDef {
  id: string
  name: string
  size: 3 | 5 | 10
  enemyGroups: Record<string, EnemyDef[]>
  bosses: Record<string, BossDef>
  encounters: EncounterDef[]
  /** 地形表(U27①):地图生成器的原料;旧 branches/routeNodes/routeRelations 已删除(R1.1) */
  terrains: Partial<Record<import('./dungeon-map').TerrainId, DungeonTerrainDef>>
  /** #0.8 难度模型:全游戏唯一允许手调的难度旋钮(等效强度总量,替换旧 enemyPower) */
  rating: number
  /** V1 二轮收紧:只对登记副本的敌人叠加威胁,不影响高塔/临时战斗 */
  /** #0.8:已废弃(被 rating 取代);保留字段说明见 IMPLEMENTATION-PLAN #0.8 */
  /** 副本预期等级(节奏系数+等级压制的锚;未注册=高塔等临时内容不吃补正) */
  expectedLevel?: number
  /** 副本环境(版图二):heat=灼热地形,战斗中周期性全队火伤(可被火抗减免) */
  env?: 'heat'
}

// ===== 战斗状态 =====
export type LogKind = 'guild' | 'enemy' | 'system' | 'result'

export interface BattleLogEntry {
  tick: number
  kind: LogKind
  text: string
}

export type BattleStatus = 'running' | 'guild-win' | 'guild-wipe' | 'retreated'

// ===== 团长指挥台（Q27：手动模式指令面）=====
export type Stance = 'advance' | 'standard' | 'tighten' | 'spread'

export interface BattleCommands {
  stance: Stance
  /** 集火目标：全队优先攻击（配合集火加成可打断咏唱） */
  focusId?: string
  healStock: number
  furyStock: number
  healCd: number
  furyCd: number
  /** 爆发药增益持续到该 tick */
  furyUntil: number
  /** 撤离过程：到该 tick 完成撤离（Q32：免费下令+可被干扰的撤离过程） */
  extractingUntil?: number
  /** A3/B7 招牌技指令:每名队员一格(手动与挂机都可入队;下一次 stepBattle 按队员顺序消费并清空) */
  signatures?: Record<string, { memberId: string; skillId: string; targetId?: string }>
  /** 撤退保护（Q7，默认开启）：有人濒危自动下撤退令 */
  protectRetreat: boolean
  /** 挂机模式（D12）：队长性格代打全部指令 */
  autoMode: boolean
}

/** 结构化死因(U22 对齐,实施计划 #0.10 补充):碑文/说书由它渲染,不反向拼字符串;affixes 批次 3 填充 */
export interface DeathCause {
  kind: 'battle' | 'mechanic' | 'event' | 'scar' | 'other'
  killerName?: string
  mechanic?: MechanicKind
  /** 预留:死于带哪些怪物词缀的敌人(批次 3 填) */
  affixes?: string[]
  where: { source: 'dungeon' | 'tower'; id: string; floor?: number }
}

/** 纪念堂 entries（D11）：阵亡英雄的永久记录 */
export interface DeadHero {
  id: string
  name: string
  job: JobId
  level: number
  /** 渲染后的碑文(由 renderDeathCause 从 death 生成;纪念堂展示与 smoke 7a 兼容) */
  cause: string
  /** 结构化死因(U22):编年史/说书层的消费源;老档无此字段 */
  death?: DeathCause
  /** K02 纪念品质(U11):生平成就生成的品质记录;老档无此字段 = 凡逝 */
  legacy?: import('./memorial').LegacyRecord
}

/** 结构化战斗事件：演出层（Pixi）消费这个，不解析文本日志 */
export type BattleEventType =
  | 'damage'
  | 'heal'
  | 'death'
  | 'telegraph'
  | 'casting'
  | 'interrupted'
  | 'bound'
  | 'enraged'
  | 'summoned'
  | 'fury'
  | 'slam'
  | 'slowed'
  | 'shielded'
  | 'cursed'
  | 'counter'
  | 'pulled'
  | 'zoned'
  | 'phase'
  | 'armorbreak'
  | 'reposition'

export interface BattleEvent {
  tick: number
  type: BattleEventType
  attackerId?: string
  targetId: string
  amount?: number
  crit?: boolean
  ranged?: boolean
  /** slam 专用:分散阵型是否减了伤(指挥有感的 payoff 事件,演出层据此分叉表现) */
  mitigated?: boolean
}

export interface BattleState {
  /** 本场单位编号进度；刷新后的召唤继续使用本场序列。 */
  unitSeq?: number
  /** A3 招牌技冷却:memberId → 就绪 tick */
  signatureCd?: Record<string, number>
  /** A13 后续:敌方对我方累计伤害台账(败因统计用;事件裁剪后 summary 仍准确) */
  guildDmgTaken?: Record<string, number>
  /** 战斗创建时固定，结算不使用已经推进的路线索引。 */
  encounterId?: string
  /** 创伤结算幂等标记；新战斗重新初始化 */
  scarsSettled?: boolean
  /** 首次遭遇提示:已提示过的特质(每场一次) */
  traitSeen?: Record<string, boolean>
  /** 灼热地形(版图二·heat 环境):everyTicks 周期全队火伤,火抗减免 */
  envHeat?: { everyTicks: number; damage: number; next: number }
  tick: number
  combatants: Combatant[]
  log: BattleLogEntry[]
  status: BattleStatus
  /** 确定性 RNG 状态：同种子同结果（未来爬塔种子的地基） */
  rngState: number
  events: BattleEvent[]
  /** 团长指令状态（指挥台实时读写） */
  commands: BattleCommands
  /** 纪念堂光环：全队伤害加成（每阵亡英雄 +2%，D11） */
  auraBonus?: number
  /** 战术手册：已研习该 boss，全队对其伤害 +5%（D11） */
  manualBonus?: number
  /** 默契加成：按我方战斗实体 id 存伤害倍率（同队默契星数 ×3%/星，M1 P0） */
  bondMults?: Record<string, number>
}
