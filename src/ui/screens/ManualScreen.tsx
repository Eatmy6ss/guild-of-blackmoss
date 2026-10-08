// manual 屏(U29 R2-5 自 App.tsx 迁出;行为零变)
import { DUNGEONS } from '../../data/dungeons'
import { MECHANIC_REGISTRY, mechanicBrief } from '../../sim/mechanic-registry'

import { GUILD_EVENTS } from '../../data/guild-events'
import { TRAIT_INFO } from '../../data/traits'
import { ITEM_BASES } from '../../data/items'
import type { ItemBaseDef } from '../../sim/types'

// #6.1 图鉴/收藏(批次 6):装备全表(名/来历/族/阶)+各副本杂兵构成——数据已有,只差界面。
const SLOT_NAME: Record<string, string> = { weapon: '武器', armor: '护甲', trinket: '饰品' }
const FAMILY_NAME: Record<string, string> = { blade: '刃', bow: '弓', staff: '杖圣器', axe: '锤斧', polearm: '长柄' }

function EquipmentCodex() {
  const all = Object.values(ITEM_BASES) as ItemBaseDef[]
  const tiers = [...new Set(all.map((b) => b.tier))].sort((a, b) => a - b)
  return (
    <>
      {tiers.map((t) => (
        <div key={t} className="inv-panel">
          <h3 style={{ margin: '4px 0' }}>{t === 1 ? '⬜ T1 初阶' : t === 2 ? '🟩 T2 精良' : t === 3 ? '🟪 T3 灰冠' : `timent T${t}`}</h3>
          {all.filter((b) => b.tier === t).map((b) => (
            <div key={b.id} className="inv-item">
              <b>{b.name}</b>
              <span className="hint">({SLOT_NAME[b.slot] ?? b.slot}/{FAMILY_NAME[b.family as string] ?? (b as { family?: string }).family ?? '—'},{b.stat}+{b.value},词条 {b.affixCount[0]}–{b.affixCount[1]} 条{b.legacy ? ',传承威能' : ''})</span>
              {b.flavor && <div className="hint" style={{ fontStyle: 'italic' }}>「{b.flavor}」</div>}
            </div>
          ))}
        </div>
      ))}
    </>
  )
}

function MobCodex() {
  return (
    <>
      {DUNGEONS.map((d) => {
        const groups = Object.entries(d.enemyGroups ?? {})
        if (groups.length === 0) return null
        return (
          <div key={d.id} className="inv-panel">
            <h3 style={{ margin: '4px 0' }}>🗺 {d.name}</h3>
            {Object.values(d.encounters ?? {}).filter((e) => e.kind === 'wave').map((e) => {
              const members = (e.enemyGroupIds ?? []).flatMap((gid) => (d.enemyGroups as Record<string, { name: string; traits?: string[] }[]>)[gid] ?? [])
              if (members.length === 0) return null
              const names = [...new Set(members.map((m) => m.name))]
              const traits = [...new Set(members.flatMap((m) => m.traits ?? []))].map((t) => TRAIT_INFO[t]?.name ?? t)
              return (
                <div key={e.id} className="inv-item">
                  <b>{e.name}</b><span className="hint">({members.length} 名:{names.join('、')}{traits.length > 0 ? ` · 特质:${traits.join('/')}` : ''})</span>
                </div>
              )
            })}
          </div>
        )
      })}
    </>
  )
}
import { useState } from 'react'

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
            <EventCodexPage eventsSeen={eventsSeen} />
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
          <div className="inv-panel">
            <h2>🎒 装备图鉴(共 {Object.keys(ITEM_BASES).length} 件——名字与来历,财宝的骨架)</h2>
            <EquipmentCodex />
          </div>
          <div className="inv-panel">
            <h2>🐺 怪物图鉴(各副本杂兵构成——知彼者不殆)</h2>
            <MobCodex />
          </div>
              </div>
            </div>
            </div>
  )
}

const PAGE_SIZE = 12

function EventCodexPage({ eventsSeen }: { eventsSeen: string[] }) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(GUILD_EVENTS.length / PAGE_SIZE))
  const safe = Math.min(page, pages - 1)
  const slice = GUILD_EVENTS.slice(safe * PAGE_SIZE, safe * PAGE_SIZE + PAGE_SIZE)
  return (
    <>
      {slice.map((e) => {
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
      <div className="tavern-row" style={{ marginTop: 8 }}>
        <button disabled={safe === 0} onClick={() => setPage(safe - 1)}>← 上一页</button>
        <span className="hint">第 {safe + 1} / {pages} 页 · 共 {GUILD_EVENTS.length} 条(见过 {eventsSeen.length})</span>
        <button disabled={safe >= pages - 1} onClick={() => setPage(safe + 1)}>下一页 →</button>
      </div>
    </>
  )
}
