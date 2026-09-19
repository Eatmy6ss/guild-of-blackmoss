import { Texture } from 'pixi.js'

// 像素精灵管线(M1 演出验证切片):ASCII 像素图 → 离屏 canvas → nearest-neighbor 纹理。
// 设计契约(D5-6):换皮只换这里的像素图与调色板,动画结构不动。
// 素材说明:程序生成像素画(验证管线用),正式像素美术在换皮阶段替换——接口不变。

type Palette = Record<string, string>

/** 单个精灵的像素定义:每字符一个像素,'.' 为透明 */
interface PixelDef {
  rows: string[]
  palette: Palette
}

const P = {
  steel: '#8fa3c8',
  steelDark: '#5a6f96',
  skin: '#e8c8a0',
  leather: '#8a6a42',
  wood: '#a8824f',
  clothWhite: '#e8e8e0',
  clothGreen: '#6dbf6d',
  clothGreenDark: '#4a8a4a',
  clothBlue: '#5a8fd4',
  clothBlueDark: '#3a6aa4',
  clothPurple: '#9a7ad4',
  clothPurpleDark: '#6a4aa4',
  robeWhite: '#d9d9d9',
  robeWhiteDark: '#a8a8a8',
  frogGreen: '#7aa85a',
  frogGreenDark: '#527a38',
  belly: '#c8d89a',
  wolfGray: '#9a9aa8',
  wolfGrayDark: '#6a6a78',
  fang: '#e8e8e8',
  ogreSkin: '#b08a5a',
  ogreSkinDark: '#7a5a32',
  ogreCloth: '#8a5a3a',
  eye: '#1a1a2a',
  gold: '#e8c67a',
  dark: '#3a3a4a',
  blood: '#c05a5a',
} satisfies Palette

// ---- 我方三职业(12 宽 × 14 高,面朝右)----

const GUARD: PixelDef = {
  rows: [
    '............',
    '...ssssss...',
    '..ssssssss..',
    '..sseeeess..',
    '...seeees...',
    '....aaaa....',
    '..aaaaaaaa..',
    '.waaaaaaaaw.',
    '.saaaaaaaas.',
    '.saaaaaaaas.',
    '..aaaaaa aa.',
    '...ll..ll...',
    '...ll..ll...',
    '............',
  ],
  palette: { s: P.steel, e: P.eye, a: P.clothBlue, w: P.clothWhite, l: P.leather },
}

const PRIEST: PixelDef = {
  rows: [
    '......hh....',
    '.....hh.....',
    '....ssss....',
    '....ssss....',
    '...rrrrrr...',
    '..rrrrrrrr.g',
    '..rrwrrwrr.g',
    '..rrrrrrrr.g',
    '..rrrrrrrr.g',
    '.rrrrrrrrr.g',
    '.rrrrrrrrr..',
    '.rrrrrrrrr..',
    '.rrrrrrrrr..',
    '............',
  ],
  palette: { h: P.gold, s: P.skin, r: P.robeWhite, w: P.robeWhiteDark, g: P.wood },
}

const RANGER: PixelDef = {
  rows: [
    '............',
    '....hhhh....',
    '...hhhhhh...',
    '...seeees...',
    '....cccc....',
    '...cccccc.b.',
    '...cccccc.b.',
    '..llcccc..b.',
    '..llcccc..b.',
    '...cccc...b.',
    '...cccc.....',
    '...ll.ll....',
    '...ll.ll....',
    '............',
  ],
  palette: { h: P.clothGreenDark, s: P.skin, e: P.eye, c: P.clothGreen, l: P.leather, b: P.wood },
}

// ---- 敌方(12 宽 × 14 高,面朝左)----

const FROG: PixelDef = {
  rows: [
    '............',
    '............',
    '...ee..ee...',
    '..ffffffffff',
    '.fffffffffff',
    '.ffbbffffff.',
    'ffffffffffff',
    'ffffffffffff',
    '.ffffffffff.',
    '.ffffffffff.',
    '..ffffffff..',
    '.ff..ff..ff.',
    '.ff..ff..ff.',
    '............',
  ],
  palette: { f: P.frogGreen, b: P.belly, e: P.eye },
}

