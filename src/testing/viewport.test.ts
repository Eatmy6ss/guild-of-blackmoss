import { describe, expect, it } from 'vitest'
import { fitGameViewport, worldPixelScale } from '../ui/viewport'
import { arenaProjection, battleLayout } from '../ui/art/battleLayout'

describe('D1 桌面舞台与战场投影', () => {
  it.each([[1920, 1080], [2560, 1440], [1440, 900], [3440, 1440], [390, 844]])('窗口 %i×%i 完整容纳 16:9 画幅且居中', (width, height) => {
    const fit = fitGameViewport(width, height)
    expect(fit.x).toBeGreaterThanOrEqual(0)
    expect(fit.y).toBeGreaterThanOrEqual(0)
    expect(1920 * fit.scale + 2 * fit.x).toBeCloseTo(width)
    expect(1080 * fit.scale + 2 * fit.y).toBeCloseTo(height)
  })

  it.each([[1, 1], [4 / 3, 1], [.8, 1.25], [.75, 2]])('界面倍率 %f、DPR %f 下世界一格为整数物理像素', (uiScale, dpr) => {
    const pixels = worldPixelScale(4, uiScale, dpr) * dpr
    expect(Number.isInteger(pixels)).toBe(true)
    expect(pixels).toBeGreaterThanOrEqual(1)
    const p = arenaProjection(1400 * uiScale, 840 * uiScale, pixels / dpr)
    for (const pos of [{ x: 0, y: 0 }, { x: 640, y: 360 }, { x: 123, y: 287 }]) {
      const drawn = p.toView(pos)
      expect(p.toArena(drawn).x).toBeCloseTo(pos.x)
      expect(p.toArena(drawn).y).toBeCloseTo(pos.y)
      expect(drawn.x).toBeGreaterThan(0)
      expect(drawn.y).toBeLessThan(840 * uiScale)
    }
    // AOE 的逻辑圆不能被横纵不一致的画面倍率扭成另一种伤害范围。
    const c = p.toView({ x: 320, y: 180 })
    expect(p.toView({ x: 395, y: 180 }).x - c.x).toBeCloseTo(p.toView({ x: 320, y: 255 }).y - c.y)
  })

  it('存档坐标和旧无坐标单位都能投影，渲染不改写模拟状态', () => {
    const units = [
      { id: 'a', team: 'guild' as const, position: 'front' as const, pos: { x: 0, y: 0 } },
      { id: 'b', team: 'enemy' as const, position: 'back' as const, pos: { x: 640, y: 360 } },
      { id: 'old', team: 'guild' as const, position: 'back' as const },
    ]
    const before = structuredClone(units)
    const layout = battleLayout(1400, units, { height: 840, uiScale: 1, dpr: 1 })
    for (const u of units) {
      const point = layout.positions[u.id]
      expect(point.x - 16 * layout.bodyScale).toBeGreaterThanOrEqual(0)
      expect(point.x + 16 * layout.bodyScale).toBeLessThanOrEqual(layout.width)
      expect(point.y - 32 * layout.bodyScale - 26).toBeGreaterThanOrEqual(0)
      expect(point.y + 8).toBeLessThanOrEqual(layout.height)
    }
    expect(units).toEqual(before)
  })
})
