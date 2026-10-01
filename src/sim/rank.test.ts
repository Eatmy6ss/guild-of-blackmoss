import { describe, expect, test } from 'vitest'
import { guildRankOf, guildTierOf, rankPromotion } from './rank'

describe('A14 公会位阶轻量版', () => {
  test('派生:空首杀=铁牌;任一首杀=铜牌;通关版图一(荆棘要塞 victor)=银牌', () => {
    expect(guildTierOf([])).toBe('iron')
    expect(guildRankOf([]).promotion?.text).toContain('打赢第一头首领')
    expect(guildTierOf(['grush'])).toBe('bronze')
    expect(guildRankOf(['grush']).promotion?.text).toContain('荆棘要塞')
    expect(guildTierOf(['grush', 'victor'])).toBe('silver')
    const silver = guildRankOf(['victor'])
    expect(silver.name).toBe('银牌')
    expect(silver.promotion).toBeUndefined()
  })

  test('晋阶检测:铁→铜/铜→银给出编年史文本,平阶不触发', () => {
    expect(rankPromotion([], ['grush'])).toContain('铜牌')
    expect(rankPromotion(['grush'], ['grush', 'victor'])).toContain('银牌')
    expect(rankPromotion(['grush'], ['grush'])).toBeUndefined()
    expect(rankPromotion(['victor'], ['victor'])).toBeUndefined()
  })
})
