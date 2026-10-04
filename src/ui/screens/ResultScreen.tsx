import type { Member } from '../../sim/types'
import type { DungeonRun } from '../../sim/run'
import { xpNeeded, bondStars } from '../../sim/gen'
import { powerScore } from '../../sim/combat'
import { runMembers } from '../../sim/run-core'
import { describeItem } from '../../sim/loot'
import type { ItemInstance } from '../../sim/types'

// 独立结算屏(U29② 拍板):远征终局(通关/团灭/撤退)有自己的舞台——
// 大横幅 + 成长表(出击前快照 vs 现在) + 默契 + 本次掉落 + 说书人故事,一键返回公会。
// 反馈层级:节点小事用地图结果条,终局用本屏。

export interface GrowthSnapshot {
  level: number
  power: number
  bondTotal: number
  bonds: Record<string, number>
}

interface ResultScreenProps {
  run: DungeonRun
  dungeonName: string
  members: Member[]
  snapshot: Map<string, GrowthSnapshot>
  drops: ItemInstance[]
  /** 说书人故事(远征终局碰撞,0-1 条;空=本趟无故事) */
  story: string | null
  onBack: () => void
}

export function ResultScreen({ run, dungeonName, members, snapshot, drops, story, onBack }: ResultScreenProps) {
  const rows = runMembers(run, members).map((m) => {
    const snap = snapshot.get(m.id)
    if (!snap) return null
    return { m, snap, power: powerScore(m) }
  })
  const survivors = runMembers(run, members).filter((m) => m.alive)
  const pairs: { a: string; b: string; stars: number }[] = []
  for (let i = 0; i < survivors.length; i++) {
    for (let j = i + 1; j < survivors.length; j++) {
      const stars = bondStars(survivors[i].bonds[survivors[j].id] ?? 0)
      if (stars > 0) pairs.push({ a: survivors[i].name, b: survivors[j].name, stars })
    }
  }
  return (
    <div className="result-screen">
      <h2>远征结束 · {dungeonName}</h2>
      <div className={`result-banner xl ${run.phase === 'victory' ? 'win' : run.phase === 'defeat' ? 'wipe' : 'win'}`}>
        {run.phase === 'victory'
          ? '★ 副本通关！（掉落与奖励已入仓库）'
          : run.phase === 'defeat'
            ? '✝ 远征失败——阵亡的英雄已入纪念堂，愿他们安息'
            : '🏳 已撤退回城'}
      </div>
      <div className="inv-panel">
        <h2>📈 成长结算</h2>
        {rows.map((r) =>
          r ? (
            <div key={r.m.id} className={`growth-row${r.m.alive ? '' : ' dead'}`}>
              <span className="g-name">{r.m.alive ? r.m.name : `⚰ ${r.m.name}`}</span>
              <span>Lv{r.snap.level}→{r.m.level}</span>
              <span>
                战力 {r.snap.power}→{r.power}
                {r.power > r.snap.power ? `（+${r.power - r.snap.power}）` : ''}
              </span>
              <span className="g-exp">经验 {r.m.exp}/{xpNeeded(r.m.level)}</span>
            </div>
          ) : null,
        )}
        {pairs.length > 0 && (
          <p className="hint">
            🤝 默契:{pairs.map((p) => `${p.a} ↔ ${p.b} ${'★'.repeat(p.stars)}`).join('，')}
            （同队时每 ★ 全员伤害 +3%）
          </p>
        )}
      </div>
      {drops.length > 0 && (
        <div className="inv-panel">
          <h2>🎁 本次掉落（{drops.length}）</h2>
          {drops.map((i) => (
            <div key={i.id} className="inv-item">🎁 {describeItem(i)}</div>
          ))}
        </div>
      )}
      {story && (
        <div className="inv-panel">
          <h2>📖 说书人</h2>
          <p className="hint" style={{ lineHeight: 1.9 }}>{story}</p>
        </div>
      )}
      <div className="end-actions">
        <button className="primary" onClick={onBack}>← 返回公会</button>
      </div>
    </div>
  )
}
