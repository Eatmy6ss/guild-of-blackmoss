// T2 信息透明化:角色档案页(WoW 式全量面板)——从花名册点开,一个页面看懂一个人物。
// 纪律:所有数值经 toCombatant/statLayers 真实计算;所有说明来自 effect-text.ts,禁止臆造。
import { useEffect, useRef } from 'react'
import type { Member } from '../sim/types'
import { JOBS, specOf } from '../data/jobs'
import { HYBRIDS, isHybrid } from '../data/vocations'
import { RACES } from '../data/races'
import { ITEM_BASES } from '../data/items'
import { AFFIXES } from '../data/affixes'
import { STAT_NAME, formatStat } from '../sim/loot'
import { toCombatant } from '../sim/combat'
import { SIGNATURE_SKILLS } from '../data/signature'
import { skillLine, LEGACY_INFO } from '../data/effect-text'
import { ECONOMY } from '../data/economy'
import { describeEquipmentSet } from '../sim/equipment-sets'

interface Props {
  member: Member
  members: Member[]
  onClose: () => void
}

const SLOTS: (keyof Member['equipment'])[] = ['weapon', 'armor', 'trinket']
const slotName: Record<string, string> = { weapon: '武器', armor: '护甲', trinket: '饰品' }
const ATTR_NAMES: Record<string, string> = { str: '力量', agi: '敏捷', int: '智力', vit: '体质', spr: '精神', lck: '幸运' }

