import { useState } from 'react'
// roster 屏 v2(U35,制作人 2026-10-06 反馈②③):一打开花名册=人物详细页;
// 右下角=角色略缩图(MemberCard)+六维雷达图;顶部成员切换条;武器专修迁入档案页。
import type { BattleState, ItemInstance, Member, Slot } from '../../sim/types'
import type { DungeonRun } from '../../sim/run'
import { MemberPanel } from './MemberPanel'
import { MemberCard } from '../MemberCard'
import { HexStat } from './HexStat'

interface RosterScreenProps {
  members: Member[]
  battle: BattleState | null
  run: DungeonRun | null
  expedition: Member[]
  inventory: ItemInstance[]
  expeditionIds: string[]
  onEquip: (m: Member, slot: Slot, itemId: string) => void
  onEnter: (id: string) => void
  onLeave: (id: string) => void
  /** U35:武器专修(按人学族,处理器在 App) */
  gold: number
  busy: boolean
  today: number
  trainingLevel: number
  onLearnFamily: (memberId: string, family: string) => void
  onBack: () => void
}

export function RosterScreen(props: RosterScreenProps) {
  const { members, battle, run, expedition, inventory, expeditionIds, onEquip, onEnter, onLeave, gold, busy, today, trainingLevel, onLearnFamily, onBack } = props
  const alive = members.filter((m) => m.alive)
  const [selId, setSelId] = useState(alive[0]?.id ?? '')
  const sel = alive.find((m) => m.id === selId) ?? alive[0]
  if (!sel) {
    return (
      <div className="screen-overlay fullpage">
        <div className="screen-panel">
          <div className="screen-head"><h2>🛡 花名册</h2><button className="screen-close" onClick={() => onBack()}>✕ Esc</button></div>
          <p className="hint">名册空空如也——去酒馆招几位冒险者吧。</p>
        </div>
      </div>
    )
  }
  const trainSel = (f: string) => onLearnFamily(sel.id, f)
  return (
    <div className="screen-overlay fullpage">
      <div className="screen-panel roster-v2">
        <div className="screen-head"><h2>🛡 花名册</h2><button className="screen-close" onClick={() => onBack()}>✕ Esc</button></div>
        {/* 成员切换条:点谁看谁的档案 */}
        <div className="roster-tabs" role="tablist" aria-label="切换成员">
          {alive.map((m) => (
            <button key={m.id} role="tab" aria-selected={m.id === sel.id}
              className={`roster-tab${m.id === sel.id ? ' active' : ''}`}
              onClick={() => setSelId(m.id)}>
              {m.name}
            </button>
          ))}
        </div>
        <div className="roster-main">
          <div className="roster-detail">
            <MemberPanel member={sel} members={members} onClose={onBack} embedded
              inventory={inventory} onEquip={(slot, itemId) => onEquip(sel, slot, itemId)}
              familyTraining={{ gold, busy, busyUntilDay: sel.busyUntilDay ?? 0, today, trainingLevel, onLearn: trainSel }} />
          </div>
          <aside className="roster-side">
            {/* 右下:角色略缩图(现有成员卡)+六维雷达图 */}
            <MemberCard member={sel} battle={battle} run={run} expedition={expedition}
              onOpen={setSelId} onEnter={onEnter} onLeave={onLeave}
              inventory={inventory} expeditionIds={expeditionIds} onEquip={onEquip} />
            <HexStat member={sel} />
          </aside>
        </div>
      </div>
    </div>
  )
}
