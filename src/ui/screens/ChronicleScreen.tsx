// chronicle 屏(U29 R2-5 自 App.tsx 迁出;行为零变)
import { type ChronicleEntry } from '../../sim/chronicle'

interface ChronicleScreenProps {
  chronicle: ChronicleEntry[]
  day: number
  onOpenStatistics: () => void
  onBack: () => void
}

export function ChronicleScreen({ chronicle, day, onOpenStatistics, onBack }: ChronicleScreenProps) {
  return (
            <div className="screen-overlay fullpage">
              <div className="screen-panel">
                <div className="screen-head">
                  <h2>📜 大事记</h2>
                  <button onClick={onOpenStatistics}>战绩统计</button>
                  <button className="screen-close" onClick={() => onBack()}>✕ Esc</button>
                </div>
        <div className="inv-panel">
          <h2>📜 编年史（第 {day} 日 · {chronicle.length} 则）</h2>
          <div className="chronicle-box">
            {chronicle.length === 0 ? (
              <p className="hint">还没有故事发生。故事从第一次出击开始。</p>
            ) : (
              chronicle.slice(-40).map((e) => (
                <div key={e.seq} className="chronicle-row">
                  <span className="chronicle-day">第{e.day}日</span>
                  <span>{e.text}</span>
                </div>
              ))
            )}
          </div>
              </div>
            </div>
            </div>
  )
}
