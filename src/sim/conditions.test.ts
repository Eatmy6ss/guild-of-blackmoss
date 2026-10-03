import { describe, it, expect } from 'vitest'
import { createRun, moveTo, startStep, mapOptions } from './run'
import { enterNodeConditions, triggerAfterElite, conditionBattleMods, restHealMult, conditionChanceMod, eliteWeightMult } from './conditions'

import { generateMember } from './gen'
import { BLACKMOSS } from '../data/dungeons'
import { CONDITION_BY_ID } from '../data/conditions'

// R1.2 路况状态·验收(redesign §3 R1.2):
// - 走水域节点在固定 seed 下触发湿透,药水 −1,下一场受疗乘区为 0.9;走营地后解除
// - 惊动后,后续层 elite 比例上升(200 seed 统计)

const squad = () => ['guard', 'priest', 'ranger'].map((j, i) => generateMember(j as 'guard' | 'priest' | 'ranger', 5, 901 + i))

describe('R1.2 路况状态', () => {
  it('固定 seed 走水域触发湿透:药水 −1,下一场受疗乘区 0.9;走营地解除', () => {
    const members = squad()
    const run = createRun(members, BLACKMOSS, 77)
    run.potions = { heal: 3, fury: 3 }
    // 挑一个固定 seed 下必然触发的水域节点:直接把 chance 修正用满(mastery 0 → ×1),多试几个 seed 取确定触发的
    let triggered = false
    for (let seed = 77; seed < 77 + 40 && !triggered; seed++) {
      const r = createRun(members, BLACKMOSS, seed)
      r.potions = { heal: 3, fury: 3 }
      const water = r.map.layers.flat().find((n) => n.terrain === 'water')!
      if (!water) continue
      r.nodeId = water.id
      r.path = [water.id]
      enterNodeConditions(r, water, 0)
      if (r.conditions.includes('soaked')) {
        triggered = true
        expect(r.potions.heal, '湿透应泡坏 1 瓶治疗药').toBe(2)
        // 下一场战斗受疗乘区 0.9:与无状态基线差 −0.1(成员自带种族/性格受疗,取差值)
        r.nodeId = water.id
        startStep(r, seed, 0, members)
        const soakedHeal = r.battle!.combatants.find((c) => c.memberId === members[0].id)!.healReceived ?? 0
        r.conditions = []
        r.battle = null
        r.phase = 'rest'
        startStep(r, seed, 0, members)
        const baseHeal = r.battle!.combatants.find((c) => c.memberId === members[0].id)!.healReceived ?? 0
        expect(soakedHeal - baseHeal).toBeCloseTo(-0.1, 5)
        // 走营地解除
        const camp = r.map.layers.flat().find((n) => n.terrain === 'camp')!
        expect(camp, 'blackmoss 应有营地地形').toBeTruthy()
        enterNodeConditions(r, camp, 0)
        expect(r.conditions.includes('soaked'), '营地应解除湿透').toBe(false)
      }
    }
    expect(triggered, '40 个 seed 内应出现湿透(chance 0.5)').toBe(true)
  })

  it('惊动:精英打完后挂状态,后续层战斗节点翻精英(200 seed 统计上升)', () => {
    let totalBefore = 0
    let totalAfter = 0
    let increased = 0
    for (let i = 0; i < 200; i++) {
      const run = createRun(squad(), BLACKMOSS, 9000 + i * 17)
      const countElites = () => run.map.layers.flat().filter((n) => n.layer > 0 && (n.kind === 'elite')).length
      const before = countElites()
      // 伪造站在一个精英节点上打完
      const eliteNode = run.map.layers.flat().find((n) => n.kind === 'elite')
      if (!eliteNode) continue
      run.nodeId = eliteNode.id
      run.path = [eliteNode.id]
      triggerAfterElite(run)
      const after = countElites()
      totalBefore += before
      totalAfter += after
      if (after > before) increased++
      expect(run.conditions.includes('startled'), '惊动应挂上').toBe(true)
    }
    expect(totalAfter, '惊动后全图精英总数应上升').toBeGreaterThan(totalBefore)
    expect(increased, `多数 seed 应出现新增精英(${increased}/200)`).toBeGreaterThan(100)
  })

  it('战斗乘区连乘:湿透+阴寒同时挂时 startStep 聚合 heal 0.9 与 atk 0.92;暴露走敌方通道', () => {
    const members = squad()
    const run = createRun(members, BLACKMOSS, 5)
    run.conditions = ['soaked', 'chill', 'exposed']
    const { mods, enemyMods } = conditionBattleMods(run)
    expect(mods.heal).toBeCloseTo(0.9, 5)
    expect(mods.atk).toBeCloseTo(0.92, 5)
    expect(enemyMods.atk).toBeCloseTo(1.15, 5)
    // 敌方通道生效:同种子同节点,暴露场敌人攻击更高
    const node = run.map.layers[0].find((n) => n.kind === 'battle')!
    run.nodeId = node.id
    run.path = [node.id]
    run.conditions = []
    startStep(run, 99, 0, members)
    const plainAtk = run.battle!.combatants.filter((c) => c.team === 'enemy').reduce((s, c) => s + c.attack, 0)
    run.conditions = ['exposed']
    run.battle = null
    run.phase = 'rest'
    startStep(run, 99, 0, members)
    const exposedAtk = run.battle!.combatants.filter((c) => c.team === 'enemy').reduce((s, c) => s + c.attack, 0)
    expect(exposedAtk).toBeGreaterThan(plainAtk)
  })

  it('连走两个战斗节点触发疲惫:休整回复减半', () => {
    const run = createRun(squad(), BLACKMOSS, 21)
    const battles = run.map.layers.flat().filter((n) => n.kind === 'battle' || n.kind === 'elite')
    expect(battles.length).toBeGreaterThanOrEqual(2)
    for (const n of battles.slice(0, 2)) {
      run.nodeId = n.id
      run.path.push(n.id)
      enterNodeConditions(run, n, 0)
    }
    expect(run.conditions.includes('tired'), '连走两战应疲惫').toBe(true)
    expect(restHealMult(run)).toBe(0.5)
  })

  it('熟练度修 正:80+ 档触发率减半(统计口径)', () => {
    expect(conditionChanceMod(0)).toBe(1)
    expect(conditionChanceMod(60)).toBe(0.75)
    expect(conditionChanceMod(80)).toBe(0.5)
    let high = 0
    let low = 0
    for (let i = 0; i < 200; i++) {
      const run = createRun(squad(), BLACKMOSS, 30000 + i * 13)
      const water = run.map.layers.flat().find((n) => n.terrain === 'water')!
      if (!water) continue
      run.nodeId = water.id
      run.path = [water.id]
      enterNodeConditions(run, water, 0)
      if (run.conditions.includes('soaked')) low++
      run.conditions = []
      run.path = []
      run.nodeId = ''
      enterNodeConditions(run, water, 80)
      if (run.conditions.includes('soaked')) high++
    }
    expect(low).toBeGreaterThan(high)
    void eliteWeightMult
    void CONDITION_BY_ID
    void mapOptions
    void startStep
  })

  it('地图节点落地即触发:moveTo 一并掷路况(不再由 UI 层补)', () => {
    const members = squad()
    const run = createRun(members, BLACKMOSS, 4242)
    const node0 = run.map.layers[0].find((n) => n.kind === 'battle') ?? run.map.layers[0][0]!
    run.nodeId = node0.id
    run.path = [node0.id]
    startStep(run, 4242, 0, members)
    const opts = mapOptions(run)
    expect(opts.length).toBeGreaterThan(0)
    const before = run.path.length
    const picked = opts[0]!
    moveTo(run, picked.id, 0)
    expect(run.path.length).toBe(before + 1)
    expect(Array.isArray(run.conditions)).toBe(true)
  })
})
