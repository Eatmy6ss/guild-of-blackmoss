import { Tooltip } from '../Tooltip'
import { SIGNATURE_SKILLS } from '../../data/signature'
import type { CSSProperties } from 'react'
import type { BattleState, Member } from '../../sim/types'
import { HeroPortrait } from '../art/ArtCanvas'
import { signaturePresentation } from './signaturePresentation'

export function SignatureBar({ battle, members, casterId, focusId, selectedId, aim, onAim, onUse }: {
  battle: BattleState; members: Member[]; casterId?: string; focusId?: string; selectedId?: string
  aim: { kind: string; memberId: string; skillId: string } | null
  onAim: (a: { kind: 'sig'; memberId: string; skillId: string }) => void
  onUse: (memberId: string, targetId?: string) => void
}) {
  const casters = battle.combatants.filter(c => c.team === 'guild' && c.memberId && SIGNATURE_SKILLS[c.specId ?? ''])
  return <section className="signature-bar" aria-label="招牌技能">
    {casters.map(c => {
      const view = signaturePresentation(battle, c, casterId, focusId)!
      const member = members.find(m => m.id === c.memberId)
      const hotkey = selectedId === c.memberId ? 'QWE'[c.skills.length] : undefined
      const cooling = Math.min(1, view.remaining / view.skill.cdTicks)
      return <Tooltip key={c.id} content={<><strong>{c.name} · {view.skill.name}</strong>{view.skill.desc}<small>{view.state} · {view.targetText}{hotkey ? ' · ' + hotkey : ''}</small></>}>
        <button className={'sig-btn action-slot' + (view.unavailable ? '' : ' ready') + (view.ownQueued ? ' queued' : '') + (aim?.kind === 'sig' && aim.memberId === c.memberId ? ' active' : '')} disabled={view.unavailable} aria-label={c.name + '的' + view.skill.name + '：' + view.state} onClick={() => view.skill.targeting === 'ally' ? onAim({ kind: 'sig', memberId: c.memberId!, skillId: view.skill.id }) : onUse(c.memberId!, view.target?.id)}>
          {member && <HeroPortrait member={member} size={64} />}<kbd>{hotkey}</kbd>
          {cooling > 0 && <i className="cooldown-sweep" style={{ '--cooldown': cooling * 100 + '%' } as CSSProperties} />}
          <strong>{view.remaining > 0 ? Math.ceil(view.remaining / 10) + 's' : view.ownQueued ? '已下令' : !c.alive ? '倒下' : ''}</strong>
          <span className="sig-name">{view.skill.name}</span>
        </button>
      </Tooltip>
    })}
  </section>
}
