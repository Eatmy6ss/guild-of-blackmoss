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
import { DUNGEONS } from '../../data/dungeons'
import { INTEL_TIERS, INTEL_PER_DUNGEON, intelDungeonFull } from '../../sim/intel'

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
  /** U36:情报贩子——条目化记录/三档价格/类型/货源 */
  intelEntries: import('../../sim/intel').IntelEntry[]
  intelStock: number
  intelNotice: string | null
  onBuyIntel: (dungeonId: string, kind: import('../../sim/intel').IntelKind, tierId: string) => void
  /** #4.4 宿舍:名册上限(6+每级1) */
  rosterCap: number
}

const ROLE_NAME: Record<string, string> = { tank: '坦克', healer: '治疗', dps: '输出' }
const START_JOBS = ['guard', 'priest', 'ranger'] as const

export function TavernScreen(props: TavernScreenProps) {
  const { gold, blessing, members, visitor, candidates, effectiveCooldown, onBack, rosterCap } = props
  return (
            <div className="screen-overlay fullpage">
              <div className="screen-panel">
                <div className="screen-head">
                  <h2>🍺 酒馆</h2>
                  <button className="screen-close" onClick={() => onBack()}>✕ Esc</button>
                </div>
                <p className="screen-sub">
                  💰 {gold} · 🕯 祝福 {blessing} · 招募位 {members.filter((m) => m.alive).length}/{rosterCap}
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
              <button onClick={props.onSign} disabled={props.busy || members.filter((m) => m.alive).length >= rosterCap}>
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
                disabled={props.busy || effectiveCooldown > 0 || gold < ECONOMY.bountyCost || members.filter((m) => m.alive).length >= rosterCap}
                onClick={() => props.onBounty(job)}
              >
                {JOBS[job].name} {ECONOMY.bountyCost} 金
              </button>
            ))}
          </div>
          <div className="tavern-row">
            <button
              disabled={props.busy || effectiveCooldown > 0 || gold < ECONOMY.taleCost.gold || blessing < ECONOMY.taleCost.blessing || members.filter((m) => m.alive).length >= rosterCap}
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

// U36:情报贩子区——货源有限(每出发日+1),三档价格越贵越真,首领/杂兵两类;
// 买完立刻展示获得的文本;已获情报按副本列出(验证后才标真伪)
function IntelVendor(props: TavernScreenProps) {
  const { intelEntries, intelStock, intelNotice, onBuyIntel, gold, busy } = props
  const dungeons = DUNGEONS.map((d) => ({ id: d.id, name: d.name }))
  const [sel, setSel] = useState(dungeons[0]?.id ?? '')
  const [kind, setKind] = useState<import('../../sim/intel').IntelKind>('boss')
  const [tierId, setTierId] = useState('veteran')
  const tier = INTEL_TIERS.find((t) => t.id === tierId) ?? INTEL_TIERS[1]!
  const full = intelDungeonFull(intelEntries, sel)
  const known = intelEntries.filter((e) => e.dungeonId === sel)
  return (
    <div className="potion-supply">
      <span className="hint">🕵 情报贩子——货架上有 {intelStock} 份消息(每过一天补一份)。他不说真话也不说假话:档位越贵越可靠,但只有亲自走过一趟,才知道情报是真是假。</span>
      <div className="tavern-row">
        <select aria-label="情报副本" value={sel} onChange={(e) => setSel(e.target.value)}>
          {dungeons.map((d) => <option key={d.id} value={d.id}>{d.name}{intelDungeonFull(intelEntries, d.id) ? '(情报已齐)' : ''}</option>)}
        </select>
        <select aria-label="情报类型" value={kind} onChange={(e) => setKind(e.target.value as import('../../sim/intel').IntelKind)}>
          <option value="boss">首领情报</option>
          <option value="mob">杂兵情报</option>
        </select>
        <select aria-label="情报档位" value={tierId} onChange={(e) => setTierId(e.target.value)}>
          {INTEL_TIERS.map((t) => <option key={t.id} value={t.id}>{t.name}({t.gold} 金 · {Math.round(t.realChance * 100)}% 可靠)</option>)}
        </select>
        <button disabled={busy || intelStock <= 0 || full || gold < tier.gold} onClick={() => onBuyIntel(sel, kind, tierId)}>
          🕵 买情报({tier.gold} 金){intelStock <= 0 ? ' · 货空了' : full ? ' · 情报已齐' : ''}
        </button>
      </div>
      <p className="hint">{tier.desc}。消息会记录怪物或首领的线索；一份未用过的可靠情报可让本趟地图提前揭示一档，看清部分原本未知的路线，不增加永久熟练度。同一副本最多留 {INTEL_PER_DUNGEON} 条。</p>
      {intelNotice && <p className="intel-fresh" role="status">📢 {intelNotice}</p>}
      {known.length > 0 && (
        <ul className="intel-list">
          {known.map((e) => (
            <li key={e.id} className="intel-item">
              <span className="intel-kind">{e.kind === 'boss' ? '👑' : '🗡'}</span>
              <span className="intel-text">{e.text}</span>
              <span className="intel-flag">{e.verified === undefined ? '未验证' : e.real ? '✓ 属实' : '✗ 假货'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
