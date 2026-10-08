// 作战板(U29 R2-5 自 App.tsx 迁出;行为零变):远征出发界面——版图/副本选择+编制检查
// #5.1 悬赏加码条款(U38 批次 5):接副本时自选、可叠加、奖励乘算——难度由玩家主动出价。
import { REGIONS, dungeonLock, nextRegionLocked } from '../../data/regions'
import { playtestAllows } from '../../data/regions'
import { DUNGEONS } from '../../data/dungeons'
import { BOUNTY_CLAUSES, clauseRewardMult } from '../../sim/bounty-clause'

interface ExpeditionBoardProps {
  dungeonId: string
  manual: string[]
  expeditionCount: number
  activeDungeonSize: number
  activeDungeonName: string
  canExpedition: boolean
  busy: boolean
  playtestMode: boolean
  /** #5.1 已勾选条款(出发时锁定进 run;保留勾选方便连刷) */
  bountyClauses: string[]
  onToggleClause: (id: string) => void
  onSelectDungeon: (id: string) => void
  onDepart: () => void
}

export function ExpeditionBoard(props: ExpeditionBoardProps) {
  const { dungeonId, manual, expeditionCount, activeDungeonSize, activeDungeonName, canExpedition, busy, playtestMode, bountyClauses } = props
  const mult = clauseRewardMult(bountyClauses)
  return (
    <>
      <h2>⚔ 作战板</h2>
      <p style={{ color: '#7a8191', marginBottom: 10 }}>
        地图每趟随机生成，逐层选路——每一层的模样由你的熟练度决定（首打一片漆黑）。血量全程延续，
        <b style={{ color: '#d48f8f' }}>战斗死亡即永久牺牲</b>，团灭将失去整支远征队。
      </p>
      <div className="dungeon-picker">
        {REGIONS.filter((rg) => !playtestMode || rg.order === 1).map((rg) => {
          const regionDungeons = DUNGEONS.filter((d) => [...rg.main, ...rg.side, rg.finale].includes(d.id))
          const ordered = [...rg.main, ...rg.side, rg.finale].map((id) => regionDungeons.find((d) => d.id === id)!).filter(Boolean)
          return (
            <div key={rg.id} className="region-block">
              <p className="region-name">🗺 {rg.name}</p>
              <div className="region-dungeons">
                {ordered.map((d) => {
                  const lock = dungeonLock(d.id, manual)
                  return (
                    <button
                      key={d.id}
                      className={d.id === dungeonId ? 'active' : ''}
                      disabled={busy || !!lock || !playtestAllows(d.id)}
                      title={lock ?? undefined}
                      onClick={() => props.onSelectDungeon(d.id)}
                    >
                      🗺 {d.name}{d.size > 3 ? `（${d.size} 人团本）` : ''}{lock || !playtestAllows(d.id) ? ' 🔒' : ''}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
        {nextRegionLocked(manual) && (
          <p className="hint">🔒 下一版图:{nextRegionLocked(manual)}</p>
        )}
      </div>
      {/* #5.1 悬赏加码:自选可叠加,奖励乘算——难度由玩家主动出价,而非系统强加 */}
      <div className="bounty-clauses" role="group" aria-label="悬赏加码条款">
        <p className="hint" style={{ margin: '10px 0 4px' }}>
          📜 悬赏加码(可叠加)——给自己上难度,王国就多付钱:
          {bountyClauses.length > 0 && <b style={{ color: '#dcba87' }}> 当前奖励 ×{mult.toFixed(2)}</b>}
        </p>
        {BOUNTY_CLAUSES.map((c) => {
          const on = bountyClauses.includes(c.id)
          return (
            <button
              key={c.id}
              className={on ? 'active' : ''}
              disabled={busy}
              title={c.desc}
              style={on ? { borderColor: '#dcba87' } : undefined}
              onClick={() => props.onToggleClause(c.id)}
            >
              {c.icon} {c.name} ×{c.rewardMult}{on ? ' ✓' : ''}
            </button>
          )
        })}
      </div>
      <button
        className="branch-btn primary"
        disabled={!canExpedition}
        onClick={props.onDepart}
      >
        ⚔ 出发:{activeDungeonName}{bountyClauses.length > 0 ? `(加码 ×${mult.toFixed(2)})` : ''}——每趟地图随机生成(U27①),在地图上逐层选路
      </button>
      {!canExpedition && (
        <p style={{ color: '#d48f8f' }}>
          {expeditionCount < activeDungeonSize
            ? `编制不足（${expeditionCount}/${activeDungeonSize}）：去花名册编入队员，或去酒馆招募。`
            : ''}
        </p>
      )}
    </>
  )
}
