import { useState } from 'react'
import type { DungeonRun } from '../../sim/run'
import { REST_HEAL_PCT, revealTier, MASTERY, currentNode, mapOptions, bossSequence, nextBossEncounter } from '../../sim/run'
import { revealPenaltyLayers } from '../../sim/conditions'
import { clauseLabels, clauseRewardMult } from '../../sim/bounty-clause'
import { nodeById, publicMapEdges, TERRAIN_NAMES, type MapNode } from '../../sim/dungeon-map'
import { runDungeon } from '../../sim/run-core'
import { describeItem } from '../../sim/loot'
import { activeConditions, restHealMult } from '../../sim/conditions'
import { ROUTE_CONDITIONS } from '../../data/conditions'
import { terrainRewardOf } from '../../data/terrain-rewards'
import type { ItemInstance } from '../../sim/types'

// 副本地图界面:分层节点+连线，陌生路线显示问号，已走路径保留；暗道按揭示档位显示。
// 悬停浮出情报框(类型/路况/敌人名,按 R1.3 四档揭示)。DOM/CSS 实现,不加美术负担。
// 独立文件是工单红线:地图界面不放 App.tsx。

interface MapScreenProps {
  run: DungeonRun
  mastery: number
  /** 酒馆情报提供本趟临时侦察，每点提前揭示一档，不增加永久熟练度。 */
  revealBonus?: number
  /** U36:该副本的已获情报清单(假情报照常显示,验证后才标真伪) */
  intelEntries?: import('../../sim/intel').IntelEntry[]
  drops: ItemInstance[]
  /** 最近一次节点选择的可见后果(休整/宝箱/挂机代选事件),选下一条路时刷新 */
  notice?: string | null
  onChoose: (nodeId: string) => void
  onRetreat: () => void
}

const KIND_LABEL: Record<MapNode['kind'], string> = {
  battle: '⚔ 战斗',
  elite: '☠ 精英·掉落翻倍',
  event: '❓ 事件',
  rest: '⛺ 休整·额外回复',
  treasure: '🎁 宝箱·无战斗',
  secret: '🕳 暗道·跳过一层',
  boss: '👑 Boss·依次连战',
}

const KIND_ICON: Record<MapNode['kind'], string> = {
  battle: '⚔',
  elite: '☠',
  event: '❓',
  rest: '⛺',
  treasure: '🎁',
  secret: '🕳',
  boss: '👑',
}

