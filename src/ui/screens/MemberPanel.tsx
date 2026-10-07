// T2 信息透明化:角色档案页(WoW 式全量面板)——从花名册点开,一个页面看懂一个人物。
// 纪律:所有数值经 toCombatant/statLayers 真实计算;所有说明来自 effect-text.ts,禁止臆造。
import { useEffect, useRef } from 'react'
import type { ItemInstance, Member } from '../../sim/types'
import { sortInventoryItems } from '../inventory-sort'
import { useState } from 'react'
import { JOBS, specOf } from '../../data/jobs'
import { HYBRIDS, isHybrid } from '../../data/vocations'
import { RACES } from '../../data/races'
import { ITEM_BASES } from '../../data/items'
import { AFFIXES } from '../../data/affixes'
import { scarStatName, FAINT_DAYS } from '../../sim/scars'
import { WEAPON_FAMILIES, FAMILY_IDS, JOB_FAMILIES, isFamilyProficient } from '../../data/weapon-families'
import { STAT_NAME, formatStat, describeItem, compareWithEquipped } from '../../sim/loot'
import { toCombatant } from '../../sim/combat'
import { SIGNATURE_SKILLS } from '../../data/signature'
import { skillLine, LEGACY_INFO } from '../../data/effect-text'
import { skillFamilyBlocked } from '../../sim/combat'
import { ECONOMY } from '../../data/economy'
import { describeEquipmentSet } from '../../sim/equipment-sets'

interface Props {
  member: Member
  members: Member[]
  onClose: () => void
  /** U29 反馈⑤:档案页直接换装(可选;缺省=只读档案) */
  inventory?: ItemInstance[]
  /** R3/W2:公会已学武器族(可选;缺省=按职业表判定) */
  weaponTraining?: string[]
  onEquip?: (slot: 'weapon' | 'armor' | 'trinket', itemId: string) => void
  /** U35 花名册改版:嵌入模式(作为花名册主区渲染,隐藏关闭按钮) */
  embedded?: boolean
  /** #2.4 对比语境(E04):仓库选一件候选,与已装备逐属性 delta(不给单一结论);缺省=不渲染 */
  compareItem?: ItemInstance
  /** U35:武器专修(按人学族)迁入档案页;可选=不渲染该区 */
  familyTraining?: {
    gold: number
    busy: boolean
    busyUntilDay: number
    today: number
    trainingLevel: number
    onLearn: (family: string) => void
  }
}

const SLOTS: (keyof Member['equipment'])[] = ['weapon', 'armor', 'trinket']
const slotName: Record<string, string> = { weapon: '武器', armor: '护甲', trinket: '饰品' }
const ATTR_NAMES: Record<string, string> = { str: '力量', agi: '敏捷', int: '智力', vit: '体质', spr: '精神', lck: '幸运' }

const QUALITY_TAG: Record<string, string> = { purple: '【史诗】', green: '【精良】', white: '' }

