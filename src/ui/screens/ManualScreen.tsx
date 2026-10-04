// manual 屏(U29 R2-5 自 App.tsx 迁出;行为零变)
import { DUNGEONS } from '../../data/dungeons'
import { ITEM_BASES } from '../../data/items'
import { MECHANIC_REGISTRY, mechanicBrief } from '../../sim/mechanic-registry'

import { GUILD_EVENTS } from '../../data/guild-events'
import { TRAIT_INFO } from '../../data/traits'

interface ManualScreenProps {
  manual: string[]
  /** 事件图鉴已见 id 集 */
  eventsSeen: string[]
  protectOn: boolean
  onToggleProtect: () => void
  onBack: () => void
}

export function ManualScreen({ manual, eventsSeen, protectOn, onToggleProtect, onBack }: ManualScreenProps) {
  return (
            <div className="screen-overlay fullpage">
              <div className="screen-panel">
                <div className="screen-head">
                  <h2>📖 战术手册</h2>
                  <button className="screen-close" onClick={() => onBack()}>✕ Esc</button>
                </div>
        <div className="inv-panel">
          <h2>📖 战术手册（已研习 boss 伤害 +5%）</h2>
          <p className="hint">
            {manual.length === 0 ? '尚未研习任何 boss。' : `已研习：${manual.map((id) => DUNGEONS.map((d) => d.bosses[id]?.name).find(Boolean) ?? id).join('、')}`}
          </p>
          <button
            className={protectOn ? 'active' : ''}
            onClick={() => onToggleProtect()}
          >
            🛡 撤退保护：{protectOn ? '开（濒危自动撤离）' : '关（搏命模式）'}
          </button>
          <div className="inv-panel">
            <h2>☠ boss 机制图鉴(击败即研习,研习 boss 伤害 +5%)</h2>
            {DUNGEONS.map((d) => (
              <div key={d.id} className="inv-item">
                <b>🗺 {d.name}</b>
                {Object.values(d.bosses).map((boss) => {
                  const learned = manual.includes(boss.id)
                  return (
                    <div key={boss.id} style={{ marginTop: 6 }}>
                      {learned ? (
                        <>
                          <div>
                            👹 <b>{boss.name}</b>
                            <span className="hint">（{boss.maxHp} 血 / {boss.attack} 攻 / {boss.position === 'front' ? '前排' : '后排'}）</span>
                          </div>
                          {boss.mechanics.map((m) => (
                            <div key={m.id} className="hint" style={{ marginLeft: 14, marginTop: 2 }}>
                              ▸〔{MECHANIC_REGISTRY[m.kind]?.label ?? m.kind}〕<b>{m.name}</b> —— {mechanicBrief(m)}
                            </div>
                          ))}
                          <div className="hint" style={{ marginLeft: 14, marginTop: 2 }}>
                            🎁 固定掉落：{boss.dropTable.map((dr) => `${ITEM_BASES[dr.baseId]?.name ?? dr.baseId}（${Math.round(dr.chance * 100)}%）`).join('、')}
                          </div>
                        </>
                      ) : (
                        <div className="hint" style={{ marginTop: 2 }}>🔒 ??? ——击败后研习其招式</div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
          <div className="inv-panel">
            <h2>📜 事件图鉴（见过 {eventsSeen.length} / {GUILD_EVENTS.length}）</h2>
            {GUILD_EVENTS.map((e) => {
              const seen = eventsSeen.includes(e.id)
              return (
                <div key={e.id} className="inv-item">
                  {seen ? (
                    <>
                      <b>{e.title}</b>
                      <div className="hint">{e.text}</div>
                    </>
                  ) : (
                    <div className="hint">❓ ??? ——传闻里还没轮到你们的遭遇</div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="inv-panel">
            <h2>👹 小怪特性图鉴（首次遭遇会收到提示）</h2>
            {Object.values(TRAIT_INFO).map((tr) => (
              <div key={tr.id} className="inv-item">
                <b>{tr.name}</b> —— {tr.desc}
                <div className="hint">💡 {tr.hint}</div>
              </div>
            ))}
          </div>
              </div>
            </div>
            </div>
  )
}
