import { DUNGEON_FINAL_BOSS } from '../data/regions'

// A14 公会位阶·轻量版(ROADMAP §9.2):位阶是公会的属性,人换一批又一批,名号还在。
// 前 3 阶全部由现有数据派生(不新增存档字段):铜牌=任一 Boss 首杀,银牌=通关版图一(荆棘要塞)。
// 黄金/传说(裂隙深度/终局讨伐)在 G2 之后的完整版 grill 里定。

export type GuildTier = 'iron' | 'bronze' | 'silver'
const TIER_ORDER: GuildTier[] = ['iron', 'bronze', 'silver']
export const TIER_NAME: Record<GuildTier, string> = { iron: '铁牌', bronze: '铜牌', silver: '银牌' }

/** 版图一毕业考 = 银牌门槛(与既有版图解锁链同源,零新内容) */
const REGION_ONE_FINALE = DUNGEON_FINAL_BOSS.thornhold

export function guildTierOf(manual: readonly string[]): GuildTier {
  if (manual.includes(REGION_ONE_FINALE)) return 'silver'
  if (manual.length > 0) return 'bronze'
  return 'iron'
}

export interface GuildRank {
  tier: GuildTier
  name: string
  /** 晋升委托(下一阶);轻量版顶阶为 undefined(完整版 G2 后开启) */
  promotion?: { text: string; done: boolean }
}

export function guildRankOf(manual: readonly string[]): GuildRank {
  const tier = guildTierOf(manual)
  const next = TIER_ORDER[TIER_ORDER.indexOf(tier) + 1]
  const promotion = next === 'bronze'
    ? { text: '打赢第一头首领(任一副本 Boss 首杀)', done: manual.length > 0 }
    : next === 'silver'
      ? { text: '通关荆棘要塞(版图一毕业考)', done: manual.includes(REGION_ONE_FINALE) }
      : undefined
  return { tier, name: TIER_NAME[tier], promotion }
}

const PROMOTION_FLAVOR: Record<Exclude<GuildTier, 'iron'>, string> = {
  bronze: '第一头首领的旗被砍了下来,酒馆的告示板挂出了铜牌。',
  silver: '荆棘要塞易主——版图二的荒野向公会敞开,银牌挂上了大门。',
}

/** 晋阶检测(结算用):升阶返回编年史文本,平阶/降阶(不可能)返回 undefined */
export function rankPromotion(before: readonly string[], after: readonly string[]): string | undefined {
  const b = TIER_ORDER.indexOf(guildTierOf(before))
  const a = TIER_ORDER.indexOf(guildTierOf(after))
  if (a <= b) return undefined
  const tier = TIER_ORDER[a] as Exclude<GuildTier, 'iron'>
  return '公会位阶晋升:' + TIER_NAME[tier] + '。' + PROMOTION_FLAVOR[tier]
}
