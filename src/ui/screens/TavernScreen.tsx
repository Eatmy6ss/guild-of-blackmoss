// tavern 屏(U29 R2-5 自 App.tsx 迁出;行为零变——招募处理器留 App,props 下传)
import { useState } from 'react'
import { HeroPortrait } from '../art/ArtCanvas'
import { JOBS, specOf } from '../../data/jobs'
import { HYBRIDS, isHybrid } from '../../data/vocations'
import { RACES } from '../../data/races'
import { ECONOMY } from '../../data/economy'
import { powerScore } from '../../sim/combat'
import { attrsLine, natureLine, personalityLine } from './member-lines'
import type { Member } from '../../sim/types'
import type { Visitor } from '../../sim/tavern'

interface TavernScreenProps {
  gold: number
  blessing: number
  members: Member[]
  visitor: Visitor | null
  candidates: Member[]
  effectiveCooldown: number
  /** 远征/爬塔中=true(招募类按钮禁用) */
  busy: boolean
  /** 庆功宴(60 金,含酒馆加成与爱喝酒个体,App 单一来源) */
  onFeast: () => void
  onWaitNight: () => void
  onSign: () => void
  onBounty: (job: Member['job']) => void
  onTale: () => void
  onHire: (m: Member) => void
  onBack: () => void
  /** R4.3(U30):情报贩子——副本选项/待用情报/购买 */
  dungeonOptions: { id: string; name: string }[]
  intelPending: Record<string, boolean>
  intelCost: number
  intelNotice: string | null
  onBuyIntel: (dungeonId: string) => void
}

const ROSTER_CAP = 6
const ROLE_NAME: Record<string, string> = { tank: '坦克', healer: '治疗', dps: '输出' }
const START_JOBS = ['guard', 'priest', 'ranger'] as const

