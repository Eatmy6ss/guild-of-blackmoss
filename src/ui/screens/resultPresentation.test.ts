import { describe, it, expect } from 'vitest'
import { resultFacts, resultBonds } from './resultPresentation'
import { generateMember } from '../../sim/gen'
import type { FactLedger } from '../../sim/fact-ledger'

describe('结算展示的数据边界', () => {
  const ledger: FactLedger = { nextId: 8, expeditionStart: 5, facts: [
    { id: 2, day: 1, kind: 'first-kill', actors: ['a'], refs: { dungeonId: 'blackmoss', bossId: 'grush' } },
    { id: 5, day: 2, kind: 'first-kill', actors: ['a'], refs: { dungeonId: 'blackmoss', bossId: 'talma' } },
    { id: 6, day: 2, kind: 'scar', actors: ['b'], refs: { dungeonId: 'tower', scarNth: 1 } },
    { id: 7, day: 2, kind: 'wish-done', actors: ['b'], refs: {} },
  ] }
  it('仅从本趟水位读取首杀/心愿，排除旧记录与其它副本', () => {
    expect(resultFacts({ dungeonId: 'blackmoss' }, ledger).map(f => f.id)).toEqual([5, 7])
  })
  it('旧档缺少出征水位时不展示伪造的本趟首杀', () => {
    expect(resultFacts({ dungeonId: 'blackmoss' }, { ...ledger, expeditionStart: undefined })).toEqual([])
  })
  it('复刷不把旧默契标为新增，缺快照只展示当前星级，阵亡者不保留默契加成', () => {
    const a = generateMember('guard', 4, 511), b = generateMember('priest', 4, 512)
    a.bonds[b.id] = 3
    const before = { level: 4, power: 120, bondTotal: 3, bonds: { [b.id]: 3 } }
    expect(resultBonds(a, [a, b], before)).toEqual([`与${b.name}默契 2 星`])
    expect(resultBonds(a, [a, b])).toEqual([`与${b.name}默契 2 星`])
    expect(resultBonds(a, [a, b], { ...before, bonds: {} })).toEqual([`与${b.name}默契 0 → 2 星`])
    expect(resultBonds({ ...a, alive: false }, [b], before)).toEqual([])
  })
})
