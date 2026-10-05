import { HeroPortrait, ArtCanvas } from './art/ArtCanvas'
import { itemIcon } from './art/catalog'
import type { BattleState, ItemInstance, Member, Slot } from '../sim/types'
import type { DungeonRun } from '../sim/run'
import { RACES } from '../data/races'
import { isHybrid, HYBRIDS } from '../data/vocations'
import { specOf, JOBS } from '../data/jobs'
import { maxHpOf } from '../sim/gen'
import { powerScore } from '../sim/combat'
import { describeItem } from '../sim/loot'
import { ITEM_BASES } from '../data/items'
import { isFamilyProficient, WEAPON_FAMILIES } from '../data/weapon-families'
import { skillFamilyBlocked, toCombatant } from '../sim/combat'

/** 换上 family 后会失去的技能名列表(按当前专精技能组扫描) */
function skillsLostBy(m: Member, family: import('../sim/types').WeaponFamily): string {
  const spec = isHybrid(m.spec) ? HYBRIDS[m.spec!] : specOf(m.job, m.spec)
  const famDef = WEAPON_FAMILIES[family]
  void famDef
  const c = { ...toCombatant(m), weaponFamily: family, weaponProficient: isFamilyProficient(m.job, family, m.weaponLearned), team: 'guild' as const }
  const names = [...spec.skills, ...(spec.advancedSkills ?? [])]
    .filter((sk) => skillFamilyBlocked(c, sk.weaponFamily))
    .map((sk) => sk.name)
  return names.join('、')
}
import { slotsOf } from '../sim/loot'
import { attrsLine, personalityLine } from './screens/member-lines'
import { moraleReadout } from '../sim/chronicle'

const SLOTS: (keyof Member['equipment'])[] = ['weapon', 'armor', 'trinket']
const SLOT_NAME: Record<string, string> = { weapon: '武器', armor: '护甲', trinket: '饰品' }

// R5.2d(U33⑦):花名册成员卡自 App.tsx 迁出(行为零变,回调经 props)。
export function MemberCard(props: {
  member: Member
  battle: BattleState | null
  run: DungeonRun | null
  expedition: Member[]
  onOpen: (id: string) => void
  onEnter: (id: string) => void
  onLeave: (id: string) => void
  inventory: ItemInstance[]
  expeditionIds: string[]
  onEquip: (m: Member, slot: Slot, itemId: string) => void
}) {
  const { battle, run, inventory, onOpen, onEnter, onLeave, onEquip } = props
  const m = props.member
    const c = battle?.combatants.find((x) => x.memberId === m.id)
    const hp = c ? c.hp : m.hp
    const max = c ? c.maxHp : maxHpOf(m)
    const onExpedition = run != null ? (run.memberIds ?? []).includes(m.id) : props.expedition.includes(m)
    return (
      <div key={m.id} className="member-card">
        <div className="mc-head" role="button" tabIndex={0} aria-expanded={false}
          style={{ cursor: 'pointer' }} title="点击打开人物档案(全部属性/装备明细/换装)" onClick={() => onOpen(m.id)}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(m.id) }
          }}>
          <HeroPortrait member={m} />
          <span className="name">{m.name}</span>
          <span className="job">
            {RACES[m.race ?? 'human'].name}·{isHybrid(m.spec) ? HYBRIDS[m.spec!].name : specOf(m.job, m.spec).name}({JOBS[m.job].name}) Lv{m.level}
            {onExpedition ? ' · ⚔远征队' : m.busyUntilDay && m.busyUntilDay > 0 ? ` · ⏳ 训练中` : ''}
          </span>
          <span className={`hp${c && !c.alive ? ' dead' : ''}`}>
            HP {hp}/{max}
            {c && !c.alive ? '（已倒下）' : ''}
          </span>
        </div>
        <div className="row">
          <span>{attrsLine(m)}</span>
          <span>{personalityLine(m)}</span>
          <span>战力 {powerScore(m)}</span>
          <span>{moraleReadout(m)}</span>
          {!run && m.alive && (
            props.expeditionIds.includes(m.id) ? (
              <button className="mini-btn" onClick={() => onLeave(m.id)}>▼ 替补</button>
            ) : (
              <button className="mini-btn" onClick={() => onEnter(m.id)}>▲ 编入</button>
            )
          )}
        </div>
        <div className="mc-slots">
          {SLOTS.map((slot) => {
            const equipped = m.equipment[slot]
            const options = [
              ...(equipped ? [equipped] : []),
              ...inventory.filter((i) => slotsOf(i) === slot),
            ]
            // R5.3e(U33⑥):下拉选项展示武器族与「换上后失去」;当前武器标熟练
            const optLabel = (i: ItemInstance): string => {
              const base = ITEM_BASES[i.baseId]
              if (base?.slot !== 'weapon' || !base.family) return describeItem(i)
              const prof = isFamilyProficient(m.job, base.family, m.weaponLearned)
              const blocked = skillFamilyBlocked({ ...toCombatant(m), weaponFamily: base.family, weaponProficient: prof, team: 'guild' }, undefined)
              void blocked
              const loses = skillsLostBy(m, base.family)
              return `${base.family === 'blade' ? '刃' : base.family === 'bow' ? '弓' : base.family === 'staff' ? '杖' : base.family === 'axe' ? '锤斧' : '长柄'}·${prof ? '✔熟练' : '⚠非熟练'} ${describeItem(i)}${loses ? `〔换上后失去:${loses}〕` : ''}`
            }
            return (
              <label key={slot} className="gear-control">
                <ArtCanvas paths={[itemIcon(equipped?.baseId ?? '', slot)]} label={SLOT_NAME[slot]} size={32} />
                <span>{SLOT_NAME[slot]}</span>
              <select
                aria-label={m.name + '的' + SLOT_NAME[slot]}
                className="slot-select"
                value={equipped?.id ?? ''}
                title={equipped ? describeItem(equipped) : `${SLOT_NAME[slot]}（空）`}
                onChange={(e) => onEquip(m, slot, e.target.value)}
              >
                <option value="">{SLOT_NAME[slot]}·空</option>
                {options.map((i) => (
                  <option key={i.id} value={i.id}>
                    {optLabel(i)}
                  </option>
                ))}
              </select>
              </label>
            )
          })}
        </div>
      </div>
    )
  }
