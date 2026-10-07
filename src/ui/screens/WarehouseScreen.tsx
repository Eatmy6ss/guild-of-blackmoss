// warehouse 屏(U29 R2-5 自 App.tsx 迁出;#2.5 加过滤/锁定/批量分解——处理器留 App,props 下传)
import { useState } from 'react'
import { ITEM_BASES } from '../../data/items'
import { kingdomRank, kingdomTrust, royalPotionCost } from '../../sim/kingdom'
import { describeItem } from '../../sim/loot'
import { sellValue } from '../../sim/tavern'
import { sortInventoryItems, INV_SORT_LABEL, type InvSort } from '../inventory-sort'
import type { ItemInstance } from '../../sim/types'
import type { KingdomState } from '../../sim/kingdom'

interface WarehouseScreenProps {
  inventory: ItemInstance[]
  potions: { heal: number; fury: number }
  gold: number
  kingdom: KingdomState
  pendingRelics: { uid: string; hero: string; item: ItemInstance; redeem: number }[]
  starMarrow: number
  blessing: number
  busy: boolean
  invSort: InvSort
  onSortChange: (m: InvSort) => void
  onBuyPotion: (kind: 'heal' | 'fury') => void
  onRedeemRelic: (uid: string) => void
  onDismantle: (id: string) => void
  onSell: (id: string) => void
  onExchange: (baseId: string) => void
  lastDropCount: number
  /** 变卖价系数(基地祠堂/王国加成,App 单一来源) */
  sellMult: number
  onBack: () => void
  /** #2.5:锁定/解锁;批量分解(过滤项,锁定件 App 层再兜底跳过) */
  onToggleLock: (uid: string) => void
  onBulkDismantle: (uids: string[]) => void
}

