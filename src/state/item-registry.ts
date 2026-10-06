import { ITEM_BASES } from '../data/items'
import type { ItemInstance, Member, Slot } from '../sim/types'
import { recastRoll } from '../sim/loot'

export type ItemUid = string
export type EquipmentRefs = Partial<Record<Slot, ItemUid>>
export type StoredMember = Omit<Member, 'equipment'> & { equipment: EquipmentRefs }
export interface StoredRelic { uid: ItemUid; hero: string; redeem: number }
export interface StoredItemFields {
  items: Record<ItemUid, ItemInstance>
  /** 下一个可用序号；物品销毁后也不能回退。 */
  itemSeq: number
  members: StoredMember[]
  inventory: ItemUid[]
  pendingRelics: StoredRelic[]
}

/** 正式游戏的唯一归属。Member.equipment 只是在模拟/展示边界解析出的只读物品视图。 */
export interface GuildItems extends Omit<StoredItemFields, 'members'> {
  equipment: Record<string, EquipmentRefs>
}
const SLOTS = ['weapon', 'armor', 'trinket'] as const
const uidNumber = (uid: string) => /^it_[1-9]\d*$/.test(uid) && Number.isSafeInteger(Number(uid.slice(3))) ? Number(uid.slice(3)) : 0
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const array = (v: unknown): unknown[] => Array.isArray(v) ? v : []
function validItem(v: unknown): v is ItemInstance {
  const i = record(v)
  return typeof i.baseId === 'string' && !!ITEM_BASES[i.baseId] && Array.isArray(i.rolls) &&
    i.rolls.every(r => typeof record(r).affixId === 'string' && typeof record(r).value === 'number' && Number.isFinite(record(r).value))
}

/** 旧档重新编号；新档修复坏引用。只修归属与身份，不重掷词条，不改输入。 */
export function readItemFields(data: Record<string, unknown>, legacy: boolean): { fields: StoredItemFields; issues: string[] } {
  const issues: string[] = []
  const items: Record<string, ItemInstance> = {}
  const inventory: string[] = []
  const pendingRelics: StoredRelic[] = []
  const members = array(data.members).map(m => ({ ...record(m), equipment: {} })) as StoredMember[]
  const originalMembers = array(data.members)
  const sourceItems = record(data.items)
  const maximum = Object.keys(sourceItems).reduce((max, uid) => Math.max(max, uidNumber(uid)), 0)
  let itemSeq = !legacy && Number.isSafeInteger(data.itemSeq) && Number(data.itemSeq) > maximum
    ? Number(data.itemSeq) : maximum + 1
  if (!legacy && itemSeq !== data.itemSeq) issues.push('已修正装备编号进度，防止编号复用。')
  const mint = (item: ItemInstance): string => {
    if (!Number.isSafeInteger(itemSeq + 1)) throw new Error('装备编号已超出安全范围')
    const uid = `it_${itemSeq++}`
    items[uid] = { ...structuredClone(item), id: uid }
    return uid
  }
  const remap = new Map<string, string>()
  if (!legacy) {
    for (const [key, value] of Object.entries(sourceItems)) {
      if (!validItem(value)) { issues.push('已移除无法解析的装备记录。'); continue }
      const uid = uidNumber(key) ? key : mint(value)
      if (uidNumber(key)) items[uid] = { ...structuredClone(value), id: uid }
      remap.set(key, uid)
      if (key !== uid || value.id !== uid) issues.push('已修正装备登记编号。')
    }
  }
  const seen = new Set<string>()
  const oldIds = new Set<string>()
  const take = (value: unknown): { uid: string; duplicate: boolean } | null => {
    if (legacy) {
      if (!validItem(value)) { issues.push('已移除无法解析的旧装备引用。'); return null }
      const duplicate = !!value.id && oldIds.has(value.id)
      if (value.id) oldIds.add(value.id)
      const uid = mint(value)
      if (duplicate) issues.push('重复归属的旧装备已重新编号并放回仓库。')
      return { uid, duplicate }
    }
    const uid = typeof value === 'string' ? remap.get(value) : undefined
    if (!uid) { issues.push('已清除指向缺失装备的引用。'); return null }
    if (seen.has(uid)) {
      issues.push('重复归属的装备已保留为独立副本并放回仓库。')
      return { uid: mint(items[uid]), duplicate: true }
    }
    seen.add(uid)
    return { uid, duplicate: false }
  }
  // 优先级：装备中 > 待赎回 > 仓库。低优先级重复实例保留内容，恢复至仓库。
  for (let index = 0; index < members.length; index++) {
    const equipment = record(record(originalMembers[index]).equipment)
    for (const slot of SLOTS) {
      if (equipment[slot] == null || equipment[slot] === '') continue
      const found = take(equipment[slot])
      if (!found) continue
      if (found.duplicate || ITEM_BASES[items[found.uid].baseId].slot !== slot || !members[index].alive) {
        inventory.push(found.uid)
        if (!found.duplicate) issues.push('槽位不符或亡者仍持有的装备已放回仓库。')
      } else members[index].equipment[slot] = found.uid
    }
  }
  for (const value of array(data.pendingRelics)) {
    const r = record(value), found = take(legacy ? r.item : r.uid)
    if (!found) continue
    if (found.duplicate) inventory.push(found.uid)
    else pendingRelics.push({ uid: found.uid, hero: typeof r.hero === 'string' ? r.hero : '无名英雄', redeem: typeof r.redeem === 'number' && Number.isFinite(r.redeem) ? Math.max(0, r.redeem) : 0 })
  }
  for (const value of array(data.inventory)) {
    const found = take(value)
    if (found) inventory.push(found.uid)
  }
  if (!legacy) for (const uid of Object.keys(items)) {
    if (!seen.has(uid) && !inventory.includes(uid)) { inventory.push(uid); issues.push('无人持有的装备已恢复到仓库。') }
  }
  const fields = { items, itemSeq, members, inventory, pendingRelics }
  assertItemOwnership(itemStateFromSave(fields))
  return { fields, issues }
}

