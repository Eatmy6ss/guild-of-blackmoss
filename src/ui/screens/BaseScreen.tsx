// base 屏(U29 R2-5 自 App.tsx 迁出;行为零变——训练/疗养/建筑/转职/精进/战技处理器留 App,props 下传)
import { BUILDINGS } from '../../data/base'
import { ECONOMY } from '../../data/economy'
import { skillLine, SPEC_PASSIVE_DESC } from '../../data/effect-text'
import { SIGNATURE_SKILLS } from '../../data/signature'
import { JOBS, specOf } from '../../data/jobs'
import { HYBRIDS, isHybrid } from '../../data/vocations'
import { RACES } from '../../data/races'
import { scarStatName, healingTerms, FAINT_DAYS } from '../../sim/scars'
import { describeItem } from '../../sim/loot'
import { AFFIXES } from '../../data/affixes'
import type { ItemInstance, Member } from '../../sim/types'
import { useState } from 'react'

interface BaseScreenProps {
  day: number
  gold: number
  blessing: number
  members: Member[]
  busy: boolean
  trainingReady: boolean
  healingNotice: string | null
  healingMastery: Record<string, number>
  buildings: Record<string, number>
  unlockedHybrids: string[]
  /** R4.2b:仓库(铁匠铺重铸选件用) */
  inventory: ItemInstance[]
  /** R4.2b:待赎遗物(祠堂传承用) */
  pendingRelics: { item: ItemInstance; hero: string; redeem: number }[]
  /** R4.2b:重铸(铁匠铺 Lv1 起,装备+词条序号) */
  onRecast: (uid: string, rollIndex: number) => void
  /** R4.2b:遗物传承(祠堂 Lv1 起,遗物+继承者) */
  onInherit: (uid: string, memberId: string) => void
  trainSelId: string | null
  bondTotal: (m: Member) => number
  onBuyTraining: () => void
  /** scar 传渲染时捕获的对象:App 侧校验 scars[si]===scar,防陈旧索引误治(测试:stale-index treatment) */
  onHeal: (memberId: string, scarIndex: number, scar: import('../../sim/scars').Scar) => void
  onUpgrade: (buildingId: string) => void
  onSelectMember: (id: string) => void
  onChangeVocation: (memberId: string, specId: string) => void
  onAdvanceSpec: (memberId: string, skillId: string) => void
  onLearnAugment: (memberId: string, augmentId: string) => void
  onBack: () => void
}

