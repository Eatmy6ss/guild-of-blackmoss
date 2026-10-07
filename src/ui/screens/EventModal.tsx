import type { GuildEventDef } from '../../data/guild-events'
import { ATTR_DIMS, ATTR_DIM_LABELS } from '../controllers'

// R5.2c(U33⑦):事件弹层自 App.tsx 迁出——行为零变,处理器留 App(resolve/dismiss 经 props)。
// #4.5(B9):事件属性点改玩家指定维——结果面板选维度后入账。
export function EventModal({ event, result, impacts, inBattle, attrChoice, onChooseAttr, onResolve, onDismiss }: {
  event: GuildEventDef
  result: string | null
  impacts: { t: string; tone?: string }[]
  inBattle: boolean
  attrChoice?: { amount: number } | null
  onChooseAttr?: (dim: string) => void
  onResolve: (i: number) => void
  onDismiss: () => void
}) {
  return (
    <div className="screen-overlay event-overlay">
      <div className="screen-panel event-modal">
        <div className="screen-head">
          <h2>⚖ {event.title}</h2>
        </div>
        {result ? (
          <>
            <p className="event-result">{result}</p>
            {impacts.length > 0 && (
              <div className="event-impacts">
                {impacts.map((im, i) => (
                  <span key={i} className={`impact-chip${im.tone ? ` impact-${im.tone}` : ''}`}>{im.t}</span>
                ))}
              </div>
            )}
            {attrChoice && onChooseAttr && (
              <div className="event-choices" role="group" aria-label="选择要强化的维度">
                <p className="hint">全队每人 +{attrChoice.amount} 点——选择要强化的维度:</p>
                {ATTR_DIMS.map((d) => (
                  <button key={d} onClick={() => onChooseAttr(d)}>{ATTR_DIM_LABELS[d] ?? d} +{attrChoice.amount}</button>
                ))}
              </div>
            )}
            <button onClick={onDismiss}>知道了</button>
          </>
        ) : (
          <>
            <p className="event-text">{event.text}</p>
            <div className="event-choices">
              {event.choices.map((c, i) => (
                <button key={i} disabled={inBattle} onClick={() => onResolve(i)}>
                  {c.text}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
