import type { Combatant } from '../../sim/types'
import { ARENA } from '../../sim/combat'
import { worldPixelScale } from '../viewport'

/** 世界、预警和鼠标共用等比投影；上方留出人物/名字，不改变模拟层 640×360。 */
export function arenaProjection(width: number, height: number, bodyScale: number, hudScale = 0) {
  const side = hudScale ? 400 * hudScale : 20 * bodyScale
  const top = hudScale ? 320 * hudScale : 32 * bodyScale + 32
  // 现行五人开场末位 y=390，略超逻辑场地；保留其原坐标，同时给脚环和动作条留空。
  const bottom = hudScale ? 320 * hudScale : 24
  const scale = Math.max(.01, Math.min((width - side * 2) / ARENA.width, (height - top - bottom) / ARENA.height))
  const x = (width - ARENA.width * scale) / 2
  const y = top + (height - top - bottom - ARENA.height * scale) / 2
  return {
    scale,
    toView: (p: { x: number; y: number }) => ({ x: x + p.x * scale, y: y + p.y * scale }),
    toArena: (p: { x: number; y: number }) => ({ x: (p.x - x) / scale, y: (p.y - y) / scale }),
  }
}

/** M-a 空间化(U41):单位有 pos(逻辑 640×360)则按比例映射画布坐标;无 pos 走旧四列摆位(旧断点兼容)。 */
export function battleLayout(width: number, units: Pick<Combatant, 'id' | 'team' | 'position' | 'pos'>[], viewport?: { height: number; uiScale: number; dpr: number; hud?: boolean }) {
  if (viewport) {
    const bodyScale = worldPixelScale(4, viewport.uiScale, viewport.dpr)
    const projection = arenaProjection(width, viewport.height, bodyScale, viewport.hud ? viewport.uiScale : 0)
    const positions = Object.fromEntries(units.map(u => {
      const allies = units.filter(other => other.team === u.team)
      const pos = u.pos ?? { x: u.team === 'guild' ? (u.position === 'front' ? 230 : 120) : (u.position === 'front' ? 410 : 520), y: (allies.indexOf(u) + 1) * ARENA.height / (allies.length + 1) }
      return [u.id, projection.toView(pos)]
    }))
    return { width, height: viewport.height, bodyScale, positions, labelChars: 10 }
  }
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