export function BaseScreen(props: BaseScreenProps) {
  const { day, gold, blessing, members, busy, trainingReady, healingNotice, healingMastery, buildings, unlockedHybrids, trainSelId, inventory, pendingRelics, onBack } = props
  void busy
  // R4.2b:铁匠铺重铸/祠堂传承的本地选择态(纯 UI,扣费与校验在 App 处理器)
  const [recastUid, setRecastUid] = useState('')
  const [recastRollIdx, setRecastRollIdx] = useState(0)
  const [inheritSel, setInheritSel] = useState<Record<string, string>>({})
  const recastItem = inventory.find((i) => i.id === recastUid)
  return (
            <div className="screen-overlay fullpage">
              <div className="screen-panel">
                <div className="screen-head">
                  <h2>🏰 公会基地</h2>
                  <button className="screen-close" onClick={() => onBack()}>✕ Esc</button>
                </div>
        <div className="inv-panel">
          <h2>🏰 公会基地（第 {day} 日）</h2>
          <div className="potion-supply">
            <span>特权训练：150 金，下次远征所有胜场经验 +25%；资格可保存，出征使用一次。</span>
            <button disabled={trainingReady || gold < 150 || busy} onClick={props.onBuyTraining}>{trainingReady ? '✓ 已备好训练资格' : '购买特权训练（150 金）'}</button>
          </div>
          {healingNotice && <p className="hint" role="status">{healingNotice}</p>}
          {members.some((m) => m.alive && m.scars?.length) && (
            <div className="potion-supply">
              <span className="hint">🏥 疗养所(U32 稳定制)——治疗成功降一档:重度(120 金 + 3 祝福,成功率 65%)→轻度(60 金 + 1 祝福,85%)→虚痕(不减属性,静养 4 天自愈);轻度失败 15% 恶化,重度失败无效。每次治疗同维度熟练度 +5%,最多 +25%。当前熟练度:{Object.entries(healingMastery).map(([k, v]) => scarStatName(k as 'str') + ' + ' + Math.min(v * 5, 25) + '%').join(' · ') || '无'}</span>
              {members.filter((m) => m.alive && m.scars?.length).flatMap((m) =>
                (m.scars ?? []).map((sc, si) => (
                  <div key={m.id + '-' + si} className="tavern-row">
                    {sc.faint ? (
                      <span className="hint">{m.name}:{scarStatName(sc.stat)}虚痕(静养中——不减属性,第 {(sc.faintSince ?? 0) + FAINT_DAYS} 天消退)</span>
                    ) : (
                      <>
                        <span className="hint">{m.name}:{scarStatName(sc.stat)} -{sc.value}({sc.text})</span>
                        <button disabled={busy || gold < healingTerms(sc).gold || blessing < healingTerms(sc).blessing} onClick={() => props.onHeal(m.id, si, sc)}>
                          🏥 治疗（{healingTerms(sc).gold} 金 + {healingTerms(sc).blessing} 祝福，成功率 {Math.round(healingTerms(sc, healingMastery[sc.stat] ?? 0).rate * 100)}%）
                        </button>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
          {/* R4.2b 铁匠铺·重铸(设施各管玩法,redesign §6):Lv1 起,重掷一条词条数值 */}
          {(buildings.smithy ?? 0) >= 1 ? (
            <div className="potion-supply">
              <span className="hint">⚒ 铁匠铺·重铸——花 {ECONOMY.recastCost} 金把一件装备的一条词条数值重新锻造(词条方向不变,数值按品级口径重新起落;数值没变不收费)。</span>
              <div className="tavern-row">
                <select aria-label="重铸装备" value={recastUid} onChange={(e) => { setRecastUid(e.target.value); setRecastRollIdx(0) }}>
                  <option value="">选择装备…</option>
                  {inventory.map((i) => <option key={i.id} value={i.id}>{describeItem(i)}</option>)}
                </select>
              </div>
              {recastItem && (
                <div className="tavern-row">
                  <select aria-label="重铸词条" value={recastRollIdx} onChange={(e) => setRecastRollIdx(Number(e.target.value))}>
                    {recastItem.rolls.map((r, i) => <option key={i} value={i}>{AFFIXES[r.affixId]?.name ?? r.affixId}(现值 {r.value})</option>)}
                  </select>
                  <button disabled={busy || gold < ECONOMY.recastCost} onClick={() => props.onRecast(recastUid, recastRollIdx)}>
                    ⚒ 重铸（{ECONOMY.recastCost} 金）
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="hint">⚒ 铁匠铺升级到 1 级后解锁「重铸」:把一件装备的词条数值重新锻造。</p>
          )}
          {/* R4.2b 祠堂·遗物传承(设施各管玩法):Lv1 起,后辈以六成赎回费接走英灵遗物 */}
          {(buildings.shrine ?? 0) >= 1 ? (
            <div className="potion-supply">
              <span className="hint">🕯 祠堂·遗物传承——英灵的遗物由后辈接走(费用=赎回费的六成,入库后自行穿戴),继承者士气 +5。</span>
              {pendingRelics.length ? pendingRelics.map((r) => {
                const cost = Math.ceil(r.redeem * ECONOMY.inheritRelicRate)
                const heir = inheritSel[r.item.id] ?? members.find((m) => m.alive)?.id ?? ''
                return (
                  <div key={r.item.id} className="tavern-row">
                    <span className="hint">{r.hero} 的遗物:{describeItem(r.item)}</span>
                    <select aria-label={'传承给谁:' + describeItem(r.item)} value={heir} onChange={(e) => setInheritSel((q) => ({ ...q, [r.item.id]: e.target.value }))}>
                      {members.filter((m) => m.alive).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                    <button disabled={busy || !heir || gold < cost} onClick={() => props.onInherit(r.item.id, heir)}>
                      🕯 传承（{cost} 金）
                    </button>
                  </div>
                )
              }) : <p className="hint">没有等待传承的遗物。</p>}
            </div>
          ) : (
            <p className="hint">🕯 祠堂升级到 1 级后解锁「遗物传承」:让后辈以更轻的代价接走英灵的遗物。</p>
          )}
          <div className="base-grid">
            {BUILDINGS.map((def) => {
              const lv = buildings[def.id] ?? 0
              const maxed = lv >= def.maxLevel
              const cost = maxed ? null : def.costs[lv]
              const affordable = cost != null && gold >= cost.gold && blessing >= (cost.blessing ?? 0)
              return (
                <div key={def.id} className={`base-card${lv > 0 ? ' owned' : ''}`}>
                  <div className="base-head">
                    <span className="base-name">{def.icon} {def.name}</span>
                    <span className="base-lv">{lv > 0 ? 'Lv' + lv : '未建'}</span>
                  </div>
                  <p className="hint">{def.desc}</p>
                  {maxed ? (
                    <button disabled>已满级</button>
                  ) : (
                    <button disabled={busy || !affordable} onClick={() => props.onUpgrade(def.id)}>
                      升到 Lv{lv + 1}：{cost!.gold} 金{cost!.blessing ? ` + ${cost!.blessing} 祝福` : ''}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          <div className="voc-panel">
            <h2>⚔ 训练场 —— 行当更换</h2>
            <div className="voc-tabs">
              {members.filter((m) => m.alive).map((m) => (
                <button key={m.id} className={`voc-tab${trainSelId === m.id ? ' sel' : ''}`}
                  onClick={() => props.onSelectMember(m.id)}>
                  {m.name}<span className="hint"> {isHybrid(m.spec) ? HYBRIDS[m.spec!].name : specOf(m.job, m.spec).name}</span>
                </button>
              ))}
            </div>
            <p className="hint">
              换行当:{ECONOMY.vocation.switchGold} 金 + {ECONOMY.vocation.switchBlessing} 祝福。
              混合职阶首次解锁 {ECONOMY.vocation.hybridUnlockGold} 金 + {ECONOMY.vocation.hybridUnlockBlessing} 祝福,
              且要求本人默契 ≥ {ECONOMY.hybridBondRequirement} 星(共同远征积累)。🔒 = 公会尚未解锁该混合行当。
            </p>
            {members.filter((m) => m.alive && m.id === trainSelId).map((m) => {
              const cur = isHybrid(m.spec) ? HYBRIDS[m.spec!].name : specOf(m.job, m.spec).name
              const sameLine = Object.values(JOBS[m.job].specs).filter((sp) => sp.id !== m.spec)
              const bond = props.bondTotal(m)
              const canSwitch = !busy && gold >= ECONOMY.vocation.switchGold && blessing >= ECONOMY.vocation.switchBlessing
              return (
                <div key={m.id} className="voc-row">
                  <div className="voc-head">
                    <b>{m.name}</b>
                    <span className="hint">现为 {cur} · Lv{m.level} · 默契 {bond} 星</span>
                  </div>
                  <div className="voc-btns">
                    {sameLine.map((sp) => (
                      <details key={sp.id} className="voc-card">
                        <summary className={canSwitch ? '' : 'locked'} title={sp.identity}>
                          {sp.name}{m.spec === sp.id ? '(当前)' : ''}
                        </summary>
                        <div className="voc-card-body">
                          <p className="hint">{sp.identity}</p>
                          <p className="hint">{SPEC_PASSIVE_DESC[sp.passive ?? ''] ?? ''}{sp.statMods?.critChance ? ` 暴击 +${Math.round(sp.statMods.critChance * 100)}%。` : ''}</p>
                          <ul className="ms-list">
                            {sp.skills.map((sk) => <li key={sk.id}>{skillLine(sk, sk.weaponFamily)}</li>)}
                          </ul>
                          {SIGNATURE_SKILLS[sp.id] && (
                            <p className="hint">【招牌技】{SIGNATURE_SKILLS[sp.id].name}:{SIGNATURE_SKILLS[sp.id].desc}(冷却 {SIGNATURE_SKILLS[sp.id].cdTicks / 10} 秒)</p>
                          )}
                          {!canSwitch ? <p className="hint">⚠ 等级或资源不足,暂不能转职。</p> : (
                            <button disabled={!canSwitch} onClick={() => props.onChangeVocation(m.id, sp.id)}>转职为{sp.name}</button>
                          )}
                        </div>
                      </details>
                    ))}
                    {Object.values(HYBRIDS).map((hy) => {
                      const unlocked = unlockedHybrids.includes(hy.id)
                      const canBond = bond >= ECONOMY.hybridBondRequirement
                      const canPay = gold >= ECONOMY.vocation.hybridUnlockGold && blessing >= ECONOMY.vocation.hybridUnlockBlessing
                      // K04:种族不允许的混合线直接隐藏(硬规则,不给点了再拒绝的挫败)
                      const raceAllows = HYBRIDS[hy.id].lines.every((l) => RACES[m.race ?? 'human'].allowedLines.includes(l))
                      if (!raceAllows) return null
                      return (
                        <details key={hy.id} className="voc-card">
                          <summary className={canSwitch && canBond && (unlocked || canPay) ? '' : 'locked'}
                            title={hy.identity + (unlocked ? '' : '(首次解锁需额外花费)')}>
                            {hy.name}{unlocked ? '' : ' 🔒'}
                          </summary>
                          <div className="voc-card-body">
                            <p className="hint">{hy.identity}</p>
                            <ul className="ms-list">
                              {hy.skills.map((sk) => <li key={sk.id}>{skillLine(sk, sk.weaponFamily)}</li>)}
                            </ul>
                            {!canSwitch || m.spec === hy.id || !canBond || (!unlocked && !canPay) ? (
                              <p className="hint">{!canBond ? `需默契 ≥ ${ECONOMY.hybridBondRequirement} 星` : !unlocked && !canPay ? `首次解锁 ${ECONOMY.vocation.hybridUnlockGold} 金 + ${ECONOMY.vocation.hybridUnlockBlessing} 祝福` : ''}</p>
                            ) : (
                              <button disabled={!canSwitch} onClick={() => props.onChangeVocation(m.id, hy.id)}>转职为{hy.name}</button>
                            )}
                          </div>
                        </details>
                      )
                    })}
                  </div>
                  {!isHybrid(m.spec) && m.level >= 6 && (
                    <div className="voc-row2">
                      <span className="hint">精进:</span>
                      {(specOf(m.job, m.spec).advancedSkills ?? []).map((sk) => {
                        const chosen = m.specAdvanced?.[specOf(m.job, m.spec).id] === sk.id
                        const any = !!m.specAdvanced?.[specOf(m.job, m.spec).id]
                        return (
                          <button key={sk.id} disabled={any || busy || gold < ECONOMY.advancedCost.gold || blessing < ECONOMY.advancedCost.blessing} title={skillLine(sk, sk.weaponFamily)} onClick={() => props.onAdvanceSpec(m.id, sk.id)}>
                            {sk.name}{chosen ? ' ✓' : ''}
                          </button>
                        )
                      })}
                      {m.specAdvanced?.[specOf(m.job, m.spec).id] ? <span className="hint">已精进</span> : null}
                    </div>
                  )}
                  <div className="voc-row2">
                    <span className="hint">通用战技:</span>
                    {(Object.entries(ECONOMY.augments) as [string, { name: string; desc: string }][]).map(([id, ag]) => {
                      const learned = m.augments?.includes(id)
                      return (
                        <button key={id} disabled={busy || !!learned || blessing < ECONOMY.augmentCost} title={ag.desc} onClick={() => props.onLearnAugment(m.id, id)}>
                          {ag.name}{learned ? ' ✓' : ' ' + ECONOMY.augmentCost + '🕯'}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
              </div>
            </div>
            </div>
  )
}
