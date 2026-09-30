import { describe, expect, it } from 'vitest'
import { DUNGEONS } from '../data/dungeons'
import { ITEM_BASES } from '../data/items'
import { SCENE_ART, heroLayers, WEAPON_LAYERS, ARMOR_LAYERS, SPRITE_PATHS } from '../ui/art/catalog'
import { ENEMY_ART } from '../ui/art/enemyArt'
import { spriteKeyFor } from '../ui/battle/pixelSprites'
import { ART_PALETTE, quantizeRgba } from '../ui/art/palette'
import { battleLayout } from '../ui/art/battleLayout'
describe('资源接线与战斗可读性', () => {
  it('12图与117个敌人按稳定ID绑定，显示名变化不影响外观', () => {
    for (const dungeon of DUNGEONS) {
      expect(SCENE_ART[dungeon.id]?.name).toBe(dungeon.name)
      for (const enemy of [...Object.values(dungeon.enemyGroups).flat(), ...Object.values(dungeon.bosses)]) {
        expect(ENEMY_ART[enemy.id]).toBeTruthy()
        const renamed = { team: 'enemy', enemyDef: { id: enemy.id }, name: '任意新译名', boss: true }
        expect(spriteKeyFor(renamed)).toBe(ENEMY_ART[enemy.id])
      }
    }
    expect(spriteKeyFor({ team: 'enemy', enemyDef: { id: 'unknown' } })).toBe('mon-kobold')
  })
  it('装备覆盖当前全部武器护甲，披风不压住护甲，换武器仅一层且不改输入', () => {
    for (const item of Object.values(ITEM_BASES)) {
      if (item.slot === 'weapon') expect(WEAPON_LAYERS[item.id]).toBeTruthy()
      if (item.slot === 'armor') expect(ARMOR_LAYERS[item.id]).toBeTruthy()
    }
    const member = { job: 'guard' as const, equipment: { weapon: { id: 'item1', baseId: 'wpn-t2-bow', rolls: [] } } }
    const before = structuredClone(member), layers = heroLayers(member)
    expect(layers.at(-1)).toBe('/assets/layers/bow.png')
    expect(layers).not.toContain('/assets/layers/long_sword.png')
    expect(layers.indexOf('/assets/layers/cloak_blue.png')).toBeLessThan(layers.indexOf('/assets/layers/chainmail.png'))
    expect(member).toEqual(before)
    for (const path of layers) expect(SPRITE_PATHS).toContain(path)
  })
  it('收色保留透明度与地砖暗部，输出只落在32色内', () => {
    const data = new Uint8ClampedArray([1,3,1,255, 3,13,3,200, 10,41,11,128, 255,0,0,0])
    quantizeRgba(data, true)
    const colors = [0,4,8].map(i => '#' + [...data.slice(i,i+3)].map(x => x.toString(16).padStart(2,'0')).join(''))
    expect(new Set(colors).size).toBeGreaterThan(1)
    for (const color of colors) expect(ART_PALETTE).toContain(color)
    expect([data[3],data[7],data[11],data[15]]).toEqual([255,200,128,0])
    expect([...data.slice(12)]).toEqual([255,0,0,0])
  })
  for (const width of [269, 339, 620, 760, 1160]) it(`${width}px完整容纳5人+3召唤与7个敌人`, () => {
    const units = Array.from({length:15}, (_,i) => ({ id:String(i), team:i<8?'guild' as const:'enemy' as const, position:i%3===0?'back' as const:'front' as const }))
    const before = structuredClone(units), layout = battleLayout(width, units)
    const radius = Math.max(22,16*layout.bodyScale)
    for (const unit of units) {
      const slot = layout.positions[unit.id]
      expect(slot.x-radius).toBeGreaterThanOrEqual(0)
      expect(slot.x+radius).toBeLessThanOrEqual(width)
      expect(slot.y-32*layout.bodyScale-26).toBeGreaterThanOrEqual(0)
      expect(slot.y+8).toBeLessThanOrEqual(layout.height)
    }
    expect(units).toEqual(before)
  })
})
