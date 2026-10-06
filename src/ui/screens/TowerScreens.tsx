import type { BattleState, Stance } from '../../sim/types'
import type { TowerRun } from '../../sim/tower'
import { STANCE_NAME, setStance, setFocus, useHealPotion, useFuryPotion, orderRetreat, stepBattle } from '../../sim/combat'
import { towerFloorIsBoss, insureNextTowerFloor } from '../../sim/tower'

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
        <button
          className={battle.commands.autoMode ? 'active' : ''}
          onClick={() => props.cmdTower((b) => { b.commands.autoMode = !b.commands.autoMode; if (props.towerRunRef.current) props.towerRunRef.current.autoMode = b.commands.autoMode }, true)}
        >
          🤖 挂机{battle.commands.autoMode ? '中（自动深入）' : ''}
        </button>
        <span className="cmd-label">│</span>
        <span className="cmd-label">阵型</span>
        {(Object.keys(STANCE_NAME) as Stance[]).map((st) => (
          <button
            key={st}
            className={
              (battle.commands.stance === st ? 'active' : '') +
              (intents?.telegraphing && st === 'spread' ? ' urgent' : '')
            }
            disabled={battle.commands.autoMode}
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
          disabled={battle.commands.autoMode || battle.commands.healStock <= 0 || battle.commands.healCd > 0}
        >
          💊 治疗药×{battle.commands.healStock}
        </button>
        <button
          onClick={() => {
            props.sfxCmd()
            props.cmdTower((b) => useFuryPotion(b))
          }}
          disabled={battle.commands.autoMode || battle.commands.furyStock <= 0 || battle.commands.furyCd > 0}
        >
          ⚡ 爆发药×{battle.commands.furyStock}
        </button>
        {intents?.casting && intents.casterId && !battle.commands.autoMode && (
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
  return (
    <>
      <h2>🗼 第 {towerRun.floor} 层突破</h2>
      <div className="result-banner win">
        幸存者回复 20% 生命。第 9 层起撤退保护失效——量力而行。
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
