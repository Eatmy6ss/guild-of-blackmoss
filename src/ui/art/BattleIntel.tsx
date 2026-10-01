import type { BattleState, Member } from '../../sim/types'
import { bossIntents } from '../../sim/mechanics'
import { sceneArt } from './catalog'
import { HeroPortrait } from './ArtCanvas'
export function BattleIntel({ battle, members, mapId, paused }: { battle: BattleState; members: Member[]; mapId: string; paused: boolean }) {
  const intent = bossIntents(battle)
  const guild = battle.combatants.filter(c => c.team === 'guild' && c.memberId)
  const enemies = battle.combatants.filter(c => c.team === 'enemy' && c.alive)
  const focused = battle.combatants.find(c => c.id === battle.commands.focusId)
  return <>
    <div className="battle-intel">
      <div><strong>{sceneArt(mapId).name}</strong><span>{paused ? '已暂停' : '交战中'} · 敌方 {enemies.length}</span></div>
      <p className={intent.telegraphing || intent.casting ? 'mechanic-warning' : ''} role="status">
        {intent.telegraphing ? '⚠ 蓄力中：切换分散阵型减伤' : intent.casting ? '⚠ 可打断咏唱：集中火力打断' : focused?.alive ? `正在集火：${focused.name}` : '点击敌人集火 · 生命延续，倒下即牺牲'}
      </p>
    </div>
    <div className="battle-party" aria-label="远征队状态">
      {guild.map(c => {
        const member = members.find(m => m.id === c.memberId)
        return <div key={c.id} className={c.alive ? '' : 'fallen'}>
          {member && <HeroPortrait member={member} size={32} />}
          <div><span>{c.name}</span><small>{c.alive ? `${c.hp}/${c.maxHp}` : '已倒下'}</small></div>
        </div>
      })}
    </div>
  </>
}
