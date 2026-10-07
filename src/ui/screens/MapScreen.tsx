import { useState } from 'react'
import type { DungeonRun } from '../../sim/run'
import { REST_HEAL_PCT, revealTier, MASTERY, currentNode, mapOptions, bossSequence, nextBossEncounter } from '../../sim/run'
import { revealPenaltyLayers } from '../../sim/conditions'
import { nodeById, publicMapEdges, TERRAIN_NAMES, type MapNode } from '../../sim/dungeon-map'
import { runDungeon } from '../../sim/run-core'
import { describeItem } from '../../sim/loot'
import { activeConditions, restHealMult } from '../../sim/conditions'
import { ROUTE_CONDITIONS } from '../../data/conditions'
import { terrainRewardOf } from '../../data/terrain-rewards'
import type { ItemInstance } from '../../sim/types'

// 副本地图界面(U29 拍板形态):图形化节点图——分层节点+连线,走过的路径点亮,暗道显示为「?」;
// 悬停浮出情报框(类型/路况/敌人名,按 R1.3 四档揭示)。DOM/CSS 实现,不加美术负担。
// 独立文件是工单红线:地图界面不放 App.tsx。

interface MapScreenProps {
  run: DungeonRun
  mastery: number
  /** R4 酒馆情报的临时提档预留(每点 +1 档);R1 只接线不入口 */
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
  // R1.3 四档:0 只知名与地形 / 1 相邻层类型 / 2 前两层类型+内容+路况 / 3 全图类型+暗道
  const tier = revealTier(mastery, revealBonus, revealPenaltyLayers(run))
  const intel = intelEntries.filter((e) => e.dungeonId === run.dungeonId)
  const curLayer = cur?.layer ?? -1
  const kindVisible = (n: MapNode): boolean =>
    tier >= 3 || (tier === 2 ? n.layer <= curLayer + 2 : tier === 1 && n.layer === curLayer + 1)
  const contentVisible = (n: MapNode): boolean => tier >= 2 && (tier >= 3 || n.layer <= curLayer + 2)
  const bossCount = bossSequence(dungeon).length
  const bossLeft = cur?.kind === 'boss' ? nextBossEncounter(run) : null
  const opts = mapOptions(run)
  const availableIds = new Set(opts.map((o) => o.id))
  const pathSet = new Set(run.path)
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

  // 揭示口径(R1.3 + U30 + U33③④ 修订):
  // 档 0 = 迷雾起点:相邻一层只显示地形(不显名/类型/内容),更远的层全盲;迷途笼罩下一层仍全盲;
  // 档 1 起知名与地形;类型按档位范围;内容 60+ 前两层、80+ 全图;
  // 暗道 80+ 才可见(U33⑧④:档 <3 完全不渲染,无「???」无跳层线);迷途的好处=后两层暗道显形
  const describe = (n: MapNode): { title: string; sub: string } => {
    if (fullMask(n)) return { title: '未知岔路', sub: '迷雾笼罩,什么都看不见' }
    if (fogStartTerrain(n)) return { title: TERRAIN_NAMES[n.terrain], sub: '看得出地形,认不出路' }
    const encounterName = n.encounterId
      ? dungeon.encounters.find((e) => e.id === n.encounterId)?.name
      : undefined
    const kv = kindVisible(n)
    const cv = contentVisible(n)
    return {
      title: n.name,
      sub: kv
        ? `${KIND_LABEL[n.kind]}${n.terrain ? ` · ${TERRAIN_NAMES[n.terrain]}` : ''}${cv && encounterName ? ` —— ${encounterName}` : ''}`
        : `❓ 未知${n.terrain ? ` · ${TERRAIN_NAMES[n.terrain]}` : ''}`,
    }
  }
  // 迷途(U27②)发作时:下一层的选项整体全盲——不是降一档,是一片漆黑(制作人 2026-10-04 定稿)
  const penalty = revealPenaltyLayers(run)
  // R5.1b 迷途的好处:后两层若有暗道,无视档位直接显示
  const lostReveals = activeConditions(run).some((c) => c.upside?.secretReveal)
  // U33⑧④:暗道在档 <3 时完全不显示(既没有「???」也没有跳层线)
  const secretHidden = (n: MapNode): boolean =>
    n.kind === 'secret' && tier < 3 && !(lostReveals && n.layer <= curLayer + 2)
  // U33③ 迷雾起点:档 0 时相邻一层只看到地形
  const fogStartTerrain = (n: MapNode): boolean =>
    tier === 0 && !pathSet.has(n.id) && n.id !== run.nodeId && n.layer === curLayer + 1
  // 全盲:没走过的节点,在「更远的层(档 0)」「迷途笼罩下一层」时只剩一个「?」
  const fullMask = (n: MapNode): boolean => {
    if (pathSet.has(n.id) || n.id === run.nodeId) return false
    if (secretHidden(n)) return true
    if (tier === 0) return !fogStartTerrain(n)
    return penalty > 0 && n.layer === curLayer + 1
  }
  const hovered = hoverId ? nodeByIdIn(hoverId) : undefined
  const hoveredRisks = hovered && tier >= 2
    ? ROUTE_CONDITIONS.filter((c) => c.trigger === 'terrain' && c.from?.includes(hovered.terrain) && !activeConditions(run).some((a) => a.id === c.id))
    : []
  // R5/U33①:回报与风险并列显示,遵守揭示档位(档 0 只看到地形,档 2 起看到具体数字)
  const hoveredReward = hovered && tier >= 2 ? terrainRewardOf(hovered.terrain) : undefined

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
          熟练度 {mastery} —— {tier === 0 ? '初来乍到——相邻一步的地形看得出来,其余一片漆黑(熟练度 35 起记得路名)。' : tier === 1 ? '你已记得这些路的模样与类别。' : tier === 2 ? '前两层的底细你已看在眼里。' : '这张图你闭着眼都能走(暗道也藏不住)。'}
          {penalty > 0 && ' 迷途:下一层的选项一片漆黑。'}
        </p>
        {cur?.kind === 'boss' && bossLeft ? (
          <>
            <p className="hint">深处的气息近了——<b style={{ color: '#d48f8f' }}>{dungeon.encounters.find((e) => e.id === bossLeft)?.name}</b> 就在前方{bossCount > 1 ? '（Boss 依次连战）' : ''}。</p>
            <div className="end-actions">
              <button className="primary" onClick={() => onChoose(run.nodeId)}>👑 连战:{dungeon.encounters.find((e) => e.id === bossLeft)?.name}</button>
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
                      n.kind === 'boss' ? 'boss' : '',
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
                  {fullMask(hovered) && <p className="hint" style={{ opacity: 0.7 }}>{tier === 0 ? `熟练度 ${MASTERY.KIND} 后记得路名` : '迷途散去前,下一层看不见'}</p>}
                </div>
              )}
            </div>
            <div className="end-actions">
              <button onClick={onRetreat}>🏳 撤退回城</button>
            </div>
          </>
        )}
      </div>
      {cur && (
        <p className="hint" style={{ opacity: 0.7 }}>
          已走:{run.path.map((id) => nodeByIdIn(id)?.name ?? id).join(' → ')}
        </p>
      )}
    </>
  )
}
