import type { ItemInstance, Member } from './types'
import { powerScore } from './combat'

// 公会目标链(M1 P0 成长可视化二阶段):从公会状态推导,完成的打勾。
// 原则:目标必须可从现有状态计算,不引入新存档字段;按成长顺序排列,第一个未完成项 = 当前目标。

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
}

export function guildGoals(s: GuildSnapshot): GuildGoal[] {
  const alive = s.members.filter((m) => m.alive)
  const t2Count =
    s.inventory.filter((i) => i.baseId.includes('-t2-')).length +
    alive.filter((m) => Object.values(m.equipment).some((e) => e?.baseId.includes('-t2-'))).length
  const expeditionPower = s.expedition.reduce((sum, m) => sum + powerScore(m), 0)
  const expeditionAvgLv =
    s.expedition.length > 0
      ? s.expedition.reduce((sum, m) => sum + m.level, 0) / s.expedition.length
      : 5

  return [
    {
      id: 'kill-grush',
      text: '首杀沼泽食人魔·格鲁什',
      done: s.manual.includes('grush'),
    },
    {
      id: 'kill-talma',
      text: '击败深渊祭司·塔尔玛',
      done: s.manual.includes('talma'),
    },
    {
      id: 'power-700',
      text: '远征队总战力达到 700',
      done: expeditionPower >= 700,
      progress: `当前 ${expeditionPower}`,
    },
    {
      id: 'gear-t2-3',
      text: '收集 3 件 T2 品质装备',
      done: t2Count >= 3,
      progress: `${t2Count}/3`,
    },
    {
      id: 'exp-lv6',
      text: `远征队平均等级达到 6(当前 ${expeditionAvgLv.toFixed(1)})`,
      done: expeditionAvgLv >= 6,
    },
    {
      id: 'roster-6',
      text: '公会满编(招募 6 人)',
      done: alive.length >= 6,
      progress: `${alive.length}/6`,
    },
  ]
}
