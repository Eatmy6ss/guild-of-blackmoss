import { Meter } from '../Meter'
import { Tooltip } from '../Tooltip'
import type { BattleState, Combatant, Member } from '../../sim/types'
import { HeroPortrait } from './ArtCanvas'
import { combatantBadges, mechanicWindows } from '../battle/mechanicPresentation'

export function BattleIntel({ battle, members, selectedIds, onUnit }: {
  battle: BattleState; members: Member[]; selectedIds: string[]
  onUnit: (unit: Combatant, additive?: boolean) => void
}) {
  const guild = battle.combatants.filter(c => c.team === 'guild' && c.memberId)
  const enemies = battle.combatants.filter(c => c.team === 'enemy' && c.alive)
  const focused = enemies.find(c => c.id === battle.commands.focusId)
  const featured = focused ?? enemies.find(c => c.boss) ?? enemies[0]
  const windows = enemies.flatMap(c => mechanicWindows(battle, c).map(window => ({ ...window, unit: c }))).sort((a, b) => a.remaining - b.remaining)
  return <>
    <div className="battle-party squad-strip" role="group" aria-label="远征队状态与选择">
      {guild.map((c, i) => {
        const member = members.find(m => m.id === c.memberId)
        const badges = combatantBadges(c, battle.tick)
        return <Tooltip key={c.id} content={<><strong>{c.name}</strong>{c.alive ? '生命 ' + c.hp + '/' + c.maxHp : '已倒下'}<small>{badges.join(' · ') || '无额外状态'} · Shift 加选 · 瞄准时可点头像施法</small></>}>
          <button className={'party-frame' + (selectedIds.includes(c.memberId!) ? ' active' : '') + (c.alive ? '' : ' fallen')} disabled={!c.alive} onClick={e => onUnit(c, e.shiftKey)} aria-pressed={selectedIds.includes(c.memberId!)} aria-label={c.name + (c.alive ? '，生命 ' + c.hp + '/' + c.maxHp : '，已倒下')}>
            {member && <HeroPortrait member={member} size={56} />}
            <span className="party-reading"><strong>{c.name}</strong><span className="party-hp"><Meter tone="health" value={c.hp} max={c.maxHp} aria-label={c.name + '生命'} /><small>{c.alive ? c.hp + '/' + c.maxHp : '已倒下'}</small></span><small className="party-state">{badges.join(' · ') || (c.holdGround ? '坚守' : c.alive ? '待命 / 交战' : '本场阵亡')}</small></span>
            <kbd>{i + 1}</kbd>
          </button>
        </Tooltip>
      })}
    </div>
    <section className="battle-intel" aria-label="敌方目标与机制">
      {featured && <div className="enemy-intel">
        <button className="enemy-title" onClick={() => onUnit(featured)}>{featured.name} <small>{featured.boss ? '首领' : '敌方'}{focused ? ' · 集火' : ''}</small></button>
        <div className="enemy-hp"><Meter tone="enemy" value={featured.hp} max={featured.maxHp} aria-label={featured.name + '生命'} /><span>{featured.hp} / {featured.maxHp}</span>
          {featured.bossMechanics?.flatMap(m => typeof m.params.atHpPct === 'number' ? [<i key={m.id} className="phase-mark" style={{ left: m.params.atHpPct * 100 + '%' }} title={m.name + ' · 生命 ' + Math.round(m.params.atHpPct * 100) + '% 触发'} />] : [])}
        </div>
        <div className="status-badges">{combatantBadges(featured, battle.tick).map(badge => <span key={badge}>{badge}</span>)}</div>
      </div>}
      <div className="mechanic-list">{windows.map(window => <div className={'mechanic-warning' + (window.interruptible ? ' interruptible' : ' unavoidable')} key={window.unit.id + window.kind} role="status">
        <div className="cast-label"><strong>{window.unit.name} · {window.name}</strong><span>{(window.remaining / 10).toFixed(1)} 秒</span></div>
        <Meter tone="cast" value={window.remaining} max={window.total} aria-label={window.name + '剩余读条'} />
        <small>{window.interruptible ? '可打断：' : '准备应对：'}{window.counter}{window.interruptible ? ' · 伤害 ' + Math.floor(window.taken ?? 0) + '/' + window.breakDamage : ''}</small>
      </div>)}</div>
    </section>
  </>
}