export function MapScreen({ run, mastery, revealBonus = 0, intelEntries = [], drops, notice, onChoose, onRetreat }: MapScreenProps) {
  const dungeon = runDungeon(run)
  const cur = currentNode(run)
  // 四档:0 未探索全盲 / 1 相邻类型+前两层地形 / 2 前两层详情 / 3 全图与暗道。
  const tier = revealTier(mastery, revealBonus, revealPenaltyLayers(run))
  const intel = intelEntries.filter((e) => e.dungeonId === run.dungeonId)
  const curLayer = cur?.layer ?? -1
  const pathSet = new Set(run.path)
  const visited = (n: MapNode): boolean => pathSet.has(n.id) || n.id === run.nodeId
  const kindVisible = (n: MapNode): boolean =>
    visited(n) || tier >= 3 || (tier === 2 ? n.layer <= curLayer + 2 : tier === 1 && n.layer <= curLayer + 1)
  const contentVisible = (n: MapNode): boolean => visited(n) || tier >= 2 && (tier >= 3 || n.layer <= curLayer + 2)
  const bossCount = bossSequence(dungeon).length
  const bossLeft = cur?.kind === 'boss' ? nextBossEncounter(run) : null
  const opts = mapOptions(run)
  const availableIds = new Set(opts.map((o) => o.id))
  const walkedEdges = new Set(run.path.slice(0, -1).map((a, i) => `${a}->${run.path[i + 1]}`))
  const totalLayers = run.map.layers.length
  const layerLabel = cur ? `第 ${cur.layer + 1}/${totalLayers} 层` : '入口'
  const [hoverId, setHoverId] = useState<string | null>(null)

  // 节点坐标(纯百分比,免测量):层 y=(i+0.5)/H;层内第 j/m 个 x=(j+1)/(m+1)
  const H = run.map.layers.length
  const nodePos = (n: MapNode): { x: number; y: number } => {
    const layer = run.map.layers[n.layer]!
    return { x: ((n.layer + 0.5) / H) * 100, y: ((layer.indexOf(n) + 1) / (layer.length + 1)) * 100 }
  }
  const nodeByIdIn = (id: string) => nodeById(run.map, id)

  // 2026-10-07 用户修订：低熟练度的当前可选和后续未探索节点均未知。
  // 地形/路名也遵守可见范围，不能用名称泄露远处的营地、宝箱或怪物。
  const describe = (n: MapNode): { title: string; sub: string } => {
    if (fullMask(n)) return { title: '未知岔路', sub: '迷雾笼罩,什么都看不见' }
    if (!kindVisible(n)) return { title: TERRAIN_NAMES[n.terrain], sub: '只能辨认地形,具体遭遇仍未知' }
    const encounterName = n.encounterId
      ? dungeon.encounters.find((e) => e.id === n.encounterId)?.name
      : undefined
    const cv = contentVisible(n)
    return {
      title: n.name,
      sub: `${KIND_LABEL[n.kind]} · ${TERRAIN_NAMES[n.terrain]}${cv && encounterName ? ` —— ${encounterName}` : ''}`,
    }
  }
  // 迷途(U27②)发作时:下一层的选项整体全盲——不是降一档,是一片漆黑(制作人 2026-10-04 定稿)
  const penalty = revealPenaltyLayers(run)
  // R5.1b 迷途的好处:后两层若有暗道,无视档位直接显示
  const lostReveals = activeConditions(run).some((c) => c.upside?.secretReveal)
  // U33⑧④:暗道在档 <3 时完全不显示(既没有「???」也没有跳层线)
  const secretHidden = (n: MapNode): boolean =>
    n.kind === 'secret' && !visited(n) && tier < 3 && !(lostReveals && n.layer <= curLayer + 2)
  // 走过的路保持已知；迷途遮住下一层，低档全盲，中档只逐步看清近处。
  const fullMask = (n: MapNode): boolean => {
    if (visited(n)) return false
    if (secretHidden(n)) return true
    if (penalty > 0 && n.layer === curLayer + 1) return true
    return tier === 0 || tier < 3 && n.layer > curLayer + 2
  }
  const hovered = hoverId ? nodeByIdIn(hoverId) : undefined
  const hoveredRisks = hovered && !fullMask(hovered) && contentVisible(hovered)
    ? ROUTE_CONDITIONS.filter((c) => c.trigger === 'terrain' && c.from?.includes(hovered.terrain) && !activeConditions(run).some((a) => a.id === c.id))
    : []
  // 回报/风险同样遵守迷雾，不能在问号节点的悬停框提前泄露。
  const hoveredReward = hovered && !fullMask(hovered) && contentVisible(hovered) ? terrainRewardOf(hovered.terrain) : undefined
  const bossName = bossLeft && (tier >= 2 ? dungeon.encounters.find(e => e.id === bossLeft)?.name : '❓ 未知对手')

  return (
    <>
      <h2>{dungeon.name} · 地图（{layerLabel}）</h2>
      {/* U36:已获情报清单——真假混着看,走过一趟才验证 */}
      {intel.length > 0 && (
        <ul className="intel-list" aria-label="已获情报">
          {intel.map((e) => (
            <li key={e.id} className="intel-item">
              <span className="intel-kind">{e.kind === 'boss' ? '👑' : '🗡'}</span>
              <span className="intel-text">{e.text}</span>
              <span className="intel-flag">{e.verified === undefined ? '未验证' : e.real ? '✓ 属实' : '✗ 假货'}</span>
            </li>
          ))}
        </ul>
      )}
      {run.battle && run.phase === 'rest' && (
        <>
          <div className="result-banner win">
            战斗胜利 · 幸存者回复 {Math.round(REST_HEAL_PCT * 100)}% 生命。选一条路继续。
          </div>
          {drops.length > 0 && (
            <div className="inv-panel">
              {drops.map((i) => (
                <div key={i.id} className="inv-item">
                  🎁 {describeItem(i)}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {!run.battle && (
        <div className="result-banner win">
          队伍已进入{dungeon.name}。第一层有 {opts.length} 条路——选一条,不选路不能前进。
        </div>
      )}
      {notice && (
        <div className="result-banner win" role="status">{notice}</div>
      )}
      {(() => {
        const conds = activeConditions(run)
        if (conds.length === 0) return null
        return (
          <div className="inv-panel" role="status">
            <h2>🌫 路况状态(持续到本趟结束)</h2>
            {conds.map((c) => (
              <div key={c.id} className="inv-item">
                <b>{c.name}</b> —— {c.desc}
              </div>
            ))}
            {restHealMult(run) < 1 && <p className="hint" style={{ opacity: 0.7 }}>当前休整回复:{Math.round(REST_HEAL_PCT * restHealMult(run) * 100)}%</p>}
          </div>
        )
      })()}
      <div className="route-choice">
        <p className="hint">
          熟练度 {mastery} —— {tier === 0 ? `前方都是未知岔路，走过才会记下。熟练度 ${MASTERY.KIND} 起辨认邻近路线。` : tier === 1 ? `能辨认相邻路线的类型和前两层的地形。熟练度 ${MASTERY.FULL} 起看清前两层的详情。` : tier === 2 ? `前两层的遭遇和地形风险已可辨认。熟练度 ${MASTERY.MASTER} 起看清全图与暗道。` : '这张图你闭着眼都能走，暗道也藏不住。'}
          {revealBonus > 0 && ' 情报侦察：本趟提前揭示一档，不增加永久熟练度。'}
          {penalty > 0 && ' 迷途:下一层的选项一片漆黑。'}
        </p>
        {cur?.kind === 'boss' && bossLeft ? (
          <>
            <p className="hint">深处的气息近了——<b style={{ color: '#d48f8f' }}>{bossName}</b> 就在前方{bossCount > 1 ? '（Boss 依次连战）' : ''}。</p>
            <div className="end-actions">
              <button className="primary" onClick={() => onChoose(run.nodeId)}>👑 连战:{bossName}</button>
              <button onClick={onRetreat}>🏳 撤退回城</button>
            </div>
          </>
        ) : (
          <>
            <div className="dungeon-graph">
              <svg className="dg-edges" viewBox="0 0 100 100" preserveAspectRatio="none">
                {publicMapEdges(run.map).map(([a, b]) => {
                  const na = nodeByIdIn(a)
                  const nb = nodeByIdIn(b)
                  if (!na || !nb) return null
                  // U33⑧④:暗道在档 <3 不显示——跳层线一并隐藏
                  if (secretHidden(na) || secretHidden(nb)) return null
                  const pa = nodePos(na)
                  const pb = nodePos(nb)
                  const walked = walkedEdges.has(`${a}->${b}`)
                  const open = availableIds.has(b) && run.nodeId === a
                  return <line key={`${a}-${b}`} x1={pa.y} y1={pa.x} x2={pb.y} y2={pb.x}
                    className={walked ? 'walked' : open ? 'open' : undefined} />
                })}
              </svg>
              {run.map.layers.flat().map((n) => {
                // U33⑧④:暗道在档 <3 完全不渲染(节点本身消失,玩家点不到)
                if (secretHidden(n)) return null
                const p = nodePos(n)
                const d = describe(n)
                const isCurrent = n.id === run.nodeId
                const isAvailable = availableIds.has(n.id)
                const isWalked = pathSet.has(n.id)
                const secretMasked = fullMask(n)
                return (
                  <button
                    key={n.id}
                    className={[
                      'dg-node',
                      isCurrent ? 'current' : '',
                      isAvailable && !isCurrent ? 'available' : '',
                      isWalked ? 'walked' : '',
                      secretMasked ? 'masked' : '',
                      n.kind === 'boss' && !secretMasked && kindVisible(n) ? 'boss' : '',
                    ].filter(Boolean).join(' ')}
                    style={{ left: `${p.y}%`, top: `${p.x}%` }}
                    disabled={!isAvailable || isCurrent}
                    onMouseEnter={() => setHoverId(n.id)}
                    onMouseLeave={() => setHoverId((h) => (h === n.id ? null : h))}
                    onFocus={() => setHoverId(n.id)}
                    onBlur={() => setHoverId((h) => (h === n.id ? null : h))}
                    onClick={() => onChoose(n.id)}
                    title={`${d.title} —— ${d.sub}`}
                  >
                    <span className="dg-icon">{secretMasked || !kindVisible(n) && !isWalked && !isCurrent ? '❓' : KIND_ICON[n.kind]}</span>
                    <span className="dg-name">{d.title}</span>
                  </button>
                )
              })}
              {hovered && (
                <div className="dg-intel" role="tooltip">
                  <b>{describe(hovered).title}</b>
                  <p>{describe(hovered).sub}</p>
                  {hoveredReward && <p className="dg-risk">这里能给:{hoveredReward.desc}</p>}
                  {hoveredRisks.length > 0 && <p className="dg-risk">走这里可能:{hoveredRisks.map((c) => c.name).join('、')}</p>}
                  {fullMask(hovered) && <p className="hint" style={{ opacity: 0.7 }}>{penalty > 0 && hovered.layer === curLayer + 1 ? '迷途散去前，下一层看不见。' : tier === 0 ? '积累熟练度或取得情报后，逐步看清路线。' : '还看不清这么远，靠近后再作判断。'}</p>}
                </div>
              )}
            </div>
            <div className="end-actions">
              <button onClick={onRetreat}>🏳 撤退回城</button>
            </div>
          </>
        )}
      </div>
      {/* #5.1 条款常驻条:约束与限时必须全程可见(条款在结算时才想起=设计失败) */}
      {(run.bountyClauses?.length ?? 0) > 0 && (
        <p className="hint" style={{ color: '#dcba87' }}>
          📜 加码:{clauseLabels(run.bountyClauses ?? [])}
          {run.bountyClauses?.includes('greenhorn') && run.greenhornId && ' (新人倒下则 ×1.5 作废)'}
          {run.bountyClauses?.includes('haste') && ` (剩余时限 ${Math.max(0, Math.ceil(((run.hasteBudget ?? 0) - (run.battle?.tick ?? 0)) / 10))}s)`}
          ——奖励 ×{clauseRewardMult(run.bountyClauses ?? []).toFixed(2)}
        </p>
      )}
      {run.fastLaneUsed && (
        <p className="hint" style={{ color: '#8d9b62' }}>🕳 快速通道:走过暗道的趟,沿途金币与经验减半(首领掉落照常)。</p>
      )}
      {cur && (
        <p className="hint" style={{ opacity: 0.7 }}>
          已走:{run.path.map((id) => nodeByIdIn(id)?.name ?? id).join(' → ')}
        </p>
      )}
    </>
  )
}
