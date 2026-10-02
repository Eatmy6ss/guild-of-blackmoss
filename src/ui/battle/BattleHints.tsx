// A10 战斗一次性提示(招牌技/集火/撤退各一次; dismissing 写回存档 hintsSeen)
export interface BattleHintItem {
  id: string
  text: string
}

export function BattleHints(props: { hints: BattleHintItem[]; onDismiss: (id: string) => void }) {
  // S10:一次只弹一条(同屏多条会淹掉战斗);「知道了」后下一条才出现
  const hint = props.hints[0]
  if (!hint) return null
  return (
    <div className="battle-hints" role="status">
      <div className="battle-hint">
        <span className="bh-text">💡 {hint.text}</span>
        <button className="bh-ok" onClick={() => props.onDismiss(hint.id)}>知道了</button>
      </div>
    </div>
  )
}
