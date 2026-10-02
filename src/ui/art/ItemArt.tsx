import type { ItemInstance } from '../../sim/types'
import { itemIcon } from './catalog'
import { ArtCanvas } from './ArtCanvas'

export const ITEM_QUALITY_NAME = { white: '普通', green: '精良', purple: '史诗' }
export function ItemArt({ item, slot, size = 32 }: { item?: Pick<ItemInstance, 'baseId' | 'quality'>; slot: string; size?: number }) {
  const quality = item?.quality ?? 'white'
  const slotName = slot === 'weapon' ? '武器' : slot === 'armor' ? '护甲' : '饰品'
  return <span className="item-art" data-quality={quality} data-empty={!item} title={item ? ITEM_QUALITY_NAME[quality] + slotName : slotName + '空位'}>
    {item ? <ArtCanvas paths={[itemIcon(item.baseId, slot)]} label={`${ITEM_QUALITY_NAME[quality]}${slotName}`} size={size} /> :
      <span className="item-empty" style={{ width: size, height: size }} role="img" aria-label={slotName + '空位'}>空</span>}
    <span className="quality-mark" aria-hidden="true">{item ? quality === 'purple' ? '◆' : quality === 'green' ? '▰' : '·' : '—'}</span>
  </span>
}
