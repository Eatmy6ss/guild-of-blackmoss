// A3 #1.1 招牌技能栏:玩家点名释放的主动技。App 只挂载本组件,不写进 App.tsx(U23 ⑦)。
// 目标语义:打断系=正在咏唱的敌人(intents.casterId);其余敌方点名=集火目标优先,兜底咏唱者/最残血;
// 友方系(圣疗)=按钮旁逐一点名队友。无读条只禁打断系,其他技能随时可用。
import { SIGNATURE_SKILLS } from '../../data/signature'
import type { BattleState } from '../../sim/types'

export function SignatureBar(props: {
  battle: BattleState
  casterId?: string
  focusId?: string
  onUse: (memberId: string, targetId?: string) => void
}) {
  const { battle, casterId, focusId, onUse } = props
  const casters = battle.combatants.filter(
    (c) => c.team === 'guild' && c.alive && c.memberId && c.specId && SIGNATURE_SKILLS[c.specId],
  )
  if (casters.length === 0) return null
  const foes = battle.combatants.filter((c) => c.team === 'enemy' && c.alive)
  const lowest = foes.reduce<BattleState['combatants'][number] | undefined>(
    (a, b) => (!a || b.hp / b.maxHp < a.hp / a.maxHp ? b : a), undefined,
  )
  return (
    <div className="signature-bar" role="group" aria-label="招牌技能">
      {casters.map((c) => {
        const skill = SIGNATURE_SKILLS[c.specId!]
        const readyAt = battle.signatureCd?.[c.memberId!] ?? 0
        const remaining = Math.max(0, readyAt - battle.tick)
        const isInterrupt = skill.effect.startsWith('interrupt')
        const targetId = isInterrupt
          ? casterId
          : skill.targeting === 'enemy'
            ? (focusId ?? casterId ?? lowest?.id)
            : undefined
        const disabled = remaining > 0 || (isInterrupt && !casterId)
        const meta = remaining > 0
          ? ` · 冷却 ${remaining}`
          : isInterrupt && !casterId
            ? ' · 无读条'
            : skill.targeting === 'enemy'
              ? ' · 对集火目标'
              : ''
        return (
          <div key={c.id} className="sig-group">
            <button
              className={`sig-btn${disabled ? '' : ' ready'}`}
              disabled={disabled || skill.targeting === 'ally'}
              title={skill.desc}
              onClick={() => {
                if (!disabled && skill.targeting !== 'ally') onUse(c.memberId!, targetId)
              }}
            >
              <span className="sig-name">【{skill.name}】</span>
              <span className="sig-meta">{c.name}{meta}</span>
            </button>
            {skill.targeting === 'ally' && (
              <span className="sig-allies">
                {battle.combatants
                  .filter((a) => a.team === 'guild' && a.alive && a.memberId)
                  .map((a) => (
                    <button
                      key={a.id}
                      className="sig-ally"
                      disabled={remaining > 0}
                      title={'对 ' + a.name + ' 施放【' + skill.name + '】'}
                      onClick={() => {
                        if (remaining <= 0) onUse(c.memberId!, a.memberId)
                      }}
                    >
                      {a.name}
                    </button>
                  ))}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
