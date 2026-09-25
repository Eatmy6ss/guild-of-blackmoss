import type { ItemInstance, Member } from './types'
import { powerScore } from './combat'
import { DUNGEONS } from '../data/dungeons'

// 公会目标链(M1 P0 成长可视化二阶段;K07 渐进改造 2026-09-25,U15):
// 原则:目标必须可从现有状态计算,不引入新存档字段。
// K07 重排:教学序列在前(打赢第一仗→首杀入门 boss→穿上 T2→平均 Lv6→满编→图1 毕业→塔/王国),
// 长线(其余 boss 首杀)沉底——开局直面全功能坞+一排远期首杀的引导问题就地解决。

export interface GuildGoal {
  id: string
  text: string
  done: boolean
  /** 进度提示(可选,如 3/6) */
  progress?: string
}

export interface GuildSnapshot {
  members: Member[]
  inventory: ItemInstance[]
  manual: string[]
  expedition: Member[]
  /** 黑苔高塔最高纪录层数(无塔进度则 0) */
  towerBest?: number
  /** 熟练度总和(K07):>0 = 至少打赢过一场(胜场才涨熟练度) */
  masteryTotal?: number
  /** 王国委托已结案数(K07) */
  kingdomDone?: number
}

export function guildGoals(s: GuildSnapshot): GuildGoal[] {
  const alive = s.members.filter((m) => m.alive)
  const masteryTotal = s.masteryTotal ?? 0
  const kingdomDone = s.kingdomDone ?? 0
  const t2Count =
    s.inventory.filter((i) => i.baseId.includes('-t2-')).length +
    alive.filter((m) => Object.values(m.equipment).some((e) => e?.baseId.includes('-t2-'))).length
  const expeditionPower = s.expedition.reduce((sum, m) => sum + powerScore(m), 0)
  const expeditionAvgLv =
    s.expedition.length > 0
      ? s.expedition.reduce((sum, m) => sum + m.level, 0) / s.expedition.length
      : 5
  const wearingT2 = alive.some((m) => Object.values(m.equipment).some((e) => e?.baseId.includes('-t2-')))

  // boss 首杀按注册表顺序:图1 双 boss(格鲁什=入门考/塔尔玛=毕业考)在教学段,
  // 其余 boss 长线沉底(K07:开局不再直面一整排远期首杀)
  const bossGoals: GuildGoal[] = DUNGEONS.flatMap((d) =>
    Object.values(d.bosses).map((b) => ({
      id: `kill-${b.id}`,
      text: `首杀${b.name}(${d.name})`,
      done: s.manual.includes(b.id),
    })),
  )
  const firstBoss = bossGoals[0]!
  const secondBoss = bossGoals[1]!
  const restBosses = bossGoals.slice(2)

  return [
    // —— 教学序列(K07 渐进引导)——
    {
      id: 'first-blood',
      text: '打赢第一场仗(战斗中点击敌人 = 集火)',
      done: masteryTotal > 0,
    },
    firstBoss,
    {
      id: 'wear-t2',
      text: '穿上第一件 T2 装备(仓库/战利品,点击装备即换)',
      done: wearingT2,
    },
    {
      id: 'exp-lv6',
      text: '远征队平均等级达到 6',
      done: expeditionAvgLv >= 6,
      progress: `当前 ${expeditionAvgLv.toFixed(1)}`,
    },
    {
      id: 'roster-6',
      text: '公会满编(招募 6 人)',
      done: alive.length >= 6,
      progress: `${alive.length}/6`,
    },
    secondBoss,
    {
      id: 'tower-3',
      text: '高塔打到第 3 层(每 3 层守塔 boss 必掉装备)',
      done: (s.towerBest ?? 0) >= 3,
      progress: s.towerBest ? `最高 ${s.towerBest} 层` : undefined,
    },
    {
      id: 'kingdom-first',
      text: '完成第一份王国委托(大厅按 Q)',
      done: kingdomDone > 0,
      progress: kingdomDone > 0 ? `${kingdomDone} 份` : undefined,
    },
    {
      id: 'gear-t2-3',
      text: '收集 3 件 T2 品质装备',
      done: t2Count >= 3,
      progress: `${t2Count}/3`,
    },
    {
      id: 'power-700',
      text: '远征队总战力达到 700',
      done: expeditionPower >= 700,
      progress: `当前 ${expeditionPower}`,
    },
    // —— 长线(其余 boss 首杀沉底)——
    ...restBosses,
  ]
}
