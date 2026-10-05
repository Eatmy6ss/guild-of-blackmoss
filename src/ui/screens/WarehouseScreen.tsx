// warehouse 屏(U29 R2-5 自 App.tsx 迁出;行为零变——处理器留在 App,props 下传)
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
}

export function WarehouseScreen(props: WarehouseScreenProps) {
  const { inventory, potions, gold, kingdom, pendingRelics, starMarrow, blessing, busy, sellMult, onBack } = props
  const EXCHANGE_LIST = ['wpn-t3-dawn', 'arm-t3-bulwark', 'trk-t3-seer']
  const inventorySorted = sortInventoryItems(inventory, props.invSort)
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
            <div className="tavern-row" role="group" aria-label="排序方式">
              <span className="hint">排序:</span>
              {(Object.keys(INV_SORT_LABEL) as InvSort[]).map((mode) => (
                <button key={mode} className={props.invSort === mode ? 'active' : ''} onClick={() => props.onSortChange(mode)}>
                  {INV_SORT_LABEL[mode]}
                </button>
              ))}
            </div>
          )}
          {inventory.length === 0 ? (
            <p className="hint">击败 boss 掉落装备（首次击杀保底一件）。从成员卡的下拉框穿戴。</p>
          ) : (
            inventorySorted.map((i) => (
              <div key={i.id} className="inv-item">
                {(() => {
                  // R5.3e(U33⑥):武器行前缀武器族(装备前可见)
                  const fam = ITEM_BASES[i.baseId].family
                  const famName = fam === 'blade' ? '[刃]' : fam === 'bow' ? '[弓]' : fam === 'staff' ? '[杖]' : fam === 'axe' ? '[锤斧]' : fam === 'polearm' ? '[长柄]' : ''
                  return famName
                })()}
                {describeItem(i)}
                {ITEM_BASES[i.baseId].tier === 3 && (
                  <button className="sell-btn" onClick={() => props.onDismantle(i.id)}>
                    ♻ 拆解 +2 星髓
                  </button>
                )}
                <button className="sell-btn" onClick={() => props.onSell(i.id)}>
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
