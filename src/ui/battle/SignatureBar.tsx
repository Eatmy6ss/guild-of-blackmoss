// A3 #1.1 招牌技能栏:玩家点名释放的主动技。App 只挂载本组件,不写进 App.tsx(U23 ⑦)。
// 目标 = 当前正在咏唱的敌人(intents.casterId 由 bossIntents 实时推导);无读条时按钮禁用。
import { SIGNATURE_SKILLS } from '../../data/signature'
import type { BattleState } from '../../sim/types'

export function SignatureBar(props: {
  battle: BattleState
  casterId?: string
  onUse: (memberId: string, targetId?: string) => void
}) {
  const { battle, casterId, onUse } = props
  const casters = battle.combatants.filter(
    (c) => c.team === 'guild' && c.alive && c.memberId && c.specId && SIGNATURE_SKILLS[c.specId],
  )
  if (casters.length === 0) return null
  return (
    <div className="signature-bar" role="group" aria-label="招牌技能">
      {casters.map((c) => {
        const skill = SIGNATURE_SKILLS[c.specId!]
        const readyAt = battle.signatureCd?.[c.memberId!] ?? 0
        const remaining = Math.max(0, readyAt - battle.tick)
        const disabled = remaining > 0 || !casterId
        return (
          <button
            key={c.id}
            className={`sig-btn${disabled ? '' : ' ready'}`}
            disabled={disabled}
            title={skill.desc + (casterId ? '' : ' · 目标没有在读条')}
            onClick={() => {
              if (!disabled) onUse(c.memberId!, casterId)
            }}
          >
            <span className="sig-name">【{skill.name}】</span>
            <span className="sig-meta">
              {c.name}
              {remaining > 0 ? ` · 冷却 ${remaining}` : casterId ? ' · 就绪' : ' · 无读条'}
            </span>
          </button>
        )
      })}
    </div>
  )
}