export function WarehouseScreen(props: WarehouseScreenProps) {
  const { inventory, potions, gold, kingdom, pendingRelics, starMarrow, blessing, busy, sellMult, onBack } = props
  const EXCHANGE_LIST = ['wpn-t3-dawn', 'arm-t3-bulwark', 'trk-t3-seer']
  const inventorySorted = sortInventoryItems(inventory, props.invSort)
  // #2.5:品质/倾向池/关键字过滤 + 一键分解(锁定件保护)
  const [quality, setQuality] = useState<'all' | 'white' | 'green' | 'purple'>('all')
  const [pool, setPool] = useState<'all' | 'tank' | 'healer' | 'dps' | 'caster' | 'common'>('all')
  const [text, setText] = useState('')
  const filtered = inventorySorted.filter((i) => {
    if (quality !== 'all' && (i.quality ?? 'white') !== quality) return false
    if (pool !== 'all' && ITEM_BASES[i.baseId]?.pool !== pool) return false
    if (text && !describeItem(i).includes(text)) return false
    return true
  })
  const bulkIds = filtered.filter((i) => !i.locked).map((i) => i.id)
  return (
            <div className="screen-overlay fullpage">
              <div className="screen-panel">
                <div className="screen-head">
                  <h2>🎒 公会仓库</h2>
                  <button className="screen-close" onClick={() => onBack()}>✕ Esc</button>
                </div>
        <div className="inv-panel">
          <h2>公会仓库（{inventory.length}）</h2>
          <div className="potion-supply">
            <span className="hint">
              🧪 治疗药 ×{potions.heal} · ⚡ 爆发药 ×{potions.fury} —— 出征携带,战斗消耗,回城退回
              {kingdomRank(kingdom).discount > 0 && ` · 王国补给优惠${Math.round(kingdomRank(kingdom).discount * 100)}%已计入售价`}
            </span>
            <div className="tavern-row">
              <button disabled={busy || gold < royalPotionCost('heal', kingdom)} onClick={() => props.onBuyPotion('heal')}>
                🧪 补充治疗药（{royalPotionCost('heal', kingdom)} 金）
              </button>
              <button disabled={busy || gold < royalPotionCost('fury', kingdom)} onClick={() => props.onBuyPotion('fury')}>
                ⚡ 补充爆发药（{royalPotionCost('fury', kingdom)} 金）
              </button>
            </div>
          </div>
          {pendingRelics.length > 0 && (
            <div className="potion-supply">
              <span className="hint">⚰ 遗物安葬（{pendingRelics.length}）——阵亡者的装备在此待赎,赎回费随品级与词条上涨;T3 可改拆星髓</span>
              {pendingRelics.map((r) => (
                <div key={r.uid} className="tavern-row">
                  <span className="hint">⚰ {r.hero} 的 {describeItem(r.item)}</span>
                  <button disabled={busy || gold < r.redeem} onClick={() => props.onRedeemRelic(r.uid)}>
                    ⚰ 赎回（{r.redeem} 金）
                  </button>
                </div>
              ))}
            </div>
          )}
          {kingdomTrust(kingdom) >= 100 && (
            <div className="potion-supply">
              <span className="hint">⚔ 灰冠兑换（信任 100 解锁 · 星髓 {starMarrow} · 拆解 T3 取得）——每件 2 星髓 + 800 金 + 10 祝福</span>
              <div className="tavern-row">
                {EXCHANGE_LIST.map((bid) => (
                  <button key={bid} disabled={busy || starMarrow < 2 || gold < 800 || blessing < 10} onClick={() => props.onExchange(bid)}>
                    ⚔ 兑换 {ITEM_BASES[bid].name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {inventory.length > 0 && (
            <>
            <div className="tavern-row" role="group" aria-label="排序方式">
              <span className="hint">排序:</span>
              {(Object.keys(INV_SORT_LABEL) as InvSort[]).map((mode) => (
                <button key={mode} className={props.invSort === mode ? 'active' : ''} onClick={() => props.onSortChange(mode)}>
                  {INV_SORT_LABEL[mode]}
                </button>
              ))}
            </div>
            <div className="tavern-row" role="group" aria-label="过滤">
              <span className="hint">过滤:</span>
              <select aria-label="品质过滤" value={quality} onChange={(e) => setQuality(e.target.value as typeof quality)}>
                <option value="all">全部品质</option><option value="white">普通</option><option value="green">精良</option><option value="purple">史诗</option>
              </select>
              <select aria-label="倾向过滤" value={pool} onChange={(e) => setPool(e.target.value as typeof pool)}>
                <option value="all">全部倾向</option><option value="tank">坦克</option><option value="dps">输出</option><option value="healer">治疗</option><option value="caster">施法</option>
              </select>
              <input aria-label="搜索" placeholder="搜名称…" value={text} onChange={(e) => setText(e.target.value)} style={{ maxWidth: 140 }} />
              <button data-testid="bulk-dismantle" disabled={busy || bulkIds.length === 0}
                title="分解过滤结果中的未锁定件:T3 拆星髓,其余折金币(变卖价 60%)"
                onClick={() => props.onBulkDismantle(bulkIds)}>
                ♻ 一键分解({bulkIds.length})
              </button>
              <span className="hint">🔒 点击装备行可锁定/解锁,锁定件不参与批量分解</span>
            </div>
            </>
          )}
          {inventory.length === 0 ? (
            <p className="hint">击败 boss 掉落装备（首次击杀保底一件）。从成员卡的下拉框穿戴。</p>
          ) : (
            inventorySorted.map((i) => (
              <div key={i.id} className={`inv-item${i.locked ? ' inv-locked' : ''}`} role="button" tabIndex={0}
                title={i.locked ? '已锁定(再点解锁)' : '点击锁定(批量分解保护)'}
                onClick={() => props.onToggleLock(i.id)}>
                {i.locked ? '🔒 ' : ''}
                {(() => {
                  // R5.3e(U33⑥):武器行前缀武器族(装备前可见)
                  const fam = ITEM_BASES[i.baseId].family
                  const famName = fam === 'blade' ? '[刃]' : fam === 'bow' ? '[弓]' : fam === 'staff' ? '[杖]' : fam === 'axe' ? '[锤斧]' : fam === 'polearm' ? '[长柄]' : ''
                  return famName
                })()}
                {describeItem(i)}
                {ITEM_BASES[i.baseId].tier === 3 && (
                  <button className="sell-btn" onClick={(e) => { e.stopPropagation(); props.onDismantle(i.id) }}>
                    ♻ 拆解 +2 星髓
                  </button>
                )}
                <button className="sell-btn" onClick={(e) => { e.stopPropagation(); props.onSell(i.id) }}>
                  变卖 +{sellValue(i, sellMult)} 金
                </button>
              </div>
            ))
          )}
          {props.lastDropCount > 0 && (
            <p className="hint" style={{ marginTop: 6 }}>
              本次远征共获得 {props.lastDropCount} 件装备
            </p>
          )}
              </div>
            </div>
            </div>
  )
}
