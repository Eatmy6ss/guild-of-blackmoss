// A10 战斗一次性提示(招牌技/集火/撤退各一次; dismissing 写回存档 hintsSeen)
export interface BattleHintItem {
  id: string
  text: string
}

export function BattleHints(props: { hints: BattleHintItem[]; onDismiss: (id: string) => void }) {
  if (props.hints.length === 0) return null
  return (
    <div className="battle-hints" role="status">
      {props.hints.map((h) => (
        <div key={h.id} className="battle-hint">
          <span className="bh-text">💡 {h.text}</span>
          <button className="bh-ok" onClick={() => props.onDismiss(h.id)}>知道了</button>
        </div>
      ))}
    </div>
  )
}