export function itemStateFromSave(fields: StoredItemFields): GuildItems {
  return { items: fields.items, itemSeq: fields.itemSeq, inventory: fields.inventory, pendingRelics: fields.pendingRelics,
    equipment: Object.fromEntries(fields.members.map(m => [m.id, { ...m.equipment }])) }
}

export function createGuildItems(members: Member[], inventory: ItemInstance[] = []): GuildItems {
  return itemStateFromSave(readItemFields({ members, inventory, pendingRelics: [] }, true).fields)
}

/** 装备实例只从注册表解析；所有持有者保存 UID，不建立第二份物品数据。 */
export function resolveMembers(members: (Member | StoredMember)[], state: GuildItems): Member[] {
  return members.map(m => ({ ...m, equipment: Object.fromEntries(SLOTS.flatMap(slot => {
    const uid = state.equipment[m.id]?.[slot]
    return uid ? [[slot, state.items[uid]]] : []
  })) }))
}
export const inventoryItems = (state: GuildItems): ItemInstance[] => state.inventory.map(uid => state.items[uid])
export const relicItems = (state: GuildItems) => state.pendingRelics.map(r => ({ ...r, item: state.items[r.uid] }))

export function serializeGuildItems(state: GuildItems, members: Member[]): StoredItemFields {
  assertItemOwnership(state)
  return { items: state.items, itemSeq: state.itemSeq, inventory: state.inventory, pendingRelics: state.pendingRelics,
    members: members.map(m => ({ ...m, equipment: { ...state.equipment[m.id] } })) }
}

export function itemOwnershipErrors(state: GuildItems): string[] {
  const errors: string[] = []
  const counts = new Map<string, number>()
  const count = (uid: string) => {
    if (!state.items[uid]) errors.push(`缺失物品 ${uid}`)
    counts.set(uid, (counts.get(uid) ?? 0) + 1)
  }
  for (const refs of Object.values(state.equipment)) for (const slot of SLOTS) {
    const uid = refs[slot]
    if (!uid) continue
    count(uid)
    if (state.items[uid] && ITEM_BASES[state.items[uid].baseId]?.slot !== slot) errors.push(`槽位不符 ${uid}`)
  }
  state.inventory.forEach(count)
  state.pendingRelics.forEach(r => count(r.uid))
  for (const [uid, item] of Object.entries(state.items)) {
    if ((counts.get(uid) ?? 0) !== 1) errors.push(`归属数量异常 ${uid}`)
    if (!uidNumber(uid) || item.id !== uid || uidNumber(uid) >= state.itemSeq) errors.push(`编号异常 ${uid}`)
  }
  if (!Number.isSafeInteger(state.itemSeq) || state.itemSeq < 1) errors.push('编号进度异常')
  return errors
}
export function assertItemOwnership(state: GuildItems): void {
  const errors = itemOwnershipErrors(state)
  if (errors.length) throw new Error('I6 物品唯一归属失败：' + errors.join('；'))
}

const copyState = (state: GuildItems): GuildItems => ({ ...state, items: { ...state.items }, equipment: { ...state.equipment }, inventory: [...state.inventory], pendingRelics: [...state.pendingRelics] })
function mintItem(state: GuildItems, item: ItemInstance): ItemInstance {
  if (!Number.isSafeInteger(state.itemSeq + 1)) throw new Error('装备编号已超出安全范围')
  const registered = { ...structuredClone(item), id: `it_${state.itemSeq++}` }
  state.items[registered.id] = registered
  return registered
}
export function addInventoryItems(state: GuildItems, incoming: ItemInstance[]): { state: GuildItems; items: ItemInstance[] } {
  const next = copyState(state)
  const items = incoming.map(item => mintItem(next, item))
  next.inventory.push(...items.map(item => item.id))
  assertItemOwnership(next)
  return { state: next, items }
}

