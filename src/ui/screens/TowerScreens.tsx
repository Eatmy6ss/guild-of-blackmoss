import type { BattleState, Stance } from '../../sim/types'
import type { TowerRun } from '../../sim/tower'
import { STANCE_NAME, setStance, setFocus, useHealPotion, useFuryPotion, orderRetreat, stepBattle } from '../../sim/combat'
import { towerFloorIsBoss, insureNextTowerFloor } from '../../sim/tower'
import { TOWER_RULES } from '../../sim/tower-rule'
import { MONSTER_AFFIXES } from '../../sim/monster-affix'

// R5.2c(U33⑦):高塔三屏(战斗/休整投保/终局)自 App.tsx 迁出——行为零变,处理器留 App。

export function TowerBattleScreen(props: {
  towerRun: TowerRun
  battle: BattleState
  intents: { telegraphing: boolean; casting: boolean; casterId?: string } | null
  towerRunning: boolean
  cmdTower: (fn: (b: BattleState) => void, force?: boolean) => void
  sfxCmd: () => void
  towerRunRef: { current: TowerRun | null }
  setTowerRunning: (v: boolean | ((v: boolean) => boolean)) => void
  drainAndSync: (b: BattleState) => void
}) {
  const { towerRun, battle, intents, towerRunning } = props
  const stepTenLocal = () => {
    const current = props.towerRunRef.current?.battle
    if (!current || current.status !== 'running') return
    props.setTowerRunning(false)
    for (let i = 0; i < 10 && current.status === 'running'; i++) stepBattle(current)
    props.drainAndSync(current)
  }
  return (
    <>
      <h2>🗼 黑苔高塔 · 第 {towerRun.floor} 层{towerFloorIsBoss(towerRun.floor) ? '（守塔者）' : ''}</h2>
      <div className="cmd-bar">
        <span className="cmd-label">│</span>
        <span className="cmd-label">阵型</span>
        {(Object.keys(STANCE_NAME) as Stance[]).map((st) => (
          <button
            key={st}
            className={
              (battle.commands.stance === st ? 'active' : '') +
              (intents?.telegraphing && st === 'spread' ? ' urgent' : '')
            }
            disabled={false}
            onClick={() => {
              props.sfxCmd()
              props.cmdTower((b) => setStance(b, st))
            }}
          >
            {STANCE_NAME[st]}
          </button>
        ))}
        <span className="cmd-label">│</span>
        <button
          onClick={() => {
            props.sfxCmd()
            props.cmdTower((b) => useHealPotion(b))
          }}
          disabled={false || battle.commands.healStock <= 0 || battle.commands.healCd > 0}
        >
          💊 治疗药×{battle.commands.healStock}
        </button>
        <button
          onClick={() => {
            props.sfxCmd()
            props.cmdTower((b) => useFuryPotion(b))
          }}
          disabled={false || battle.commands.furyStock <= 0 || battle.commands.furyCd > 0}
        >
          ⚡ 爆发药×{battle.commands.furyStock}
        </button>
        {intents?.casting && intents.casterId && !false && (
          <button
            className="urgent"
            onClick={() => {
              if (!intents?.casterId) return
              props.sfxCmd()
              props.cmdTower((b) => setFocus(b, intents.casterId))
            }}
          >
            ⚔ 打断咏唱！
          </button>
        )}
        <button
          className="focus-tag"
          onClick={() => {
            props.sfxCmd()
            props.cmdTower((b) => orderRetreat(b))
          }}
        >
          🏳 撤退令
        </button>
      </div>
      <div className="enc-row">
        <button onClick={() => props.setTowerRunning((r) => !r)} disabled={battle.status !== 'running'}>
          {towerRunning ? '⏸ 暂停' : '⏵ 继续'}
        </button>
        <button onClick={stepTenLocal} disabled={battle.status !== 'running'}>
          ⏭ ×10 tick
        </button>
        <span className="tick-info">tick {battle.tick}</span>
        <span className="tick-info">· 塔内金币已入账 {towerRun.goldEarned}{towerRun.insuredFloor ? ' · 🛡 本层已投保' : ''}</span>
      </div>
      <div className="log-box">
        {battle.log.map((entry, i) => (
          <div key={i} className={`log-${entry.kind}`}>
            <span className="log-tick">[{entry.tick}]</span>
            {entry.text}
          </div>
        ))}
      </div>
    </>
  )
}

export function TowerRestScreen(props: {
  towerRun: TowerRun
  gold: number
  setGold: (f: (g: number) => number) => void
  towerRunRef: { current: TowerRun | null }
  setTowerRun: (t: TowerRun) => void
  day: number
  towerNextFloor: () => void
  leaveTower: () => void
}) {
  const { towerRun } = props
  const insure = () => {
    const t = props.towerRunRef.current
    if (!t) return
    const premium = insureNextTowerFloor(t, props.gold)
    if (!premium) return
    props.setGold((g) => g - premium)
    props.setTowerRun({ ...t })
    // R4.1(U34 Q1):投保流水不再进大事记(按钮态「已投保」即状态本身)
  }
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
      <div className="end-actions">
        <button onClick={insure}
          disabled={props.gold < (towerRun.floor + 1) * 40 || towerRun.insuredNextFloor === towerRun.floor + 1}
        >
          {towerRun.insuredNextFloor === towerRun.floor + 1 ? '✓ 下一层已投保' : `🛡 投保第 ${towerRun.floor + 1} 层（${(towerRun.floor + 1) * 40} 金，阵亡装备免赎回）`}
        </button>
        <button onClick={props.towerNextFloor}>⬆ 深入第 {towerRun.floor + 1} 层</button>
        <button onClick={props.leaveTower}>🏰 带着奖励离开</button>
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
