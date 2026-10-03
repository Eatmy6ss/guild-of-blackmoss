import type { DungeonRun } from '../../sim/run'
import { REST_HEAL_PCT, revealTier, MASTERY, currentNode, mapOptions, bossSequence, nextBossEncounter } from '../../sim/run'
import { revealPenaltyLayers } from '../../sim/conditions'
import { nodeById, TERRAIN_NAMES, type MapNode } from '../../sim/dungeon-map'
import { runDungeon } from '../../sim/run-core'
import { describeItem } from '../../sim/loot'
import { activeConditions, restHealMult } from '../../sim/conditions'
import { ROUTE_CONDITIONS } from '../../data/conditions'
import type { ItemInstance } from '../../sim/types'

// 副本地图界面(U27①/R1.1):每战之后在地图上选一条出边,不选路不能前进。
// 独立文件是工单红线:R1 新写的地图界面不放 App.tsx。路况状态条随 R1.2 接入。
// 揭示规则(R1.3 收口前的过渡版):hidden=只知名与地形;kind=相邻层类型;full=相邻层类型+遭遇名。

interface MapScreenProps {
  run: DungeonRun
  mastery: number
  /** R4 酒馆情报的临时提档预留(每点 +1 档);R1 只接线不入口 */
  revealBonus?: number
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

export function MapScreen({ run, mastery, revealBonus = 0, drops, onChoose, onRetreat }: MapScreenProps) {
  const dungeon = runDungeon(run)
  const cur = currentNode(run)
  // R1.3 四档:0 只知名与地形 / 1 相邻层类型 / 2 前两层类型+内容+路况 / 3 全图类型+暗道
  const tier = revealTier(mastery, revealBonus, revealPenaltyLayers(run))
  const lvl = tier === 0 ? 'hidden' : tier === 1 ? 'kind' : 'full'
  const curLayer = cur?.layer ?? -1
  const kindVisible = (n: MapNode): boolean =>
    tier >= 3 || (tier === 2 ? n.layer <= curLayer + 2 : tier === 1 && n.layer === curLayer + 1)
  const contentVisible = (n: MapNode): boolean => tier >= 2 && (tier >= 3 || n.layer <= curLayer + 2)
  const bossCount = bossSequence(dungeon).length
  const bossLeft = cur?.kind === 'boss' ? nextBossEncounter(run) : null
  const opts = mapOptions(run)
  const totalLayers = run.map.layers.length
  const layerLabel = cur ? `第 ${cur.layer + 1}/${totalLayers} 层` : '入口'
  // 揭示口径(R1.3):类型按档位范围;内容(遭遇名/事件)60+ 前两层、80+ 全图;暗道 80+ 才可见
  const describe = (n: MapNode): { title: string; sub: string } => {
    if (n.kind === 'secret' && tier < 3) return { title: '???', sub: '未曾注意的岔口' }
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
                // 走这里可能:路况提示(U27②)——熟练度 full(60+)才看得见
                const risks = tier >= 2
                  ? ROUTE_CONDITIONS.filter((c) => c.trigger === 'terrain' && c.from?.includes(n.terrain) && !activeConditions(run).some((a) => a.id === c.id)).map((c) => c.name)
                  : []
                return (
                  <button key={n.id} title={risks.length ? `走这里可能:${risks.join('、')}` : undefined} onClick={() => onChoose(n.id)}>
                    {d.title}
                    <small>{d.sub}{risks.length ? ` · 走这里可能:${risks.join('、')}` : ''}</small>
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
      {tier >= 1 && (() => {
        // 情报区(R1.3):选项之外还能看到的层——1 档看后层地形,2 档看前两层类型,3 档全图类型
        const lines: string[] = []
        for (const layer of run.map.layers) {
          const ahead = layer.filter((n) => n.layer > curLayer && n.id !== run.nodeId)
          if (ahead.length === 0) continue
          const maxAhead = Math.max(...ahead.map((n) => n.layer))
          const showKinds = tier === 1 ? maxAhead <= curLayer + 1 : true
          if (tier === 1 && maxAhead > curLayer + 1 && maxAhead > curLayer + 2) continue
          const parts = ahead.map((n) => {
            const secret = n.kind === 'secret' && tier < 3
            const t = showKinds ? (secret ? '未知岔口' : KIND_LABEL[n.kind].replace(/^[^ ]+ /, '')) : TERRAIN_NAMES[n.terrain]
            const name = secret || !showKinds ? t : n.name
            return showKinds ? `${name}(${t})` : name
          })
          lines.push(`第 ${layer[0]!.layer + 1} 层:${parts.join('、')}`)
        }
        if (lines.length === 0) return null
        return (
          <details className="enc-notices">
            <summary>情报({tier >= 3 ? '全图' : tier === 2 ? '前两层' : '下一层'})</summary>
            {lines.map((l, i) => <p key={i} className="hint">{l}</p>)}
          </details>
        )
      })()}
    </>
  )
}
