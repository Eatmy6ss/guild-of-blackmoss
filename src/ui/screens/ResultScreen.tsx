import { useEffect, useState } from 'react'
import type { Member, ItemInstance } from '../../sim/types'
import type { DungeonRun } from '../../sim/run'
import { xpNeeded, bondStars } from '../../sim/gen'
import { powerScore } from '../../sim/combat'
import { runMembers } from '../../sim/run-core'
import { describeItem } from '../../sim/loot'

// 独立结算屏 v2(U29② 反馈重做,参考 gameres 878379/MHW/明日方舟式结算):
// ①核心结果=盖章仪式(缩放砸下,先于一切)②数字滚动(count-up)③条目错峰浮入
// ④掉落=登台领奖(稀有度描边的卡格)⑤到下一局的路径缩短(再次出征一键)
// 失败弱化:团灭横幅措辞冷静,聚焦"留下什么"。

function CountUp({ to, duration = 800 }: { to: number; duration?: number }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / duration)
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [to, duration])
  return <>{v}</>
}

interface GrowthSnapshot {
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
  story: string | null
  onBack: () => void
  /** 一键再战同一副本(返回公会+立即重新出征;缩短到下一局的路径) */
  onAgain?: () => void
}

const QUALITY_STYLE: Record<string, { border: string; tag: string }> = {
  purple: { border: '#a884d8', tag: '史诗' },
  green: { border: '#7fb069', tag: '精良' },
  white: { border: '#6b6b6b', tag: '普通' },
}

export function ResultScreen({ run, dungeonName, members, snapshot, drops, story, onBack, onAgain }: ResultScreenProps) {
  const rows = runMembers(run, members)
    .map((m) => {
      const snap = snapshot.get(m.id)
      return snap ? { m, snap, power: powerScore(m) } : null
    })
    .filter(Boolean) as { m: Member; snap: GrowthSnapshot; power: number }[]
  const survivors = runMembers(run, members).filter((m) => m.alive)
  const pairs: { a: string; b: string; stars: number }[] = []
  for (let i = 0; i < survivors.length; i++) {
    for (let j = i + 1; j < survivors.length; j++) {
      const stars = bondStars(survivors[i].bonds[survivors[j].id] ?? 0)
      if (stars > 0) pairs.push({ a: survivors[i].name, b: survivors[j].name, stars })
    }
  }
  const win = run.phase === 'victory'
  const dead = run.phase === 'defeat'
  // R5.1e(U33④):撤退代价展示
  const cost = run.phase === 'retreated' ? run.retreatCost : undefined
  return (
    <div className={`result-screen${dead ? ' rs-defeat' : ''}`}>
      {/* ① 核心结果:盖章仪式——缩放砸下,悬停大字 */}
      <div className={`rs-stamp ${win ? 'win' : dead ? 'wipe' : 'retreat'}`}>
        <span className="rs-stamp-mark">{win ? '★' : dead ? '✝' : '🏳'}</span>
        <span className="rs-stamp-text">
          {win ? '副本通关' : dead ? '远征失败' : '撤退回城'}
        </span>
        <span className="rs-stamp-sub">{dungeonName}{win ? ' · 掉落与奖励已入仓库' : dead ? ' · 阵亡者已入纪念堂' : cost ? ` · 撤退:金币 −${cost.gold}、熟练度 −${cost.mastery}` : ' · 幸存者保留状态'}</span>
      </div>
      {cost && (cost.gold > 0 || cost.mastery > 0) && (
        <p className="hint" role="status" style={{ textAlign: 'center', opacity: 0.85 }}>撤退:金币 −{cost.gold}、熟练度 −{cost.mastery}(装备照拿,药水照退)</p>
      )}

      {/* ② 成长:错峰浮入,数字滚动 */}
      <div className="rs-section">
        <h3 className="rs-title">📈 成长</h3>
        {rows.map((r, i) => (
          <div key={r.m.id} className={`rs-row${r.m.alive ? '' : ' dead'}`} style={{ animationDelay: `${200 + i * 110}ms` }}>
            <span className="g-name">{r.m.alive ? r.m.name : `⚰ ${r.m.name}`}</span>
            <span className="rs-num">Lv{r.snap.level} → <b><CountUp to={r.m.level} /></b></span>
            <span className="rs-num">战力 {r.snap.power} → <b><CountUp to={r.power} /></b>
              {r.power > r.snap.power && <em className="rs-delta">+{r.power - r.snap.power}</em>}
            </span>
            <span className="g-exp">经验 {r.m.exp}/{xpNeeded(r.m.level)}</span>
          </div>
        ))}
      </div>

      {/* ③ 默契 chips */}
      {pairs.length > 0 && (
        <div className="rs-bonds rs-rise" style={{ animationDelay: `${200 + rows.length * 110}ms` }}>
          🤝 默契:{pairs.map((p) => `${p.a} ↔ ${p.b} ${'★'.repeat(p.stars)}`).join('，')}
          <span className="hint">(同队时每 ★ 全员伤害 +3%)</span>
        </div>
      )}

      {/* ④ 掉落:登台领奖——稀有度描边卡格,逐张滑入 */}
      {drops.length > 0 && (
        <div className="rs-section">
          <h3 className="rs-title">🎁 战利品（{drops.length}）—— 已入仓库</h3>
          <div className="rs-drops">
            {drops.map((i, k) => {
              const q = QUALITY_STYLE[i.quality ?? 'white'] ?? QUALITY_STYLE.white!
              return (
                <div key={i.id} className="rs-drop" style={{ borderColor: q.border, animationDelay: `${450 + k * 130}ms` }}
                  title={describeItem(i)}>
                  <span className="rs-drop-tag" style={{ color: q.border }}>{q.tag}</span>
                  <span className="rs-drop-name">{describeItem(i)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ⑤ 说书人 */}
      {story && (
        <div className="rs-story rs-rise" style={{ animationDelay: `${700 + drops.length * 90}ms` }}>
          <span className="rs-story-mark">📖</span>
          <p>{story}</p>
        </div>
      )}

      {/* ⑥ 到下一局的路径:再次出征一键;两键都是大按钮 */}
      <div className="rs-actions">
        {win && onAgain && (
          <button className="rs-again" onClick={onAgain}>⚔ 再次出征 · {dungeonName}</button>
        )}
        <button className="rs-back" onClick={onBack}>🏰 返回公会</button>
      </div>
    </div>
  )
}