export function MemberPanel({ member, members, onClose, inventory, weaponTraining, onEquip, embedded, familyTraining, compareItem }: Props) {
  const [equipSort, setEquipSort] = useState<'rarity-desc' | 'name'>('rarity-desc')
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    panel.current?.focus()
    // R5.2b:Esc 统一由 App 层单一监听处理(按 backTargetOf 返回花名册),本面板不再自带监听
  }, [onClose])

  const canEquip = !!(inventory && onEquip)
  const slots: (keyof Member['equipment'])[] = ['weapon', 'armor', 'trinket']
  const slotNames: Record<string, string> = slotName
  const sortMode = equipSort === 'name' ? 'name' : 'rarity-desc' as const
  const job = JOBS[member.job]
  const race = RACES[member.race ?? 'human']
  const spec = isHybrid(member.spec) ? HYBRIDS[member.spec!] : specOf(member.job, member.spec)
  const c = toCombatant(member)
  const signature = SIGNATURE_SKILLS[spec.id]
  const advId = member.specAdvanced?.[spec.id]
  const advanced = advId ? spec.advancedSkills?.find((sk) => sk.id === advId) : undefined
  const setCrown = Object.values(member.equipment).filter((e) => e && ITEM_BASES[e.baseId]?.setName === 'gray-crown').length
  const setHunt = Object.values(member.equipment).filter((e) => e && ITEM_BASES[e.baseId]?.setName === 'wind-hunt').length
  // R3/W2 武器熟练提示:装备面板顶部一行,给"非熟练"一个看得见的原因
  const equippedFamily = member.equipment.weapon ? ITEM_BASES[member.equipment.weapon.baseId]?.family : undefined
  const familyProficient = isFamilyProficient(member.job, equippedFamily, weaponTraining)

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
    <div className="screen-overlay fullpage" style={{ zIndex: 100 }}>
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
          {!embedded && <button className="mini-btn" onClick={onClose}>✕ 关闭(Esc)</button>}
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
            {equippedFamily && (
              <p className="hint" data-testid="weapon-proficiency" role="status">
                {familyProficient
                  ? `✔ ${WEAPON_FAMILIES[equippedFamily].name}熟练${WEAPON_FAMILIES[equippedFamily].desc}`
                  : `⚠ 非熟练：攻击降档，${WEAPON_FAMILIES[equippedFamily].name}族内技能失效（训练场·武器专修可学）`}
              </p>
            )}
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
              {spec.skills.map((sk) => {
                // R5.3e(U33⑥):武器族标注+被封锁灰显(当前武器不满足族门槛)
                const blocked = skillFamilyBlocked(c, sk.weaponFamily)
                return (
                  <li key={sk.id} style={blocked ? { opacity: 0.45 } : undefined}>
                    {skillLine(sk, sk.weaponFamily)}
                    {blocked && <span className="hint"> ⚠ {blocked}</span>}
                  </li>
                )
              })}
              {advanced && <li key={advanced.id} style={skillFamilyBlocked(c, advanced.weaponFamily) ? { opacity: 0.45 } : undefined}>{skillLine(advanced, advanced.weaponFamily)}<span className="hint">(精进)</span>{skillFamilyBlocked(c, advanced.weaponFamily) && <span className="hint"> ⚠ {skillFamilyBlocked(c, advanced.weaponFamily)}</span>}</li>}
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
            {familyTraining && (
              <>
                <h3>武器专修</h3>
                <div className="voc-btns" role="group" aria-label="武器专修">
                  {FAMILY_IDS.map((f) => {
                    const def = WEAPON_FAMILIES[f]
                    const learned = isFamilyProficient(member.job, f, weaponTraining)
                    const born = Object.entries(JOB_FAMILIES).filter(([, fs]) => fs.includes(f)).map(([j]) => JOBS[j]?.name ?? j).join('/')
                    const travel = familyTraining.busyUntilDay > familyTraining.today
                    return (
                      <button key={f} disabled={learned || familyTraining.busy || travel || familyTraining.gold < 100}
                        title={`${def.desc}(天生熟练:${born})${travel ? ';训练中' : ''}`}
                        onClick={() => familyTraining.onLearn(f)}>
                        {def.name}{learned ? ' ✓' : travel ? ` ⏳ 第${familyTraining.busyUntilDay}天归队` : `(${born})`}
                      </button>
                    )
                  })}
                </div>
                <p className="hint">100 金学会一族(永久):该成员使用该族武器不再攻击降档、族内技能照常可用。学程 {familyTraining.trainingLevel >= 2 ? 1 : 2} 天(训练场 2 级起 1 天),期间不能出征。施法铁律:杖圣器的法术只认施法者(牧师/法师/术士)天赋,学习不授法术。</p>
              </>
            )}
            <h3>创伤</h3>
            {member.scars?.length ? (
              <ul className="ms-list">
                {member.scars.map((sc, i) => (
                  <li key={i}>{sc.faint
                    ? `${scarStatName(sc.stat)}虚痕(静养中——不减属性,第 ${(sc.faintSince ?? 0) + FAINT_DAYS} 天消退)`
                    : sc.text}</li>
                ))}
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
            <h3>生平{member.bio?.length ? <span className="hint">(倒序)</span> : ''}</h3>
            {member.bio?.length ? (
              <ul className="ms-list bio-list">
                {[...member.bio].reverse().map((b, i) => (
                  <li key={i} className="bio-entry">
                    {b.permanent && <span className="bio-flag" title="永久铭刻">⚑</span>}
                    <span className="bio-day">D{b.day}</span>
                    <span className="bio-text">{b.text}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="hint">还没有值得记下的经历。</p>}
          </div>
        </div>
      </section>
            {canEquip && (
          <div className="inv-panel">
            <h2>⚔ 换装(从仓库穿戴)</h2>
            {compareItem && (() => {
              const cmp = compareWithEquipped(compareItem, member.equipment[ITEM_BASES[compareItem.baseId].slot])
              return (
                <div className="potion-supply" data-testid="gear-compare">
                  <span className="hint">⚖ 对比:{describeItem(compareItem)} vs 当前{ITEM_BASES[compareItem.baseId].slot === 'weapon' ? '武器' : ITEM_BASES[compareItem.baseId].slot === 'armor' ? '护甲' : '饰品'}</span>
                  <ul className="ms-list">
                    {cmp.rows.map((r) => (
                      <li key={r.key}>
                        {STAT_NAME[r.key]}:{formatStat(r.key, r.candidate)} {r.delta !== 0 && (
                          <b style={{ color: r.delta > 0 ? '#7fb069' : '#c96f6f' }}>({r.delta > 0 ? '+' : ''}{formatStat(r.key, r.delta, true)})</b>
                        )}
                      </li>
                    ))}
                  </ul>
                  {cmp.notes.map((n, i) => <p key={i} className="hint">{n}</p>)}
                  <p className="hint">属性有得有失是常态——按这名成员的定位自己取舍(评分只用于排序,不代表更强)。</p>
                </div>
              )
            })()}
            <div className="tavern-row" role="group" aria-label="装备排序">
              <span className="hint">排序:</span>
              <button className={equipSort === 'rarity-desc' ? 'active' : ''} onClick={() => setEquipSort('rarity-desc')}>稀有度 ↓</button>
              <button className={equipSort === 'name' ? 'active' : ''} onClick={() => setEquipSort('name')}>名称 A-Z</button>
            </div>
            <div className="voc-btns">
              {slots.map((slot) => {
                const equipped = member.equipment[slot]
                const options = sortInventoryItems(inventory!.filter((i) => ITEM_BASES[i.baseId]?.slot === slot), sortMode)
                return (
                  <label key={slot} className="gear-control">
                    <span>{slotNames[slot]}</span>
                    <select
                      aria-label={member.name + '的' + slotNames[slot]}
                      className="slot-select"
                      value={equipped?.id ?? ''}
                      title={equipped ? '已穿戴' : `${slotNames[slot]}(空)`}
                      onChange={(e) => onEquip!(slot, e.target.value)}
                    >
                      <option value="">{slotNames[slot]}·空</option>
                      {options.map((i) => (
                        <option key={i.id} value={i.id}>
                          {QUALITY_TAG[i.quality ?? 'white']}{describeItem(i)}
                        </option>
                      ))}
                    </select>
                  </label>
                )
              })}
            </div>
          </div>
        )}
      </div>
  )
}

