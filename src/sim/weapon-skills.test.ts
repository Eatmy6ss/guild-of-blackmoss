import { afterEach, describe, expect, it } from 'vitest'
import { JOBS } from '../data/jobs'
import { HYBRIDS } from '../data/vocations'
import { SIGNATURE_SKILLS } from '../data/signature'
import { setGuildLearnedFamilies } from '../data/weapon-families'
import { skillFamilyBlocked, toCombatant, useSignature } from './combat'
import type { BattleState, Combatant, Member, SkillDef, WeaponFamily } from './types'

// R3/W3 验收:我方技能(职业/精进/混合/招牌)全量标注 weaponFamily,无遗漏;
// 引擎门槛单点(skillFamilyBlocked)——非熟练/族不合禁用,AI 与招牌技共用;
// 空手不触发族门槛(惩罚"拿错武器",不是"没拿武器")。

const NEUTRAL: Member['attrs'] = { str: 10, agi: 10, int: 10, vit: 10, spr: 10, lck: 10 }

function mkMember(job: Member['job'], spec: string | undefined, weaponBaseId?: string): Member {
  return {
    id: 'm1', name: '测试', job, spec, level: 5,
    nature: { base: NEUTRAL, growth: NEUTRAL, caps: NEUTRAL },
    personality: { bravery: 50, caution: 50, greed: 50, loyalty: 50 },
    attrs: { ...NEUTRAL },
    hp: 100, exp: 0, bonds: {},
    equipment: weaponBaseId ? { weapon: { id: 'i1', baseId: weaponBaseId, rolls: [] } } : {},
    alive: true,
  }
}

afterEach(() => setGuildLearnedFamilies([]))

describe('技能全量标注完整性(R3/W3)', () => {
  it('六职业全部专精:基础技+精进技逐条标注', () => {
    for (const job of Object.values(JOBS)) {
      for (const sp of Object.values(job.specs)) {
        const all = [...sp.skills, ...(sp.advancedSkills ?? [])]
        expect(all.length, `${sp.id} 无技能`).toBeGreaterThan(0)
        for (const sk of all) {
          expect(sk.weaponFamily, `${sp.id}/${sk.id} 未标注 weaponFamily`).toBeDefined()
        }
      }
    }
  })

  it('15 混合职阶全部技能逐条标注', () => {
    expect(Object.keys(HYBRIDS).length).toBe(15)
    for (const hy of Object.values(HYBRIDS)) {
      for (const sk of hy.skills) {
        expect(sk.weaponFamily, `${hy.id}/${sk.id} 未标注 weaponFamily`).toBeDefined()
      }
    }
  })

  it('12 招牌技全部标注,且键名对专精表实读校验(坑7 防线)', () => {
    const specIds = new Set(Object.values(JOBS).flatMap((j) => Object.keys(j.specs)))
    expect(Object.keys(SIGNATURE_SKILLS).length).toBe(12)
    for (const sig of Object.values(SIGNATURE_SKILLS)) {
      expect(specIds.has(sig.specId), `招牌技 ${sig.id} 的 specId=${sig.specId} 不在专精表`).toBe(true)
      expect(sig.weaponFamily, `招牌技 ${sig.id} 未标注`).toBeDefined()
    }
  })

  it('标注语义抽查:瞄准射击需弓、火球术需杖、嘲讽通用/牧师治疗需杖或刃(R5.3a 修订)', () => {
    const find = (id: string): SkillDef | undefined => {
      for (const j of Object.values(JOBS)) for (const sp of Object.values(j.specs)) {
        const hit = [...sp.skills, ...(sp.advancedSkills ?? [])].find((s) => s.id === id)
        if (hit) return hit
      }
      return undefined
    }
    expect(find('ranger-aimed')?.weaponFamily).toEqual(['bow'])
    expect(find('mage-fireball')?.weaponFamily).toEqual(['staff'])
    expect(find('guard-taunt')?.weaponFamily).toBe('universal')
    // R5.3a(U33⑤):牧师治疗类不再是通用——需杖或刃
    expect(find('priest-heal')?.weaponFamily).toEqual(['staff', 'blade'])
    expect(find('holy-nova')?.weaponFamily).toEqual(['staff', 'blade'])
    expect(find('priest-shield')?.weaponFamily).toEqual(['staff', 'blade'])
    expect(find('holy-channel')?.weaponFamily).toEqual(['staff', 'blade'])
    // R5.3a:守卫本职技能认长柄(数据 bug 修正)
    expect(find('guard-wall-slam')?.weaponFamily).toEqual(['blade', 'axe', 'polearm'])
    expect(find('guard-shieldbreak')?.weaponFamily).toEqual(['blade', 'axe', 'polearm'])
    // 战士系不认长柄(战士天生不熟练长柄)
    expect(find('warrior-cleave')?.weaponFamily).toEqual(['blade', 'axe'])
  })
})

