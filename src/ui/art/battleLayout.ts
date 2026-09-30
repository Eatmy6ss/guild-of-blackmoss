import type { Combatant } from '../../sim/types'
export function battleLayout(width: number, units: Pick<Combatant, 'id' | 'team' | 'position'>[]) {
  const narrow = width < 640
  const columns: Record<string, typeof units> = narrow
    ? { guild: units.filter(u => u.team === 'guild'), enemy: units.filter(u => u.team === 'enemy') }
    : Object.fromEntries(['guild-front', 'guild-back', 'enemy-front', 'enemy-back'].map(key => [key, units.filter(u => `${u.team}-${u.position}` === key)]))
  const rows = Math.max(1, ...Object.values(columns).map(list => list.length))
  const bodyScale = narrow && rows > 3 ? 1 : width >= 960 && rows <= 3 ? 3 : 2
  const rowHeight = bodyScale * 32 + 36
  const height = Math.max(narrow ? 320 : 360, 58 + rows * rowHeight + 14)
  const x: Record<string, number> = { guild: .25, enemy: .75, 'guild-front': .37, 'guild-back': .16, 'enemy-front': .63, 'enemy-back': .84 }
  const positions = Object.fromEntries(Object.entries(columns).flatMap(([key, list]) => list.map((u, i) => [u.id, {
    x: Math.round(width * x[key]), y: Math.round(58 + rowHeight * (i + .85) + (height - 72 - rows * rowHeight) / 2),
  }])))
  return { width, height, bodyScale, positions, labelChars: narrow ? 6 : 10 }
}
