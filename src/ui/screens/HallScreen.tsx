import { ArtCanvas } from '../art/ArtCanvas'
import { HUB_DOCK, type Screen } from '../screens'
import { DOCK_UNLOCK_DAY } from '../../data/tutorial'
import { DOCK_ART } from '../art/catalog'
import { FIRST_RETURN_TIP } from '../../data/tutorial'
import { guildRankOf } from '../../sim/rank'
import { kingdomRank, kingdomTrust } from '../../sim/kingdom'
import { COMMISSIONS } from '../../data/kingdom'
import { guildGoals } from '../../sim/goals'

import type { Member } from '../../sim/types'

// R5.2c(U33⑦):大厅本体(顶栏/功能坞/目标/王国链接/高塔入口/快捷键/重开)自 App.tsx 迁出。
// 功能屏挂载以 children 传入(处理器留 App,行为零变)。
export function HallScreen(props: {
  screen: Screen
  day: number
  /** #4.4 宿舍:名册上限(6+每级1) */
  rosterCap: number
  gold: number
  blessing: number
  members: Member[]
  potions: { heal: number; fury: number }
  muted: boolean
  volume: number
  towerBest: number
  towerUnlocked: boolean
  canExpedition: boolean
  busy: boolean
  kingdom: import('../../sim/kingdom').KingdomState
  dungeonMastery: Record<string, number>
  inventory: import('../../sim/types').ItemInstance[]
  expedition: Member[]
  manual: string[]
  hintsSeen: string[]
  playtest: boolean
  dockUnlocked: (key: 'kingdom' | 'roster' | 'tavern' | 'warehouse' | 'base' | 'chronicle' | 'memorial' | 'manual' | 'expedition' | 'statistics') => boolean
  go: (to: Screen) => void
  enterTower: () => void
  restartAsk: () => void
  initAudio: () => void
  setMuted: (v: boolean) => void
  toggleMute: () => boolean
  setVolume: (v: number) => void
  setVolumeState: (v: number) => void
  exportPlaytestReport: () => void
  makeWarReportCard: () => void
  dismissHint: (id: string) => void
  children?: React.ReactNode
}) {
  const { screen, day, rosterCap, gold, blessing, members, potions, muted, volume, towerBest, towerUnlocked, canExpedition, busy, kingdom, dungeonMastery, inventory, expedition, manual, hintsSeen, go } = props
  return (
    <div className="panel hub-panel">
          <div className="hub-topbar">
            <span className="hub-title">🏰 黑苔公会</span>
            <span>第 {day} 日</span>
            <span>💰 {gold}</span>
            <span>🕯 {blessing}</span>
            <span>👥 {members.filter((m) => m.alive).length}/{rosterCap}</span>
            <span>🧪 {potions.heal}</span>
            <span>⚡ {potions.fury}</span>
            <span className="tb-volume">
              <button className="tb-mute" aria-label={muted ? "开启声音" : "静音"} title={muted ? "开启声音" : "静音"} onClick={() => { props.initAudio(); props.setMuted(props.toggleMute()) }}>{muted ? '🔇' : '🔊'}</button>
              <input className="tb-volume-slider" type="range" min={0} max={100} value={Math.round(volume * 100)} aria-label="主音量" title="主音量"
                onChange={(e) => { props.initAudio(); const v = Number(e.target.value) / 100; props.setVolume(v); props.setVolumeState(v); if (muted) props.setMuted(props.toggleMute()) }} />
              {props.playtest && <button className="tb-mini" title="导出试玩记录 JSON" onClick={() => { props.initAudio(); props.exportPlaytestReport() }}>📤</button>}
              {props.playtest && <button className="tb-mini" title="生成战报卡 PNG" onClick={() => { props.initAudio(); props.makeWarReportCard() }}>📷</button>}
            </span>
          </div>
          <h2>公会大厅</h2>
          <div className="hub-dock">
            {HUB_DOCK.map((it) => {
              const unlockDay = DOCK_UNLOCK_DAY[it.key] ?? 1
              const locked = !props.dockUnlocked(it.key)
              return (
              <button
                key={it.key}
                disabled={busy || locked}
                className={`dock-btn${screen === it.key ? ' open' : ''}`}
                onClick={() => go(screen === it.key ? 'hall' : it.key)}
              >
                <span className="dock-icon"><ArtCanvas paths={[DOCK_ART[it.key] ?? '/assets/icons/book.png']} label="" size={32} /></span>
                <span className="dock-label">{locked ? `${it.label}·第${unlockDay}天` : it.label}</span>
                <span className="dock-key">{locked ? '🔒' : it.hotkey}</span>
              </button>
              )
            })}
          </div>
          {(() => {
            const masteryTotal = Object.values(dungeonMastery).reduce((a, b) => a + b, 0)
            const goals = guildGoals({ members, inventory, manual, expedition, towerBest, masteryTotal, kingdomDone: kingdom.completed.length })
            const cur = goals.find((g) => !g.done)
            const rank = guildRankOf(manual)
            const showFirstReturnTip = hintsSeen.includes('first-return-done') && !hintsSeen.includes('first-return-tip-done')
            return (
              <>
                {showFirstReturnTip && (
                  <div className="first-return-tip">
                    <span>💡 {FIRST_RETURN_TIP}</span>
                    <button onClick={() => props.dismissHint('first-return-tip-done')}>知道了</button>
                  </div>
                )}
                <p className="hub-goal">
                  🏅 公会位阶:{rank.name}{rank.promotion
                    ? ` —— 晋升委托:${rank.promotion.text}`
                    : '(位阶完整版随首轮试玩反馈开启)'}
                </p>
                <p className="hub-goal">
                  📋 当前目标:{cur ? cur.text : '全部达成!'}{cur?.progress ? `(${cur.progress})` : ''}
                </p>
                {/* #6.2 目标链可视化:已完成/当前/未来三态,折叠不占大厅空间 */}
                <details className="hub-goal-chain">
                  <summary className="hint">🗺 目标链({goals.filter((g) => g.done).length}/{goals.length} 已达成)</summary>
                  {goals.map((g) => {
                    const isCur = g === cur
                    return (
                      <div key={g.id} className="hint" style={{ paddingLeft: 12, color: g.done ? '#8d9b62' : isCur ? '#dcba87' : '#6b6b6b' }}>
                        {g.done ? '✓' : isCur ? '→' : '🔒'} {g.text}{g.progress ? `(${g.progress})` : ''}
                      </div>
                    )
                  })}
                </details>
              </>
            )
          })()}
          <button className="royal-hub-link" disabled={busy || !props.dockUnlocked('kingdom')} onClick={() => go('kingdom')}>
            <span>♜ {kingdomRank(kingdom).name} · 信任 {kingdomTrust(kingdom)}</span>
            <span>{!props.dockUnlocked('kingdom') ? '第 4 天开放' : kingdom.active.some((r) => r.progress >= COMMISSIONS.find((q) => q.id === r.id)!.objective.target)
              ? '有委托可交付 →' : kingdom.active.length ? `在办委托 ${kingdom.active.length}/2 · 查看进度 →` : kingdom.completed.length === COMMISSIONS.length ? '本批委托已结案 · 回信档案 →' : '王国来函 · 查看委托 →'}</span>
          </button>
          <div className="inv-panel tower-entry">
            <h2>🗼 黑苔高塔 —— 最高纪录 第 {towerBest} 层</h2>
            <p className="hint">
              逐层深入，敌人逐层变强；每 3 层遭遇守塔 boss。第 5 层起药水减半，
              <b style={{ color: '#d48f8f' }}>第 9 层起撤退保护失效</b>。奖励逐层立即入账，随时可带着离开。
            </p>
            <p className="hint">
              ⚔ 大秘境：守塔 boss 必掉装备，层数越深奖励越厚。纪录只认亲手挑战——挂机者不受青史留名。
            </p>
            {towerUnlocked ? (
              <button className="branch-btn primary" disabled={!canExpedition} onClick={props.enterTower}>
                🗼 进入高塔（从第 1 层开始）
              </button>
            ) : (
              <p className="hint">🔒 击败深渊祭司·塔尔玛后解锁</p>
            )}
          </div>
          <p className="hint hub-keys">
            快捷键:Q 王国委托 · C 花名册 · T 酒馆 · B 仓库 · N 基地 · J 大事记 · H 名人堂 · K 手册 · Esc 关闭
          </p>
          <div className="end-actions">
            <button onClick={props.restartAsk}>☠ 重开公会</button>
          </div>{props.children}
        </div>
  )
}
