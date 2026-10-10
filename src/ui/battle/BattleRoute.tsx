import type { DungeonRun } from '../../sim/run'
import type { TowerRun } from '../../sim/tower'
import { activeConditions } from '../../sim/conditions'
import { TOWER_RULES } from '../../sim/tower-rule'
import { Tooltip } from '../Tooltip'

export function BattleRoute({ run, tower }: { run: DungeonRun | null; tower: TowerRun | null }) {
  const layer = run?.map.layers.findIndex(nodes => nodes.some(n => n.id === run.nodeId)) ?? -1
  const conditions = run ? activeConditions(run) : (tower?.segmentRules ?? []).map(id => TOWER_RULES[id])
  return <>
    {run && <><p>第 {layer + 1} 层 / 共 {run.map.layers.length} 层 · 第 {run.battlesFought} 场</p>
      <div className="route-layers" aria-label={'路线进度，第 ' + (layer + 1) + ' 层'}>{run.map.layers.map((_, i) => <i key={i} className={i < layer ? 'done' : i === layer ? 'now' : ''} />)}</div></>}
    {tower && <p>金币已入账 {tower.goldEarned}{tower.insuredFloor ? ' · 本层已投保' : ''}</p>}
    <div className="route-conditions">{conditions.map(c => <Tooltip key={c.name} content={c.desc}><span tabIndex={0}>{c.name}</span></Tooltip>)}</div>
  </>
}