export function TavernScreen(props: TavernScreenProps) {
  const { gold, blessing, members, visitor, candidates, effectiveCooldown, onBack } = props
  return (
            <div className="screen-overlay fullpage">
              <div className="screen-panel">
                <div className="screen-head">
                  <h2>🍺 酒馆</h2>
                  <button className="screen-close" onClick={() => onBack()}>✕ Esc</button>
                </div>
                <p className="screen-sub">
                  💰 {gold} · 🕯 祝福 {blessing} · 招募位 {members.filter((m) => m.alive).length}/{ROSTER_CAP}
                </p>
          <p className="hint">
            {effectiveCooldown > 0
              ? `招募冷却：完成 ${effectiveCooldown} 场战斗后解除（上门访客不受影响）`
              : members.filter((m) => m.alive).length < 3
                ? '⚠ 人手不足：紧急招募免冷却'
                : '可招募'}
          </p>
          {visitor ? (
            <div className="member-card candidate">
              <div className="mc-head">
                <HeroPortrait member={visitor.member} />
                <span className="name">🚪 {visitor.member.name}</span>
                <span className="job">
                  {JOBS[visitor.member.job].name} Lv{visitor.member.level} · {ROLE_NAME[JOBS[visitor.member.job].role]}
                </span>
                <span className="hp">战力 {powerScore(visitor.member)}</span>
              </div>
              <div className="row">
                <span>{attrsLine(visitor.member)}</span>
                <span>{personalityLine(visitor.member)}</span>
              </div>
              <p className="hint">“{visitor.story}”</p>
              <button onClick={props.onSign} disabled={props.busy || members.filter((m) => m.alive).length >= ROSTER_CAP}>
                ✋ 免费签下（缘分不排队）
              </button>
            </div>
          ) : members.filter((m) => m.alive).length < 3 ? (
            <div>
              <p className="hint">🚪 暂时没有访客——但公会正缺人手,守夜人去酒馆后巷喊一嗓子总会有人应。</p>
              <button
                disabled={props.busy}
                onClick={props.onWaitNight}
              >
                🌙 在酒馆等一晚(必定有人上门)
              </button>
            </div>
          ) : (
            <p className="hint">🚪 暂时没有访客——每次回城都有概率有人上门。</p>
          )}
          <div className="tavern-row">
            <button
              disabled={props.busy || gold < 60}
              onClick={props.onFeast}
            >
              🍻 庆功宴（60 金）：全员士气 +30
            </button>
          </div>
          <div className="tavern-row">
            <span className="cmd-label">定向悬赏：</span>
            {START_JOBS.map((job) => (
              <button
                key={job}
                disabled={props.busy || effectiveCooldown > 0 || gold < ECONOMY.bountyCost || members.filter((m) => m.alive).length >= ROSTER_CAP}
                onClick={() => props.onBounty(job)}
              >
                {JOBS[job].name} {ECONOMY.bountyCost} 金
              </button>
            ))}
          </div>
          <div className="tavern-row">
            <button
              disabled={props.busy || effectiveCooldown > 0 || gold < ECONOMY.taleCost.gold || blessing < ECONOMY.taleCost.blessing || members.filter((m) => m.alive).length >= ROSTER_CAP}
              onClick={props.onTale}
            >
              🎲 酒馆传闻：{ECONOMY.taleCost.gold} 金 + {ECONOMY.taleCost.blessing} 祝福，三选一（品质更高）
            </button>
          </div>
          {/* R4.3(U30):情报贩子——真假掺卖,出发进对应副本才兑现 */}
          <IntelVendor {...props} />
          {candidates.length > 0 && (
            <div>
              <h2>来应征的冒险者（选一位入职）</h2>
              {candidates.map((m) => (
                <div key={m.id} className="member-card candidate">
                  <div className="mc-head">
                    <HeroPortrait member={m} />
                    <span className="name">{m.name}</span>
                    <span className="job">
                      {RACES[m.race ?? 'human'].name}·{isHybrid(m.spec) ? HYBRIDS[m.spec!].name : specOf(m.job, m.spec).name}({JOBS[m.job].name}) Lv{m.level}
                    </span>
                    <div className="row">
                      <span className="hint">{isHybrid(m.spec) ? HYBRIDS[m.spec!].identity : specOf(m.job, m.spec).identity}</span>
                    </div>
                    <span className="hp">战力 {powerScore(m)}</span>
                  </div>
                  <div className="row">
                    <span>{attrsLine(m)} · {natureLine(m)}</span>
                  </div>
                  <div className="row">
                    <span>{personalityLine(m)}</span>
                  </div>
                  <button onClick={() => props.onHire(m)}>✋ 招募入职</button>
                </div>
              ))}
            </div>
          )}
              </div>
            </div>
  )
}

// R4.3(U30):情报贩子区——真假掺卖(75% 真,C4 占位),话术不泄露真伪
function IntelVendor(props: TavernScreenProps) {
  const { dungeonOptions, intelPending, intelCost, intelNotice, onBuyIntel, gold, busy } = props
  const [sel, setSel] = useState(dungeonOptions[0]?.id ?? '')
  const pendingName = dungeonOptions.find((d) => intelPending[d.id])?.name
  return (
    <div className="potion-supply">
      <span className="hint">🕵 情报贩子——花 {intelCost} 金买一份副本情报。他不说真话也不说假话:出发进该副本才见分晓(真=迷雾提前揭开一层;假=路上见真章)。</span>
      <div className="tavern-row">
        <select aria-label="情报副本" value={sel} onChange={(e) => setSel(e.target.value)}>
          {dungeonOptions.map((d) => <option key={d.id} value={d.id}>{d.name}{intelPending[d.id] !== undefined ? '(已购·未验证)' : ''}</option>)}
        </select>
        <button disabled={busy || !sel || gold < intelCost} onClick={() => onBuyIntel(sel)}>🕵 买情报（{intelCost} 金）</button>
      </div>
      {pendingName && <p className="hint">袖中还有一份关于「{pendingName}」的情报,还没验证过。</p>}
      {intelNotice && <p className="hint" role="status">{intelNotice}</p>}
    </div>
  )
}
