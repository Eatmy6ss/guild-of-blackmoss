import type { Combatant } from '../../sim/types'
import { ARENA } from '../../sim/combat'

/** M-a 空间化(U41):单位有 pos(逻辑 640×360)则按比例映射画布坐标;无 pos 走旧四列摆位(旧断点兼容)。 */
export function battleLayout(width: number, units: Pick<Combatant, 'id' | 'team' | 'position' | 'pos'>[]) {
  const narrow = width < 640
  const columns: Record<string, typeof units> = narrow
    ? { guild: units.filter(u => u.team === 'guild'), enemy: units.filter(u => u.team === 'enemy') }
    : Object.fromEntries(['guild-front', 'guild-back', 'enemy-front', 'enemy-back'].map(key => [key, units.filter(u => `${u.team}-${u.position}` === key)]))
  const rows = Math.max(1, ...Object.values(columns).map(list => list.length))
  const bodyScale = narrow && rows > 3 ? 1 : width >= 960 && rows <= 3 ? 3 : 2
  const rowHeight = bodyScale * 32 + 36
  const height = Math.max(narrow ? 320 : 360, 58 + rows * rowHeight + 14)
  const x: Record<string, number> = { guild: .25, enemy: .75, 'guild-front': .37, 'guild-back': .16, 'enemy-front': .63, 'enemy-back': .84 }
  const hasPos = units.some(u => u.pos)
  const scale = width / ARENA.width
  const positions = Object.fromEntries(units.map(u => [u.id, hasPos && u.pos
    ? { x: Math.round(u.pos.x * scale), y: Math.round(58 + u.pos.y * (height - 72) / ARENA.height) }
    : {
        x: Math.round(width * (x[`${u.team}-${u.position}`] ?? 0.5)),
        y: Math.round(58 + rowHeight * ((columns[`${u.team}-${u.position}`]?.indexOf(u) ?? 0) + .85) + (height - 72 - rows * rowHeight) / 2),
      }]))
  return { width, height, bodyScale, positions, labelChars: narrow ? 6 : 10 }
}
