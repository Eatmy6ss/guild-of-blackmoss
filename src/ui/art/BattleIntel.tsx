import type { BattleState, Member } from '../../sim/types'
import type { CSSProperties } from 'react'
import { sceneArt } from './catalog'
import { ArtCanvas, HeroPortrait } from './ArtCanvas'
import { spriteKeyFor } from '../battle/pixelSprites'
import { combatantBadges, mechanicWindows } from '../battle/mechanicPresentation'
export function BattleIntel({ battle, members, mapId, paused }: { battle: BattleState; members: Member[]; mapId: string; paused: boolean }) {
  const guild = battle.combatants.filter(c => c.team === 'guild' && c.memberId)
  const enemies = battle.combatants.filter(c => c.team === 'enemy' && c.alive)
  const focused = enemies.find(c => c.id === battle.commands.focusId)
  const featured = focused ?? enemies.find(c => c.boss)
  const windows = enemies.flatMap(c => mechanicWindows(battle, c).map(window => ({ ...window, unit: c })))
  return <>
    <div className="battle-intel">
      <div className="battle-location"><strong>{sceneArt(mapId).name}</strong><span>{paused ? '已暂停' : '交战中'} · 敌方 {enemies.length}</span></div>
      <div className={`intel-content${featured ? ' has-enemy' : ''}`}>
      {featured && <div className="enemy-intel">
        <ArtCanvas paths={[spriteKeyFor(featured).replace(/^mon-(.+)$/, '/assets/mon/$1.png')]} size={64} label={featured.name} />
        <div><strong>{focused ? '集火' : '首领'} · {featured.name}</strong><span>{featured.hp}/{featured.maxHp}</span>
          <div className="status-badges">{combatantBadges(featured, battle.tick).map(badge => <span key={badge}>{badge}</span>)}</div>
        </div>
      </div>}
      <div className="mechanic-list">{windows.length ? windows.map(window => <div className="mechanic-warning" key={`${window.unit.id}-${window.kind}`} role="status">
        <strong>⚠ {window.unit.name} · {window.name}</strong><span>还剩 {(window.remaining / 10).toFixed(1)}秒 · {window.interruptible ? '可打断' : '准备应对'}</span>
        <progress value={window.remaining} max={window.total} aria-label={`${window.name}剩余读条`} />
        <small>{window.counter}{window.interruptible ? ` · 累计伤害 ${Math.floor(window.taken ?? 0)}/${window.breakDamage}` : ''}</small>
      </div>) : <p role="status">{focused ? `正在集火：${focused.name}` : '点击敌人集火 · 留意阵型与队员状态'}</p>}</div>
      </div>
    </div>
    <div className="battle-party" aria-label="远征队状态" style={{ '--party-columns': Math.min(guild.length, 5) || 1 } as CSSProperties}>
      {guild.map(c => {
        const member = members.find(m => m.id === c.memberId)
        return <div key={c.id} className={c.alive ? '' : 'fallen'}>
          {member && <HeroPortrait member={member} size={32} />}
          <div><span>{c.name}</span><small>{c.alive ? `${c.hp}/${c.maxHp}` : '已倒下'}</small>
            <div className="status-badges">{combatantBadges(c, battle.tick).map(badge => <span key={badge}>{badge}</span>)}</div>
          </div>
        </div>
      })}
    </div>
  </>
}