describe('引擎门槛 skillFamilyBlocked(R3/W3)', () => {
  const blockedOf = (member: Member, families: WeaponFamily[] | 'universal' | undefined) =>
    skillFamilyBlocked(toCombatant(member), families)

  it('族匹配且熟练 → 可用;族不合 → 拒;空手不触发门槛', () => {
    expect(blockedOf(mkMember('ranger', undefined, 'wpn-t2-bow'), ['bow'])).toBeNull()
    // 空手=无武器门槛(老档/赤手行为零变)
    expect(blockedOf(mkMember('ranger', undefined), ['bow'])).toBeNull()
    const wrong = blockedOf(mkMember('ranger', undefined, 'wpn-t2-staff'), ['bow'])
    expect(wrong).toContain('需 弓')
    expect(wrong).toContain('杖')
  })

  it('族匹配但非熟练 → 拒(战士拿弩学过之前,弓族技能不可用)', () => {
    const warrior = mkMember('warrior', undefined, 'wpn-t2-crossbow')
    expect(toCombatant(warrior).weaponProficient).toBe(false)
    const reason = blockedOf(warrior, ['bow'])
    expect(reason).toContain('非熟练')
  })

  it('学习后恢复:战士学弓弩 → 弓族武器熟练,族匹配技能放行', () => {
    setGuildLearnedFamilies(['bow'])
    expect(blockedOf(mkMember('warrior', undefined, 'wpn-t2-crossbow'), ['bow'])).toBeNull()
  })

  it('universal/未标注/敌方一律放行', () => {
    expect(blockedOf(mkMember('mage', undefined), 'universal')).toBeNull()
    expect(blockedOf(mkMember('mage', undefined), undefined)).toBeNull()
    const enemy = { ...toCombatant(mkMember('mage', undefined)), team: 'enemy' as const }
    expect(skillFamilyBlocked(enemy, ['bow'])).toBeNull()
  })
})

describe('招牌技受理门槛(R3/W3)', () => {
  const minimalState = (c: Combatant, casting = false): BattleState => {
    const state = {
      status: 'running', tick: 0, seed: 1, combatants: [c],
      commands: { potions: { heal: 0, fury: 0 }, stance: 'standard', protectRetreat: true, autoMode: false },
      log: [], events: [], signatureCd: {},
    } as unknown as BattleState
    if (casting) {
      // 打断系招牌需要目标真的在读条(hasActiveCast 判定),仿 ai-signature.test 夹具
      const enemy = { id: 'e1', team: 'enemy', alive: true, name: '读条怪' } as Combatant
      enemy.bossMechanics = [{ id: 'tc', kind: 'cast-buff', name: '测试咏唱', params: { breakDamage: 100, castTicks: 50, everyTicks: 200, firstTick: 10 } }]
      enemy.mech = { 'cast-buff': { until: 50, taken: 0 } }
      state.combatants.push(enemy)
    }
    return state
  }

  it('游侠持弓:贯甲狙击受理;持杖(非熟练):拒', () => {
    setGuildLearnedFamilies([])
    const archer = toCombatant(mkMember('ranger', 'ranger-hawk', 'wpn-t2-bow'))
    const ok = useSignature(minimalState(archer), archer.memberId!, 'e1')
    expect(ok).toBe(true)
    setGuildLearnedFamilies([])
    const hexer = toCombatant(mkMember('ranger', 'ranger-hawk', 'wpn-t2-staff'))
    const no = useSignature(minimalState(hexer), hexer.memberId!, 'e1')
    expect(no).toBe(false)
  })

  it('施法铁律交互:牧师学刃持剑——治疗招牌(通用)可用,戒律沉默(需杖)拒;持杖放行', () => {
    setGuildLearnedFamilies(['blade'])
    const holy = toCombatant(mkMember('priest', 'priest-holy', 'wpn-t1-sword'))
    expect(useSignature(minimalState(holy), holy.memberId!, holy.memberId)).toBe(true)
    setGuildLearnedFamilies(['blade'])
    const disc = toCombatant(mkMember('priest', 'priest-discipline', 'wpn-t1-sword'))
    // 打断系:先确认读条目标在场时,族门槛才会是唯一拦截原因
    expect(useSignature(minimalState(disc, true), disc.memberId!, 'e1')).toBe(false)
    const discStaff = toCombatant(mkMember('priest', 'priest-discipline', 'wpn-t2-staff'))
    expect(useSignature(minimalState(discStaff, true), discStaff.memberId!, 'e1')).toBe(true)
  })
})
