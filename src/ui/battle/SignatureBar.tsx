import { Meter } from '../Meter'
import { Tooltip } from '../Tooltip'
import { SIGNATURE_SKILLS } from '../../data/signature'
import type { CSSProperties } from 'react'
import type { BattleState, Member } from '../../sim/types'
import { HeroPortrait } from '../art/ArtCanvas'
import { signaturePresentation } from './signaturePresentation'

export function SignatureBar({ battle, members = [], casterId, focusId, onUse }: {
  battle: BattleState; members?: Member[]; casterId?: string; focusId?: string
  onUse: (memberId: string, targetId?: string) => void
}) {
  const casters = battle.combatants.filter(c => c.team === 'guild' && c.alive && c.memberId && SIGNATURE_SKILLS[c.specId ?? ''])
  if (!casters.length) return null
  return <section className="signature-bar" aria-label="招牌技能" style={{ '--sig-columns': Math.min(casters.length, 5) } as CSSProperties}>
    <div className="signature-heading"><strong>招牌技 · 把握时机</strong><small>冷却按战斗时间 · 暂停时可为每位队员下令</small></div>
    {casters.map(c => {
      const view = signaturePresentation(battle, c, casterId, focusId)!
      const member = members.find(m => m.id === c.memberId)
      const allies = battle.combatants.filter(a => a.team === 'guild' && a.alive && a.memberId)
      const cooldown = view.remaining ? Math.min(100, view.remaining / view.skill.cdTicks * 100) : 0
      return <article key={c.id} className={`sig-card${view.unavailable ? '' : ' ready'}${view.ownQueued ? ' queued' : ''}`}>
        <div className="sig-owner">{member && <HeroPortrait member={member} size={32} />}<span className="sig-owner-name">{c.name}</span><strong>{view.state}</strong></div>
        {view.skill.targeting === 'ally' ? <h3 className="sig-name">{view.skill.name}</h3> :
          <Tooltip content={<><strong>{view.skill.name}</strong>{view.skill.desc}<small>{view.state}</small></>}><button className="sig-btn" disabled={view.unavailable} onClick={() => onUse(c.memberId!, view.target?.id)}>
            <span className="sig-name">{view.skill.name}</span><span className="sig-action">{view.ownQueued ? '已下令' : view.unavailable ? '暂不可用' : '施放 →'}</span>
          </button></Tooltip>}
        <p className="sig-target">{view.targetText}</p>
        {view.skill.targeting === 'ally' && <div className="sig-allies" aria-label={`${c.name}的圣疗目标`}>
          {allies.map(a => <button key={a.id} className="sig-ally" disabled={view.unavailable} onClick={() => onUse(c.memberId!, a.memberId)}>
            <span>{a.name}</span><small>{a.hp}/{a.maxHp}</small>
          </button>)}
        </div>}
        <Meter className="sig-cooldown" value={100 - cooldown} max={100} aria-label={`${c.name}的${view.skill.name}冷却恢复`} />
      </article>
    })}
    <details className="signature-guide"><summary>查看本队招牌技说明</summary>
      {casters.map(c => <p className="sig-desc" key={c.id}><strong>{SIGNATURE_SKILLS[c.specId!].name}</strong> · {SIGNATURE_SKILLS[c.specId!].desc}</p>)}
    </details>
  </section>
}