export function equipRegisteredItem(state: GuildItems, memberId: string, slot: Slot, uid: string): GuildItems {
  const current = state.equipment[memberId]
  if (!current || current[slot] === uid || (!uid && !current[slot])) return state
  if (uid && (!state.inventory.includes(uid) || ITEM_BASES[state.items[uid]?.baseId]?.slot !== slot)) return state
  const next = copyState(state)
  if (uid) next.inventory = next.inventory.filter(x => x !== uid)
  if (current[slot]) next.inventory.push(current[slot]!)
  next.equipment[memberId] = { ...current }
  if (uid) next.equipment[memberId][slot] = uid
  else delete next.equipment[memberId][slot]
  assertItemOwnership(next)
  return next
}

export function removeInventoryItem(state: GuildItems, uid: string): { state: GuildItems; item: ItemInstance } | null {
  if (!state.inventory.includes(uid)) return null
  const next = copyState(state), item = next.items[uid]
  next.inventory = next.inventory.filter(x => x !== uid)
  delete next.items[uid]
  assertItemOwnership(next)
  return { state: next, item }
}

export function redeemRegisteredRelic(state: GuildItems, uid: string, gold: number): { state: GuildItems; relic: StoredRelic } | null {
  const relic = state.pendingRelics.find(r => r.uid === uid)
  if (!relic || gold < relic.redeem) return null
  const next = copyState(state)
  next.pendingRelics = next.pendingRelics.filter(r => r.uid !== uid)
  next.inventory.push(uid)
  assertItemOwnership(next)
  return { state: next, relic }
}

/** R4.2b 铁匠铺·重铸:注册表内装备按原词条重掷数值(方向不变);白打(数值没变)返回 null 不扣费 */
export function recastRegisteredItem(state: GuildItems, uid: string, rollIndex: number, rng: () => number): { state: GuildItems; item: ItemInstance } | null {
  const registered = state.items[uid]
  if (!registered) return null
  const nextItem = recastRoll(registered, rollIndex, rng)
  if (!nextItem) return null
  const next = copyState(state)
  next.items[uid] = { ...registered, rolls: nextItem.rolls }
  assertItemOwnership(next)
  return { state: next, item: next.items[uid]! }
}

/** R4.2b 祠堂·遗物传承:待赎遗物以折扣价(赎回费×rate,C4 占位)由后辈接走——入仓库,不走全额赎回 */
export function inheritRegisteredRelic(state: GuildItems, uid: string, gold: number, rate = 0.6): { state: GuildItems; relic: StoredRelic; cost: number } | null {
  const relic = state.pendingRelics.find(r => r.uid === uid)
  if (!relic) return null
  const cost = Math.ceil(relic.redeem * rate)
  if (gold < cost) return null
  const next = copyState(state)
  next.pendingRelics = next.pendingRelics.filter(r => r.uid !== uid)
  next.inventory.push(uid)
  assertItemOwnership(next)
  return { state: next, relic, cost }
}

export function registerMemberItems(state: GuildItems, member: Member): GuildItems {
  if (state.equipment[member.id]) return state
  const next = copyState(state)
  next.equipment[member.id] = {}
  for (const slot of SLOTS) if (member.equipment[slot]) next.equipment[member.id][slot] = mintItem(next, member.equipment[slot]!).id
  assertItemOwnership(next)
  return next
}

/** 应用统一遭遇结算：原装备移交遗物/保险，新掉落只在此登记一次。 */
export function applyEncounterItems(state: GuildItems, members: Member[], loot: ItemInstance[], relics: { item: ItemInstance; hero: string; redeem: number }[]): { state: GuildItems; items: ItemInstance[] } {
  const next = copyState(state)
  next.equipment = Object.fromEntries(members.map(m => [m.id, Object.fromEntries(SLOTS.flatMap(slot => {
    const item = m.equipment[slot]
    if (item && !next.items[item.id]) throw new Error('结算引用了未登记的装备')
    return item ? [[slot, item.id]] : []
  }))]))
  const items = loot.map(item => next.items[item.id] ?? mintItem(next, item))
  next.inventory.push(...items.map(item => item.id))
  for (const r of relics) {
    if (!next.items[r.item.id]) throw new Error('结算引用了未登记的遗物')
    next.pendingRelics.push({ uid: r.item.id, hero: r.hero, redeem: r.redeem })
  }
  assertItemOwnership(next)
  return { state: next, items }
}
