import type { ReactNode } from 'react'
// roster 屏(U29 R2-5 自 App.tsx 迁出;行为零变)
import type { Member } from '../../sim/types'

interface RosterScreenProps {
  members: Member[]
  /** App 的 memberCard 渲染器(成员卡含展开详情/换装/档案入口) */
  renderMemberCard: (m: Member) => ReactNode
  onBack: () => void
}

export function RosterScreen({ members, renderMemberCard, onBack }: RosterScreenProps) {
  return (
            <div className="screen-overlay fullpage">
              <div className="screen-panel">
                <div className="screen-head">
                  <h2>🛡 花名册</h2>
                  <button className="screen-close" onClick={() => onBack()}>✕ Esc</button>
                </div>
                <div className="inv-panel">
                  {members.filter((m) => m.alive).map(renderMemberCard)}
                </div>
              </div>
            </div>
  )
}
