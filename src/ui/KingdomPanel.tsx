import { useEffect, useRef, useState } from 'react'
import { COMMISSIONS, COMMISSION_LIMIT, KINGDOM_NAME, KINGDOM_RANKS, type CommissionDef } from '../data/kingdom'
import { commissionLock, commissionReward, kingdomRank, kingdomTrust, royalPotionCost, type KingdomContext, type KingdomState, type RoyalRewardChoice } from '../sim/kingdom'
import { describeItem } from '../sim/loot'

interface Props {
  state: KingdomState
  context: KingdomContext
  notice: string
  onClose: () => void
  onAccept: (id: string) => void
  onAbandon: (id: string) => void
  onClaim: (id: string, choice: RoyalRewardChoice) => void
  onTravel: (q: CommissionDef) => void
}

export function KingdomPanel({ state, context, notice, onClose, onAccept, onAbandon, onClaim, onTravel }: Props) {
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus({ preventScroll: true })
    return () => { document.body.style.overflow = overflow; previous?.focus({ preventScroll: true }) }
  }, [])
  const [abandonId, setAbandonId] = useState<string | null>(null)
  const trust = kingdomTrust(state)
  const rank = kingdomRank(state)
  const nextRank = KINGDOM_RANKS.find((r) => r.threshold > trust)
  const done = new Set(state.completed.map((r) => r.id))
  const activeIds = new Set(state.active.map((r) => r.id))
  const remaining = COMMISSIONS.filter((q) => !done.has(q.id) && !activeIds.has(q.id))
  const available = remaining.filter((q) => !commissionLock(q, state, context))
  const locked = remaining.filter((q) => commissionLock(q, state, context))
  const rewardText = (q: CommissionDef, choice: RoyalRewardChoice) => {
    const r = commissionReward(q, choice)
    return `${r.gold}金${r.heal ? ` · 治疗药×${r.heal} · 祝福×${r.blessing}` : ` · 爆发药×${r.fury}`}`
  }
  const card = (q: CommissionDef, progress?: number) => {
    const ready = progress !== undefined && progress >= q.objective.target
    return <article className={`royal-card${ready ? ' ready' : ''}`} key={q.id}>
      <div className="royal-card-top"><span>{q.chapter}</span><span>{ready ? '可交付' : progress !== undefined ? '执行中' : '可接取'}</span></div>
      <h3>{q.title}</h3>
      <p className="royal-issuer">{q.issuer}</p>
      <p className="royal-letter">{q.letter}</p>
      <div className="royal-objective"><b>目标</b><span>{q.objectiveText}</span></div>
      {progress !== undefined && <div className="royal-progress"><progress aria-label={`${q.title}进度`} value={progress} max={q.objective.target} /><span>{progress} / {q.objective.target}</span></div>}
      <p className="royal-common">结案：王国信任 +{q.trust}{q.item ? ` · 固定装备：${describeItem({ ...q.item, id: 'preview' })}` : ''}</p>
      {ready ? <>
        <p className="hint">选择一份报酬，信任与固定装备两种方案均可获得。</p>
        <div className="royal-rewards">
          <button className="primary" onClick={() => onClaim(q.id, 'coin')}>领取酬金<span>{rewardText(q, 'coin')}</span></button>
          <button onClick={() => onClaim(q.id, 'supplies')}>申请补给<span>{rewardText(q, 'supplies')}</span></button>
        </div>
      </> : <>
        <div className="royal-reward-preview"><span>酬金：{rewardText(q, 'coin')}</span><span>或补给：{rewardText(q, 'supplies')}</span></div>
        <div className="royal-actions">
          {progress === undefined
            ? <button className="primary" disabled={state.active.length >= COMMISSION_LIMIT} onClick={() => onAccept(q.id)}>{state.active.length >= COMMISSION_LIMIT ? '在办委托已满' : '接下委托'}</button>
            : <button className="primary" onClick={() => onTravel(q)}>{q.objective.kind === 'building' ? '前往基地' : '前往作战板'}</button>}
          {progress !== undefined && <button className="royal-abandon" onClick={() => setAbandonId(q.id)}>撤销委托</button>}
        </div>
      </>}
      {abandonId === q.id && <div className="royal-confirm">
        <p>撤销后可重新接取，已累计的战斗进度会清零；不扣信任。</p>
        <button onClick={() => { onAbandon(q.id); setAbandonId(null) }}>确认撤销</button><button onClick={() => setAbandonId(null)}>保留委托</button>
      </div>}
    </article>
  }
  return <div className="screen-overlay">
    <section ref={panel} tabIndex={-1} className="screen-panel royal-panel" role="dialog" aria-modal="true" aria-labelledby="royal-title" onKeyDown={(event) => {
      if (event.key !== 'Tab') return
      const buttons = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), summary') ?? []).filter((el) => el.getClientRects().length > 0)
      const first = buttons[0], last = buttons[buttons.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}>
      <div className="screen-head"><h2 id="royal-title">♜ 王国委托</h2><button className="screen-close" onClick={onClose}>✕ 关闭委托</button></div>
      <header className="royal-header">
        <div className="royal-seal" aria-hidden="true">♜</div>
        <div><p className="royal-kicker">{KINGDOM_NAME} · 边境官署</p><h3>{rank.name}</h3><p>{rank.desc}</p></div>
        <div className="royal-standing"><strong>{trust}</strong><span>王国信任</span></div>
      </header>
      <div className="royal-rank-progress">
        <progress aria-label="王国关系进度" value={nextRank ? trust - rank.threshold : 1} max={nextRank ? nextRank.threshold - rank.threshold : 1} />
        <span>{nextRank ? `再获 ${nextRank.threshold - trust} 信任 → ${nextRank.name}（补给优惠 ${Math.round(nextRank.discount * 100)}%）` : '已获最高关系称号 · 灰冠誓约者'}</span>
      </div>
      <div className="royal-rules"><span>在办 {state.active.length}/{COMMISSION_LIMIT} · 已结案 {done.size}/{COMMISSIONS.length}</span><span>补给优惠 {Math.round(rank.discount * 100)}% · 治疗药 {royalPotionCost('heal', state)}金 / 爆发药 {royalPotionCost('fury', state)}金</span></div>
      <p className="royal-help">接取后开始记录战绩；回到公会交付，每份仅领一次。没有期限，撤退不抹去已获战绩。战斗委托不追溯旧战绩，建设委托认可已有建筑。远征结束才存档，途中刷新会回到出征前。</p>
      {notice && <p className="royal-notice" role="status">{notice}</p>}
      <h3 className="royal-section-title">在办委托</h3>
      {state.active.length ? <div className="royal-grid">{state.active.map((r) => card(COMMISSIONS.find((q) => q.id === r.id)!, r.progress))}</div> : <p className="royal-empty">桌上还没有签过的官契。从下方接下一份，公会的故事便会与王国相连。</p>}
      <h3 className="royal-section-title">官署来函</h3>
      {available.length ? <div className="royal-grid">{available.map((q) => card(q))}</div> : <p className="royal-empty">{done.size === COMMISSIONS.length ? '本批来函全部结案。回信已收入下方档案，补给优惠将继续保留。' : '暂时没有新的可接来函。完成在办委托，或查看后续来函的条件。'}</p>}
      {locked.length > 0 && <details className="royal-archive"><summary>后续来函 · {locked.length}份</summary>{locked.map((q) => <div className="royal-locked" key={q.id}><b>{q.title}</b><p>{commissionLock(q, state, context)}</p></div>)}</details>}
      {state.completed.length > 0 && <details className="royal-archive" open><summary>王国回信 · {done.size}份</summary>{[...state.completed].reverse().map((r) => {
        const q = COMMISSIONS.find((entry) => entry.id === r.id)!
        return <article className="royal-receipt" key={r.id}><h4>{q.title}<span>第{r.day}日结案</span></h4><p>{q.reply}</p><small>已领取{r.choice === 'coin' ? '酬金' : '补给'}：{rewardText(q, r.choice)} · 信任+{q.trust}{q.item ? ' · 固定装备已入库' : ''}</small></article>
      })}</details>}
    </section>
  </div>
}
