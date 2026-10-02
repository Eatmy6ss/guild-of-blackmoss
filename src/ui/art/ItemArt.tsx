import type { ItemInstance } from '../../sim/types'
import { itemIcon } from './catalog'
import { ArtCanvas } from './ArtCanvas'

const QUALITY = { white: '普通', green: '精良', purple: '史诗' }
export function ItemArt({ item, slot, size = 32 }: { item?: Pick<ItemInstance, 'baseId' | 'quality'>; slot: string; size?: number }) {
  const quality = item?.quality ?? 'white'
  return <span className="item-art" data-quality={quality} title={item ? QUALITY[quality] + '装备' : '尚未装备'}>
    <ArtCanvas paths={[itemIcon(item?.baseId ?? '', slot)]} label={item ? `${QUALITY[quality]}${slot === 'weapon' ? '武器' : slot === 'armor' ? '护甲' : '饰品'}` : '装备空位'} size={size} />
    <span className="quality-mark" aria-hidden="true">{item ? quality === 'purple' ? '◆' : quality === 'green' ? '▰' : '·' : '—'}</span>
  </span>
}
