// 遗物安葬 2.0 补丁 B(App 层,一次执行后删除):state/存档/两条死亡路径/塔投保 UI/仓库遗物区
import fs from 'node:fs'
import path from 'node:path'
const root = path.resolve(import.meta.dirname, '..')
const p = path.join(root, 'src/App.tsx')
let s = fs.readFileSync(p, 'utf8')

// 1) state
s = s.replace(
  '  // 装备 2.0:星髓(拆解 T3 所得,灰冠兑换)\n  const [starMarrow, setStarMarrow] = useState(() => saved?.starMarrow ?? 0)',
  `  // 装备 2.0:星髓(拆解 T3 所得,灰冠兑换)
  const [starMarrow, setStarMarrow] = useState(() => saved?.starMarrow ?? 0)
  // 遗物安葬 2.0:阵亡装备待赎回清单
  const [pendingRelics, setPendingRelics] = useState(() => saved?.pendingRelics ?? [])`,
)
// 2) saveGuild
s = s.replace(
  '    saveGuild({ starMarrow, kingdom, members,',
  '    saveGuild({ starMarrow, pendingRelics, kingdom, members,',
)
s = s.replace(
  '  }, [starMarrow, kingdom, members, inventory,',
  '  }, [starMarrow, pendingRelics, kingdom, members, inventory,',
)
// 3) 塔死亡路径:投保→入库;未投保→待赎回(×2 塔系数)
const towerOld = `    if (dead.length > 0) {
      // 遗物安葬(反馈②):塔中阵亡同样装备入库
      const relics: ItemInstance[] = []
      for (const d of dead) {
        const m = membersRef.current.find((x) => x.id === d.id)
        if (!m) continue
        for (const slot of ['weapon', 'armor', 'trinket'] as const) {
          const it = m.equipment[slot]
          if (it) {
            relics.push(it)
            m.equipment[slot] = undefined
          }
        }
      }
      if (relics.length > 0) setInventory((inv) => [...inv, ...relics])
      setMemorial((m) => [...m, ...withLegacy(dead)])
      setBlessing((b2) => b2 + dead.length * fx.blessingPerDeath)
      setMembers([...membersRef.current])
    }`
const towerNew = `    if (dead.length > 0) {
      // 遗物安葬 2.0:本层投保→装备免赎回费直接入库;未投保→进待赎回清单(塔内赎回费 ×2)
      const relics: ItemInstance[] = []
      const newRelics: { item: ItemInstance; hero: string; redeem: number }[] = []
      for (const d of dead) {
        const m = membersRef.current.find((x) => x.id === d.id)
        if (!m) continue
        for (const slot of ['weapon', 'armor', 'trinket'] as const) {
          const it = m.equipment[slot]
          if (!it) continue
          if (t.insuredFloor) relics.push(it)
          else newRelics.push({ item: it, hero: d.name, redeem: redeemCost(it, t.floor) })
          m.equipment[slot] = undefined
        }
      }
      if (relics.length > 0) setInventory((inv) => [...inv, ...relics])
      if (newRelics.length > 0) setPendingRelics((q) => [...(q ?? []), ...newRelics])
      setMemorial((m) => [...m, ...withLegacy(dead)])
      setBlessing((b2) => b2 + dead.length * fx.blessingPerDeath)
      setMembers([...membersRef.current])
    }`
if (!s.includes(towerOld)) { console.log('TOWER MISS'); process.exit(1) }
s = s.replace(towerOld, towerNew)
// 4) 远征死亡路径:relics 免费入库→待赎回
const expOld = `    if (dead.length > 0) {
      // 遗物安葬(反馈②):阵亡者的装备随遗体归队入库——人没了,家伙什留下
      const relics: ItemInstance[] = []
      for (const d of dead) {
        const m = r.members.find((x) => x.id === d.id)
        if (!m) continue
        for (const slot of ['weapon', 'armor', 'trinket'] as const) {
          const it = m.equipment[slot]
          if (it) {
            relics.push(it)
            m.equipment[slot] = undefined
          }
        }
      }
      if (relics.length > 0) setInventory((inv) => [...inv, ...relics])
      const witnesses = r.members.filter((m) => m.alive)`
