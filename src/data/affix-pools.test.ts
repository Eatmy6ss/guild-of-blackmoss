import { describe, expect, it } from 'vitest'
import { AFFIXES } from '../data/affixes'
import { ITEM_BASES } from './items'
import { rollDrop } from '../sim/loot'
import { createRng } from '../sim/rng'

// #2.8 倾向池(E02):职业命名装备从 本池+通用池 抽词条;只影响掉落,不限制穿戴(禁硬锁)。

describe('#2.8 倾向池', () => {
  it('池标注合法且覆盖职业命名装备(基底注册表实读)', () => {
    const POOLS = ['common', 'tank', 'healer', 'dps', 'caster']
    let tagged = 0
    for (const [k, b] of Object.entries(ITEM_BASES)) {
      if (!b.pool) continue
      tagged++
      expect(POOLS, `${k} pool 非法`).toContain(b.pool)
    }
    expect(tagged).toBeGreaterThan(30) // 职业命名/重甲/布袍批量标注
  })

  it('dps 基底抽到的词条全部来自 dps∪common 池(统计 60 抽零越池)', () => {
    const allowed = new Set(Object.values(AFFIXES).filter((a) => a.pools.includes('dps') || a.pools.includes('common')).map((a) => a.id))
    for (let i = 0; i < 60; i++) {
      const item = rollDrop('wpn-t2-greatsword', createRng(500 + i))
      for (const r of item.rolls) expect(allowed.has(r.affixId), `越池词条 ${r.affixId}`).toBe(true)
    }
  })

  it('坦克基底不掉 dps 专属词条(统计 40 抽零越池);通用词条两池都可见', () => {
    const tankAllowed = new Set(Object.values(AFFIXES).filter((a) => a.pools.includes('tank') || a.pools.includes('common')).map((a) => a.id))
    let sawCommon = false
    for (let i = 0; i < 40; i++) {
      const item = rollDrop('arm-t2-plate', createRng(700 + i))
      for (const r of item.rolls) {
        expect(tankAllowed.has(r.affixId), `越池词条 ${r.affixId}`).toBe(true)
        if (r.affixId === 'aff-spd') sawCommon = true
      }
    }
    expect(sawCommon).toBe(true) // 通用池在坦克装备上可见(池是加法不是替换)
  })

  it('无 pool 标注的基底走全池(行为零变)', () => {
    const full = new Set(Object.keys(AFFIXES))
    for (let i = 0; i < 30; i++) {
      const item = rollDrop('trk-t1-band', createRng(900 + i))
      for (const r of item.rolls) expect(full.has(r.affixId)).toBe(true)
    }
  })
})
