// memorial 屏(U29 R2-5 自 App.tsx 迁出;行为零变)
import type { DeadHero } from '../../sim/types'
import { memorialAura, legacyQuality, legacyCounts } from '../../sim/memorial'
import { JOBS } from '../../data/jobs'

interface MemorialScreenProps {
  memorial: DeadHero[]
  onBack: () => void
}

export function MemorialScreen({ memorial, onBack }: MemorialScreenProps) {
  return (
            <div className="screen-overlay fullpage">
              <div className="screen-panel">
                <div className="screen-head">
                  <h2>🕯 名人堂</h2>
                  <button className="screen-close" onClick={() => onBack()}>✕ Esc</button>
                </div>
        <div className="inv-panel">
          <h2>
            🕯 纪念堂（{memorial.length} 位英灵 · 全队伤害 +
            {Math.round(memorialAura(memorial) * 100)}%，封顶 6%）
          </h2>
          {memorial.length > 0 && (
            <p className="hint">{(() => { const c = legacyCounts(memorial); return `传奇 ${c.legendary} · 青史 ${c.honored} · 凡逝 ${c.common}` })()}</p>
          )}
          {memorial.length === 0 ? (
            <p className="hint">还没有人牺牲。愿它一直空着。</p>
          ) : (
            memorial.map((h) => {
              const q = legacyQuality(h)
              const qLabel = q === 'legendary' ? '【传奇】' : q === 'honored' ? '【青史】' : '【凡逝】'
              const pct = q === 'legendary' ? 3 : q === 'honored' ? 2 : 1
              return (
                <div key={h.id} className="inv-item memorial-item">
                  ⚰ {h.name}（{JOBS[h.job].name} Lv{h.level}）——{h.cause}
                  <div className="hint" >
                    {qLabel} 光环 +{pct}%{h.legacy?.deeds?.length ? ` · ${h.legacy.deeds.join(' · ')}` : ''}
                  </div>
                  {/* R4.1 生平(U34):阵亡快照的永久条目摘录;老档无 bio 不渲染 */}
                  {h.bio?.filter((b) => b.permanent).slice(-3).map((b, i) => (
                    <div key={i} className="hint memorial-bio" >⚑ D{b.day} {b.text}</div>
                  ))}
                </div>
              )
            })
          )}
              </div>
            </div>
            </div>
  )
}
