import { useEffect, useRef, useState } from 'react'
import { exportStatistics, GOLD_SOURCES, totalGoldEarned, totalOutcomes, winRate, type GameplayStatistics, type GoldSource } from '../sim/statistics'
import './statistics.css'

export function StatisticsPanel({ statistics, day, onClose, onBack }: {
  statistics: GameplayStatistics
  day: number
  onClose: () => void
  onBack: () => void
}) {
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState('')
  const panel = useRef<HTMLElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const text = exportStatistics(statistics, day)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    return () => { document.body.style.overflow = overflow; previous?.focus() }
  }, [])
  useEffect(() => { if (exporting) field.current?.focus() }, [exporting])
  const columns = [statistics.expeditionBattles, statistics.towerFloors, statistics.expeditions]
  return <div className="screen-overlay" onKeyDown={(event) => {
    event.stopPropagation()
    if (event.key === 'Escape') onClose()
    if (event.key === 'Tab') {
      const elements = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea') ?? [])
      if (event.shiftKey && (document.activeElement === elements[0] || document.activeElement === panel.current)) {
        event.preventDefault(); elements.at(-1)?.focus()
      } else if (!event.shiftKey && document.activeElement === elements.at(-1)) {
        event.preventDefault(); elements[0]?.focus()
      }
    }
  }}>
    <section ref={panel} tabIndex={-1} className="screen-panel statistics-panel save-transfer" role="dialog" aria-modal="true" aria-labelledby="statistics-title">
      <div className="screen-head">
        <h2 id="statistics-title">战绩统计</h2>
        <button onClick={onBack}>返回大事记</button>
        <button onClick={onClose}>关闭</button>
      </div>
      <p className="hint">第 {statistics.sinceDay} 日起 · 当前第 {day} 日 · 已结算记录</p>
      <div className="statistics-table-wrap">
        <table className="statistics-table">
          <thead><tr><th scope="col">结果</th><th scope="col">远征战斗</th><th scope="col">高塔楼层</th><th scope="col">整趟远征</th></tr></thead>
          <tbody>
            <tr><th scope="row">场次</th>{columns.map((c, i) => <td key={i}>{totalOutcomes(c)}</td>)}</tr>
            <tr><th scope="row">胜利</th>{columns.map((c, i) => <td key={i}>{c.wins}</td>)}</tr>
            <tr><th scope="row">失败</th>{columns.map((c, i) => <td key={i}>{c.losses}</td>)}</tr>
            <tr><th scope="row">撤退</th>{columns.map((c, i) => <td key={i}>{c.retreats}</td>)}</tr>
            <tr><th scope="row">胜率</th>{columns.map((c, i) => <td key={i}>{winRate(c)}</td>)}</tr>
          </tbody>
        </table>
      </div>
      <dl className="statistics-totals">
        <dt>死亡人数</dt><dd>{statistics.expeditionBattles.deaths + statistics.towerFloors.deaths}</dd>
        <dt>团灭次数</dt><dd>{statistics.expeditionBattles.losses + statistics.towerFloors.losses}</dd>
      </dl>
      <h3>金币收入</h3>
      <dl className="statistics-totals">
        {Object.entries(GOLD_SOURCES).map(([key, label]) => <div className="statistics-pair" key={key}>
          <dt>{label}</dt><dd>{statistics.goldEarned[key as GoldSource]}</dd>
        </div>)}
        <dt>合计</dt><dd>{totalGoldEarned(statistics)}</dd>
      </dl>
      <h3>疗养支出</h3>
      <dl className="statistics-totals">
        <dt>治疗尝试</dt><dd>{statistics.healing.attempts}</dd>
        <dt>金币</dt><dd>{statistics.healing.gold}</dd>
        <dt>祝福</dt><dd>{statistics.healing.blessing}</dd>
      </dl>
      <button onClick={() => setExporting((v) => !v)} aria-expanded={exporting} aria-controls="statistics-export">
        {exporting ? '收起文本' : '导出文本'}
      </button>
      {exporting && <div id="statistics-export">
        <label htmlFor="statistics-text">统计报告</label>
        <textarea id="statistics-text" ref={field} readOnly value={text} spellCheck={false} />
        <button onClick={async () => {
          try {
            await navigator.clipboard.writeText(text)
            setNotice('统计报告已复制。')
          } catch {
            field.current?.focus(); field.current?.select()
            setNotice('自动复制未成功，文本已选中。')
          }
        }}>复制报告</button>
        <p role="status">{notice}</p>
      </div>}
    </section>
  </div>
}
