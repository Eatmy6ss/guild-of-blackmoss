import type { GuildEventDef } from '../../data/guild-events'

// R5.2c(U33⑦):事件弹层自 App.tsx 迁出——行为零变,处理器留 App(resolve/dismiss 经 props)。
export function EventModal({ event, result, impacts, inBattle, onResolve, onDismiss }: {
  event: GuildEventDef
  result: string | null
  impacts: { t: string; tone?: string }[]
  inBattle: boolean
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
