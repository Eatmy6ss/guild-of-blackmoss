import type { DungeonRun } from '../../sim/run'
import { REST_HEAL_PCT, revealLevel, MASTERY, currentNode, mapOptions, bossSequence, nextBossEncounter } from '../../sim/run'
import { nodeById, TERRAIN_NAMES, type MapNode } from '../../sim/dungeon-map'
import { runDungeon } from '../../sim/run-core'
import { describeItem } from '../../sim/loot'
import type { ItemInstance } from '../../sim/types'

// 副本地图界面(U27①/R1.1):每战之后在地图上选一条出边,不选路不能前进。
// 独立文件是工单红线:R1 新写的地图界面不放 App.tsx。路况状态条随 R1.2 接入。
// 揭示规则(R1.3 收口前的过渡版):hidden=只知名与地形;kind=相邻层类型;full=相邻层类型+遭遇名。

interface MapScreenProps {
  run: DungeonRun
  mastery: number
  drops: ItemInstance[]
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

export function MapScreen({ run, mastery, drops, onChoose, onRetreat }: MapScreenProps) {
  const dungeon = runDungeon(run)
  const lvl = revealLevel(mastery)
  const cur = currentNode(run)
  const bossCount = bossSequence(dungeon).length
  const bossLeft = cur?.kind === 'boss' ? nextBossEncounter(run) : null
  const opts = mapOptions(run)
  const totalLayers = run.map.layers.length
  const layerLabel = cur ? `第 ${cur.layer + 1}/${totalLayers} 层` : '入口'
  // 揭示口径(R1.3 前过渡):hidden 只见风味名;kind 及以上见类型;full 再见遭遇名;熟练度≥80 见暗道
  const describe = (n: MapNode): { title: string; sub: string } => {
    const kindVisible = lvl === 'kind' || lvl === 'full'
    const secretVisible = mastery >= 80
    if (n.kind === 'secret' && !secretVisible) return { title: '???', sub: '未曾注意的岔口' }
    const encounterName = n.encounterId
      ? dungeon.encounters.find((e) => e.id === n.encounterId)?.name
      : undefined
    return {
      title: n.name,
      sub: kindVisible
        ? `${KIND_LABEL[n.kind]}${n.terrain ? ` · ${TERRAIN_NAMES[n.terrain]}` : ''}${lvl === 'full' && encounterName ? ` —— ${encounterName}` : ''}`
        : `❓ 未知${n.terrain ? ` · ${TERRAIN_NAMES[n.terrain]}` : ''}`,
    }
  }
  return (
    <>
      <h2>{dungeon.name} · 地图（{layerLabel}）</h2>
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
      <div className="route-choice">
        <p className="hint">
          熟练度 {mastery} —— {lvl === 'hidden' ? `前路未知,只闻其名(相邻层的类型需熟练度 ${MASTERY.KIND})。` : lvl === 'kind' ? '你已记得这些路的类别。' : '这张图你闭着眼都能走。'}
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
            <div className="route-choices">
              {opts.map((n) => {
                const d = describe(n)
                return (
                  <button key={n.id} onClick={() => onChoose(n.id)}>
                    {d.title}
                    <small>{d.sub}</small>
                  </button>
                )
              })}
            </div>
            <div className="end-actions">
              <button onClick={onRetreat}>🏳 撤退回城</button>
            </div>
          </>
        )}
      </div>
      {cur && (
        <p className="hint" style={{ opacity: 0.7 }}>
          已走:{run.path.map((id) => nodeById(run.map, id)?.name ?? id).join(' → ')}
        </p>
      )}
    </>
  )
}
