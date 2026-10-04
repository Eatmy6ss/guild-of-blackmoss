import { describe, expect, it } from 'vitest'
import { ITEM_BASES } from './items'
import { JOBS } from './jobs'
import {
  FAMILY_IDS,
  JOB_FAMILIES,
  JOB_HOME_FAMILY,
  WEAPON_FAMILIES,
  canCastJob,
  isFamilyProficient,
  proficientFamilies,
} from './weapon-families'
import type { JobId, WeaponFamily } from '../sim/types'

// W1 验收:每件武器有合法 family;每职业熟练表非空且含本命族;注册表键名对数据表实读校验。

describe('weapon families 数据校验(R3/W1)', () => {
  const weapons = Object.values(ITEM_BASES).filter((b) => b.slot === 'weapon')

  it('每件武器都标注了合法的 family', () => {
    expect(weapons.length).toBeGreaterThan(0)
    for (const w of weapons) {
      expect(FAMILY_IDS, `武器 ${w.id} family 非法`).toContain(w.family)
    }
  })

  it('护甲与饰品不标注武器族', () => {
    for (const b of Object.values(ITEM_BASES)) {
      if (b.slot !== 'weapon') expect(b.family, `${b.id} 不应带 family`).toBeUndefined()
    }
  })

  it('五族定义齐全', () => {
    expect(FAMILY_IDS.sort()).toEqual(['axe', 'blade', 'bow', 'polearm', 'staff'])
    for (const f of FAMILY_IDS) {
      expect(WEAPON_FAMILIES[f].name.length).toBeGreaterThan(0)
      expect(WEAPON_FAMILIES[f].desc.length).toBeGreaterThan(0)
    }
  })

  it('熟练表键名与 JOBS 注册表逐一对应(坑台账:键名必须实读校验)', () => {
    expect(Object.keys(JOB_FAMILIES).sort()).toEqual(Object.keys(JOBS).sort())
    expect(Object.keys(JOB_HOME_FAMILY).sort()).toEqual(Object.keys(JOBS).sort())
  })

  it('每职业熟练表非空、族全部合法、且含本命族', () => {
    for (const job of Object.keys(JOBS) as JobId[]) {
      const table = JOB_FAMILIES[job]
      expect(table.length, `职业 ${job} 熟练表为空`).toBeGreaterThan(0)
      for (const f of table) expect(FAMILY_IDS, `职业 ${job} 熟练表含非法族 ${f}`).toContain(f)
      expect(table, `职业 ${job} 熟练表不含本命族`).toContain(JOB_HOME_FAMILY[job])
    }
  })

  it('U31 拍板的具体分工:守卫含长柄/战士双近战族/游侠含弓/施法三职业以杖为本命', () => {
    expect(JOB_FAMILIES.guard).toContain('polearm')
    expect(JOB_FAMILIES.warrior).toEqual(expect.arrayContaining(['blade', 'axe']))
    expect(JOB_FAMILIES.ranger).toContain('bow')
    for (const j of ['priest', 'mage', 'warlock'] as const) {
      expect(JOB_FAMILIES[j]).toContain('staff')
      expect(JOB_HOME_FAMILY[j]).toBe('staff')
    }
  })

  it('施法铁律:施法职业恰好是牧师/法师/术士', () => {
    expect(canCastJob('priest')).toBe(true)
    expect(canCastJob('mage')).toBe(true)
    expect(canCastJob('warlock')).toBe(true)
    expect(canCastJob('guard')).toBe(false)
    expect(canCastJob('warrior')).toBe(false)
    expect(canCastJob('ranger')).toBe(false)
  })

  it('熟练判定:职业表∪已学;未知职业回落空表;未持武器恒熟练', () => {
    expect(isFamilyProficient('warrior', 'blade', undefined)).toBe(true)
    expect(isFamilyProficient('warrior', 'bow', undefined)).toBe(false)
    expect(isFamilyProficient('warrior', 'bow', ['bow'])).toBe(true)
    expect(isFamilyProficient('guard', 'polearm', undefined)).toBe(true)
    // 未持武器(family undefined)不构成非熟练
    expect(isFamilyProficient('mage', undefined, undefined)).toBe(true)
    // 非法学 id 不进表
    const learned = proficientFamilies('mage', ['polearm', 'not-a-family' as WeaponFamily])
    expect(learned).toContain('staff')
    expect(learned).toContain('polearm')
    expect(learned).not.toContain('not-a-family')
  })
})