const WOLF: PixelDef = {
  rows: [
    '............',
    '.w.......w..',
    '.ww.....ww..',
    '.www...www..',
    '.wweeeeeww..',
    '..eeeeeeew..',
    '..eeeeeeee..',
    'ggeeeeeeee..',
    'geeeeeeeeee.',
    '..eeeeee....',
    '..eeeeee....',
    '..ee..ee....',
    '..ee..ee....',
    '..ee..ee....',
  ],
  palette: { w: P.wolfGrayDark, e: P.wolfGray, g: P.fang },
}

// ---- Boss(16 宽 × 16 高,体型更大)----

const OGRE: PixelDef = {
  rows: [
    '................',
    '.....ssssss.....',
    '....ssssssss....',
    '....seessees....',
    '....ssssssss....',
    '.....ssffss.....',
    '....aaaaaaaa....',
    '...aaaaaaaaaa...',
    '..aaawaaaaaaa...',
    '.saaaaaaaaaas...',
    '.saaaaaaaaaas...',
    '.saaaaaaaaaas...',
    '..aaaaaaaaaa....',
    '..lll....lll....',
    '..lll....lll....',
    '................',
  ],
  palette: { s: P.ogreSkin, e: P.eye, f: P.fang, a: P.ogreCloth, w: P.leather, l: P.ogreSkinDark },
}

const TALMA: PixelDef = {
  rows: [
    '......gggg......',
    '.....gggggg.....',
    '....ssssss......',
    '....seeees......',
    '...pppppppp.....',
    '..pppppppppp.h..',
    '..ppwpppppp.h...',
    '..pppppppp.h....',
    '..ppppppppph....',
    '.ppppppppppph...',
    '.pppppppppppp...',
    '.pppppppppppp...',
    '.pppppppppppp...',
    '.pppppppppppp...',
    '................',
    '................',
  ],
  palette: { g: P.gold, s: P.skin, e: P.eye, p: P.clothPurple, w: P.clothPurpleDark, h: P.wood },
}

// ---- 生成管线 ----

const cache = new Map<string, Texture>()

/** ASCII 像素图 → nearest-neighbor 纹理(幂等,按 key 缓存;定义查 UNIT_SPRITES) */
export function pixelTexture(key: string): Texture {
  const cached = cache.get(key)
  if (cached) return cached
  const def = UNIT_SPRITES[key]
  if (!def) throw new Error(`未知像素精灵: ${key}`)
  const w = def.rows[0].length
  const h = def.rows.length
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  for (let y = 0; y < h; y++) {
    const row = def.rows[y]
    for (let x = 0; x < w; x++) {
      const ch = row[x]
      if (ch === '.' || ch === ' ') continue
      const color = def.palette[ch]
      if (!color) continue
      ctx.fillStyle = color
      ctx.fillRect(x, y, 1, 1)
    }
  }
  const tex = Texture.from(canvas)
  tex.source.scaleMode = 'nearest'
  tex.source.style.scaleMode = 'nearest'
  cache.set(key, tex)
  return tex
}

/** 单位种类 → 像素定义(单位颜色由 UnitView 的 tint/粒子系统继续沿用) */
export const UNIT_SPRITES: Record<string, PixelDef> = {
  guard: GUARD,
  priest: PRIEST,
  ranger: RANGER,
  frog: FROG,
  wolf: WOLF,
  ogre: OGRE,
  talma: TALMA,
}

/** 按战斗实体挑精灵 key(阵营/职业/boss 名) */
export function spriteKeyFor(c: { team: string; role?: string; boss?: boolean; name?: string }): string {
  if (c.boss) return c.name?.includes('塔尔玛') ? 'talma' : 'ogre'
  if (c.team === 'enemy') return c.name?.includes('狼') ? 'wolf' : 'frog'
  const ROLE_KEY: Record<string, string> = { tank: 'guard', healer: 'priest', dps: 'ranger' }
  return ROLE_KEY[c.role ?? 'dps'] ?? 'ranger'
}