const expNew = `    if (dead.length > 0) {
      // 遗物安葬 2.0:阵亡装备进待赎回清单(赎回费挂品级+词条),不再免费入库
      const newRelics: { item: ItemInstance; hero: string; redeem: number }[] = []
      for (const d of dead) {
        const m = r.members.find((x) => x.id === d.id)
        if (!m) continue
        for (const slot of ['weapon', 'armor', 'trinket'] as const) {
          const it = m.equipment[slot]
          if (!it) continue
          newRelics.push({ item: it, hero: d.name, redeem: redeemCost(it) })
          m.equipment[slot] = undefined
        }
      }
      if (newRelics.length > 0) setPendingRelics((q) => [...(q ?? []), ...newRelics])
      const witnesses = r.members.filter((m) => m.alive)`
if (!s.includes(expOld)) { console.log('EXP MISS'); process.exit(1) }
s = s.replace(expOld, expNew)
// 5) 塔休整投保按钮(塔 rest 界面,继续深入按钮旁)——找塔 rest 的动作区
const towerRestAnchor = `<button className="primary" onClick={towerNextFloor}>`
const towerRestInsured = `              <button
                onClick={() => {
                  const t = towerRunRef.current
                  if (!t || t.insuredFloor) return
                  const premium = t.floor * 40
                  if (gold < premium) return
                  setGold((g) => g - premium)
                  t.insuredFloor = true
                  setTowerRun({ ...t })
                  logChronicle(chronicleRaw(day, '为第 ' + t.floor + ' 层投了保(保费 ' + premium + ' 金)——本层若有人倒下,装备免费归还。'))
                }}
                disabled={gold < (towerRun?.floor ?? 1) * 40}
              >
                🛡 投保本层（{(towerRun?.floor ?? 1) * 40} 金,阵亡装备免赎回）
              </button>
              <button className="primary" onClick={towerNextFloor}>`
if (!s.includes(towerRestAnchor)) { console.log('TOWER REST MISS'); process.exit(1) }
s = s.replace(towerRestAnchor, towerRestInsured)
// 6) 仓库遗物区(灰冠兑换区之前)
const whAnchor = `            {kingdomTrust(kingdom) >= 100 && (`
const relicUI = `            {pendingRelics.length > 0 && (
              <div className="potion-supply">
                <span className="hint">⚰ 遗物安葬（{pendingRelics.length}）——阵亡者的装备在此待赎,赎回费随品级与词条上涨;T3 可改拆星髓</span>
                {pendingRelics.map((r, i) => (
                  <div key={i} className="tavern-row">
                    <span className="hint">⚰ {r.hero} 的 {describeItem(r.item)}</span>
                    <button disabled={!!run || !!towerRun || gold < r.redeem} onClick={() => {
                      if (gold < r.redeem) return
                      setGold((g) => g - r.redeem)
                      setInventory((inv) => [...inv, r.item])
                      setPendingRelics((q) => q.filter((_, j) => j !== i))
                      logChronicle(chronicleRaw(day, '花 ' + r.redeem + ' 金赎回了 ' + r.hero + ' 的遗物。'))
                    }}>
                      ⚰ 赎回（{r.redeem} 金）
                    </button>
                  </div>
                ))}
              </div>
            )}
            {kingdomTrust(kingdom) >= 100 && (`
if (!s.includes(whAnchor)) { console.log('WAREHOUSE MISS'); process.exit(1) }
s = s.replace(whAnchor, relicUI)
// 7) redeemCost 导入
s = s.replace(
  "import { rollWish, wishDone, WISH_MORALE } from './sim/wish'",
  "import { rollWish, wishDone, WISH_MORALE } from './sim/wish'\nimport { redeemCost } from './sim/tavern'",
)
fs.writeFileSync(p, s)
console.log('App relic 2.0 wired')