export function MemberPanel({ member, members, onClose }: Props) {
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const job = JOBS[member.job]
  const race = RACES[member.race ?? 'human']
  const spec = isHybrid(member.spec) ? HYBRIDS[member.spec!] : specOf(member.job, member.spec)
  const c = toCombatant(member)
  const signature = SIGNATURE_SKILLS[spec.id]
  const advId = member.specAdvanced?.[spec.id]
  const advanced = advId ? spec.advancedSkills?.find((sk) => sk.id === advId) : undefined
  const setCrown = Object.values(member.equipment).filter((e) => e && ITEM_BASES[e.baseId]?.setName === 'gray-crown').length
  const setHunt = Object.values(member.equipment).filter((e) => e && ITEM_BASES[e.baseId]?.setName === 'wind-hunt').length

  const bonds = Object.entries(member.bonds ?? {})
    .map(([id, v]) => ({ other: members.find((m) => m.id === id), v }))
    .filter((x) => x.other)
    .sort((a, b) => b.v - a.v)
    .slice(0, 3)

  const combatRows: [string, string][] = [
    ['最大生命', String(c.maxHp)],
    ['攻击', String(c.attack)],
    ['防御', String(c.defense)],
    ['攻击间隔', `${(c.attackInterval / 10).toFixed(1)} 秒/击`],
    ['暴击', `${Math.round(c.critChance * 1000) / 10}%`],
    ['吸血', c.lifesteal ? `${Math.round(c.lifesteal * 100)}%` : '—'],
    ['受疗', c.healReceived ? `+${Math.round(c.healReceived * 100)}%` : '—'],
    ['火抗', c.fireResist ? `${Math.round(c.fireResist * 100)}%` : '—'],
  ]

  return (
    <div className="screen-overlay" style={{ zIndex: 100 }}>
      <section className="member-sheet" ref={panel as never} tabIndex={-1}>
        <div className="ms-head">
          <div>
            <h2>{member.name}</h2>
            <p className="ms-sub">
              {race.name} · {isHybrid(member.spec) ? HYBRIDS[member.spec!].name : specOf(member.job, member.spec).name}
              ({job.name}) · Lv{member.level}
              {!member.alive && <b className="ms-dead"> † 已阵亡</b>}
            </p>
            <p className="ms-identity">{spec.identity}</p>
          </div>
          <button className="mini-btn" onClick={onClose}>✕ 关闭(Esc)</button>
        </div>

        <div className="ms-columns">
          {/* 左:属性 */}
          <div className="ms-col">
            <h3>属性</h3>
            <table className="ms-table">
              <tbody>
                {(Object.keys(ATTR_NAMES) as (keyof typeof member.attrs)[]).map((k) => (
                  <tr key={k}>
                    <td>{ATTR_NAMES[k]}</td>
                    <td>{member.attrs[k]}{(race.attrBonus as Record<string, number> | undefined)?.[k] ? ` (+${(race.attrBonus as Record<string, number>)[k]})` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3>战斗属性<span className="hint">(含装备/创伤/性格)</span></h3>
            <table className="ms-table">
              <tbody>
                {combatRows.map(([k, v]) => (
                  <tr key={k}><td>{k}</td><td>{v}</td></tr>
                ))}
              </tbody>
            </table>
            <h3>性格</h3>
            <ul className="ms-list">
              <li>勇猛 {member.personality.bravery} / 谨慎 {member.personality.caution}</li>
              <li>贪婪 {member.personality.greed} / 忠诚 {member.personality.loyalty}</li>
            </ul>
            {member.trait && <p className="hint">特性:{member.trait}</p>}
          </div>

          {/* 中:装备 */}
          <div className="ms-col">
            <h3>装备{(setCrown || setHunt) ? <span className="hint">({describeEquipmentSet('gray-crown', setCrown)}{setCrown && setHunt ? ' · ' : ''}{describeEquipmentSet('wind-hunt', setHunt)})</span> : ''}</h3>
            {SLOTS.map((slot) => {
              const item = member.equipment[slot]
              const base = item ? ITEM_BASES[item.baseId] : undefined
              return (
                <div key={slot} className="ms-eq">
                  <b>{slotName[slot]}</b>
                  {!item || !base ? <span className="hint">空</span> : (
                    <div className="ms-eq-body">
                      <div className="ms-eq-name">
                        {base.name}
                        {base.legacy && LEGACY_INFO[base.legacy] ? <span className="ms-legacy">〔{LEGACY_INFO[base.legacy].name}〕</span> : ''}
                        {base.setName ? <span className="ms-set">[{base.setName === 'gray-crown' ? '灰冠' : base.setName === 'wind-hunt' ? '猎风' : base.setName}套装]</span> : null}
                      </div>
                      <div className="hint">{STAT_NAME[base.stat]}{formatStat(base.stat, base.value, true)}</div>
                      {item.rolls.map((r, i) => {
                        const aff = AFFIXES[r.affixId]
                        return <div key={i} className="ms-affix">{aff?.name ?? r.affixId}:{formatStat(aff.stat, r.value, true)}</div>
                      })}
                      {base.legacy && LEGACY_INFO[base.legacy] && <div className="ms-legacy">{LEGACY_INFO[base.legacy].name}:{LEGACY_INFO[base.legacy].desc}</div>}
                    </div>
                  )}
                </div>
              )
            })}
            <h3>技能</h3>
            <ul className="ms-list">
              {spec.skills.map((sk) => <li key={sk.id}>{skillLine(sk)}</li>)}
              {advanced && <li key={advanced.id}>{skillLine(advanced)}<span className="hint">(精进)</span></li>}
            </ul>
            {signature && (
              <div className="ms-sig">
                <b>【招牌技】{signature.name}</b>
                <p className="hint">{signature.desc}(冷却 {signature.cdTicks / 10} 秒)</p>
              </div>
            )}
          </div>

          {/* 右:经历 */}
          <div className="ms-col">
            <h3>通用战技</h3>
            {member.augments?.length ? (
              <ul className="ms-list">
                {member.augments.map((a) => {
                  const ag = (ECONOMY.augments as Record<string, { name: string; desc: string }>)[a]
                  return <li key={a}>{ag ? `${ag.name}:${ag.desc}` : a}</li>
                })}
              </ul>
            ) : <p className="hint">尚未在训练场领悟。</p>}
            <h3>创伤</h3>
            {member.scars?.length ? (
              <ul className="ms-list">
                {member.scars.map((sc, i) => <li key={i}>{sc.text}</li>)}
              </ul>
            ) : <p className="hint">无创伤。</p>}
            <h3>心愿</h3>
            {member.wish ? <p className="hint">{member.wish.text}</p> : <p className="hint">暂无心愿。</p>}
            <h3>默契(最深的几段)</h3>
            {bonds.length ? (
              <ul className="ms-list">
                {bonds.map((x) => <li key={x.other!.id}>{x.other!.name}:{x.v}</li>)}
              </ul>
            ) : <p className="hint">还没有并肩作战的记忆。</p>}
          </div>
        </div>
      </section>
    </div>
  )
}
