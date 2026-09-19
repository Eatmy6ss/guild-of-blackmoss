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
export type JobId = 'guard' | 'priest' | 'ranger'
export type Role = 'tank' | 'healer' | 'dps'
export type Position = 'front' | 'back'
export type AttackRange = 'melee' | 'ranged'

export interface SkillDef {
  id: string
  name: string
  /** 效果由战斗引擎解释（D3-4） */
  effect: 'heavy-strike' | 'heal-lowest' | 'taunt'
  target: 'enemy' | 'ally'
  cooldownTicks: number
}

export interface JobDef {
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
  skills: SkillDef[]
  /** 轻协同词条 id，效果表见 data/jobs.ts SYNERGY */
  synergy: string[]
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
}

/** 一次具体的掉落实例：baseId 固定来源，词条掉落时 roll（Q22） */
export interface ItemInstance {
  id: string
  baseId: string
  rolls: { affixId: string; value: number }[]
}

// ===== 成员（公会的人，战斗外的持久实体）=====
export interface Member {
  id: string
  name: string
  job: JobId
  level: number
  nature: Nature
  personality: Personality
  attrs: Attributes
  hp: number
  equipment: Partial<Record<Slot, ItemInstance>>
  alive: boolean
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
  /** boss 实体标记（演出层放大体型） */
  boss?: boolean
  // ---- D8-9 指挥台与机制 ----
  /** 被束缚：到该 tick 前无法行动、无法撤离 */
  boundUntilTick?: number
  /** boss 机制定义（仅 boss 实体携带） */
  bossMechanics?: BossMechanicDef[]
  /** 召唤机制的增援池（从副本 enemyGroups 解析） */
  summonPool?: EnemyDef[]
  /** 机制运行时状态：按机制 kind 存 until/next/taken/fired */
  mech?: Record<string, { until?: number; next?: number; taken?: number; fired?: number }>
  /** 咏唱成功获得的临时攻击加成 */
  buffAttack?: number
  buffUntil?: number
  /** 吸血比例（装备词条聚合） */
  lifesteal?: number
  /** 性格（仅我方，挂机 AI 代打用） */
  personality?: Personality
}

// ===== 副本（Q22：3/5/10 人本 + 固定掉落表 + 机制）=====
export interface EnemyDef {
  id: string
  name: string
  maxHp: number
  attack: number
  defense: number
  speed: number
  position: Position
  range: AttackRange
}

export type MechanicKind =
  | 'telegraph-aoe'
  | 'cast-buff'
  | 'summon'
  | 'bind'
  | 'enrage'

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

export interface BranchDef {
  id: string
  name: string
  /** 岔路取舍（Q26）：险而快 / 稳而慢 */
  risk: number
  reward: number
  desc: string
}

export interface EncounterDef {
  id: string
  name: string
  kind: 'wave' | 'boss'
  enemyGroupIds: string[]
  bossId?: string
}

export interface DungeonDef {
  id: string
  name: string
  size: 3 | 5 | 10
  branches: BranchDef[]
  enemyGroups: Record<string, EnemyDef[]>
  bosses: Record<string, BossDef>
  encounters: EncounterDef[]
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
  /** 撤退保护（Q7，默认开启）：有人濒危自动下撤退令 */
  protectRetreat: boolean
  /** 挂机模式（D12）：队长性格代打全部指令 */
  autoMode: boolean
}

/** 纪念堂 entries（D11）：阵亡英雄的永久记录 */
export interface DeadHero {
  id: string
  name: string
  job: JobId
  level: number
  cause: string
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

export interface BattleEvent {
  tick: number
  type: BattleEventType
  attackerId?: string
  targetId: string
  amount?: number
  crit?: boolean
  ranged?: boolean
}

export interface BattleState {
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
}
