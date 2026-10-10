import type { TowerRun } from '../../sim/tower'
import { insureNextTowerFloor } from '../../sim/tower'
import { TOWER_RULES } from '../../sim/tower-rule'
import { describeItem } from '../../sim/loot'
import { MONSTER_AFFIXES } from '../../sim/monster-affix'

// R5.2c(U33⑦):高塔三屏(战斗/休整投保/终局)自 App.tsx 迁出——行为零变,处理器留 App。

export function TowerRestScreen(props: {
  towerRun: TowerRun
  gold: number
  setGold: (f: (g: number) => number) => void
  towerRunRef: { current: TowerRun | null }
  setTowerRun: (t: TowerRun) => void
  day: number
  towerNextFloor: () => void
  leaveTower: () => void
  /** B3-5 收手界面:队伍状态(花名册) */
  members: import('../../sim/types').Member[]
}) {
  const { towerRun, members } = props
  const insure = () => {
    const t = props.towerRunRef.current
    if (!t) return
    const premium = insureNextTowerFloor(t, props.gold)
    if (!premium) return
    props.setGold((g) => g - premium)
    props.setTowerRun({ ...t })
    // R4.1(U34 Q1):投保流水不再进大事记(按钮态「已投保」即状态本身)
  }
  // B3-5 收手界面:累计战利品/队伍状态同屏——「何时收手」是塔的全部乐趣
  const pending = towerRun.pendingLoot
  const drops = towerRun.pendingDrops ?? []
  // B3-4 侦查分级:当前段规则+已遇词缀情报(熟练/情报封锁定级 U22)
  const segment = Math.floor((towerRun.floor - 1) / 3)
  const rules = towerRun.ruleHistory?.[segment] ?? []
  const affixesSeen = Object.entries(towerRun.monsterAffixes ?? {}).flatMap(([floor, ids]) => ids.map((id) => ({ floor: Number(floor), id })))
  const intel = affixesSeen.length
    ? `已侦获词缀:${[...new Set(affixesSeen.map((a) => a.id))].map((id) => MONSTER_AFFIXES[id as keyof typeof MONSTER_AFFIXES]?.name ?? id).join('/')}(第 ${affixesSeen.map((a) => a.floor).join(',')} 层)`
    : '尚无词缀情报——遇到带词缀的敌人后才会记录'
  return (
    <>
      <h2>🗼 第 {towerRun.floor} 层突破</h2>
      <div className="result-banner win">
        幸存者回复 {rules.includes('no-camp') ? 0 : 20}% 生命(第 9 层起撤退保护失效——量力而行)
      </div>
      <div className="potion-supply" data-testid="tower-intel">
        <span className="hint">🔭 本段(第 {segment * 3 + 1}–{segment * 3 + 3} 层)规则:{rules.length ? rules.map((r) => TOWER_RULES[r as keyof typeof TOWER_RULES].name).join('、') : '常规'}{rules.includes('no-camp') ? '——本段休整不回血!' : ''}</span>
        <span className="hint">🕵 {intel}</span>
      </div>
      <div className="potion-supply" data-testid="tower-pending">
        <span className="hint">💰 累计战利品:{pending.gold} 金 · {pending.exp} 经验 · {drops.length} 件装备——收手时全额兑现,团灭只剩两成{towerRun.insuredFloor ? '(本层已投保:团灭可保六成)' : ''}</span>
        {drops.length > 0 && <span className="hint">🎁 待兑现:{drops.map((d) => describeItem(d)).join('、')}</span>}
        <span className="hint">🩸 队伍:{partyHp(towerRun, members)}</span>
      </div>
      <div className="end-actions">
        <button onClick={insure}
          disabled={props.gold < (towerRun.floor + 1) * 40 || towerRun.insuredNextFloor === towerRun.floor + 1}
        >
          {towerRun.insuredNextFloor === towerRun.floor + 1 ? '✓ 下一层已投保' : `🛡 投保第 ${towerRun.floor + 1} 层（${(towerRun.floor + 1) * 40} 金，阵亡装备免赎回）`}
        </button>
        <button onClick={props.towerNextFloor}>⬆ 深入第 {towerRun.floor + 1} 层</button>
        <button onClick={props.leaveTower}>🏰 带着 {towerRun.pendingLoot.gold} 金收手</button>
      </div>
    </>
  )
}

export function TowerEndedScreen({ towerRun, leaveTower }: {
  towerRun: TowerRun
  leaveTower: () => void
}) {
  return (
    <>
      <h2>塔内征程结束</h2>
      <div className={`result-banner ${towerRun.result === 'defeated' ? 'wipe' : 'win'}`}>
        {towerRun.result === 'defeated'
          ? '✝ 高塔吞没了远征队——已得奖励保留，阵亡者入纪念堂'
          : '🏰 你带着收获离开了高塔'}
      </div>
      <div className="end-actions">
        <button onClick={leaveTower}>← 返回公会</button>
      </div>
    </>
  )
}

function partyHp(run: { party: { memberId: string; hp: number }[] }, members: import('../../sim/types').Member[]): string {
  return run.party.map((p) => {
    const m = members.find((x) => x.id === p.memberId)
    return m ? `${m.name} ${p.hp}/${m.hp}` : ''
  }).filter(Boolean).join(' · ')
}
