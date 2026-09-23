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

// ---- 家族变体(试玩反馈④):复用行画换调色板——小团队产能路线,每敌系一个辨识色 ----
const BONE: PixelDef = { rows: FROG.rows, palette: { s: '#d8d5c8', e: '#2a2a34', a: '#a8a498', l: '#8a867a' } }
const MINER: PixelDef = { rows: FROG.rows, palette: { s: '#b08a5a', e: '#2a2a34', a: '#6a5238', l: '#52402c' } }
const CULTIST: PixelDef = { rows: PRIEST.rows, palette: { s: '#c8b0a0', e: '#d04a4a', a: '#4a3558', l: '#33254a' } }
const THORN: PixelDef = { rows: GUARD.rows, palette: { s: '#c8a078', e: '#2a2a34', a: '#7a3a30', l: '#5a2822' } }
const FROSTWOLF: PixelDef = { rows: WOLF.rows, palette: { s: '#a8c4d4', e: '#2a3a4a', a: '#7a98ac', l: '#5a7a90' } }
const WRAITH: PixelDef = { rows: PRIEST.rows, palette: { s: '#b8c8d8', e: '#3a4a6a', a: '#5a6a8a', l: '#42506a' } }

// ---- boss 专属像素(反馈:不同 boss 不同像素样子——每只独立造型,16×18,剪影优先) ----

// 沼泽食人魔·格鲁什:大肚独眼,腰布木棒,沼泽巨物
const BOSS_GRUSH: PixelDef = {
  rows: [
    '................',
    '.....kkkkkk.....',
    '....kssssssk....',
    '...kssssssssk...',
    '...ks.ee.ss.k...',
    '...ksseesssk....',
    '...kssmmsssk....',
    '....kssssk......',
    '..kkkkkkkkkk....',
    '.kslllllllssk.w.',
    '.kslllllllsskww.',
    '.kslllllllsskww.',
    '..klllllllsk.ww.',
    '..klllllllk..w..',
    '..kll..lllk.ww..',
    '..kll..lllk.....',
    '..kll..lllk.....',
    '................',
  ],
  palette: { k: P.dark, s: P.ogreSkin, e: P.eye, m: P.blood, l: P.ogreSkinDark, w: P.wood },
}

// 矿脉吞噬者·掘锚:分节巨虫,环状矿甲,锚颚
const BOSS_DELVEANCHOR: PixelDef = {
  rows: [
    '................',
    '...........kkk..',
    '....kkkkkkdmmmk.',
    '..kkdddddddmmmK.',
    '.kdddddddddddk..',
    '.kdd.ggdddddK...',
    'kddgggggdddk....',
    'kdd.ggdddddK....',
    '.kdddddddddddk..',
    '.kdd.ggdddddmmk.',
    'kddgggggdddddK..',
    'kdd.ggddddddk...',
    '.kdddddddddddk..',
    '..kkdddddddk....',
    '....kkkkkkk.....',
    '................',
    '................',
    '................',
  ],
  palette: { k: P.dark, d: '#8a6a42', g: P.gold, m: '#c8ccd8', K: '#5a4a30' },
}

// 破誓大公·摩尔德雷克:黑甲堕落骑士,断剑披风,裂盔
const BOSS_MOLDREKE: PixelDef = {
  rows: [
    '......kkkk......',
    '.....kbbbbsk....',
    '.....kbvrvsk....',
    '.....kbbbbbs....',
    '......kbbs......',
    '...kkkbbbbsss...',
    '..kbbbbbbbbsss..',
    '.kbb.bbbbbb.s.s.',
    '.kbk.bbbbbb.s...',
    '.kbk.bbbbbb.....',
    '.kbk.bbbbbb..s..',
    '.kbk.kbbbk...s..',
    '.kkk.kkkkk......',
    '.....kb.kb......',
    '.....kb.kb......',
    '.....kk.kk......',
    '................',
    '................',
  ],
  palette: { k: P.dark, b: '#3a3444', v: '#c05a5a', r: '#e8c87a', s: '#8a8a9a' },
}

// 霜裔织法者·薇尔霍拉:兜帽冰法,冰晶法杖,寒雾长裙
const BOSS_VELHOLA: PixelDef = {
  rows: [
    '................',
    '.....kkkkk...w..',
    '....kiiiiik..w..',
    '....kieeeik..w..',
    '....kiiiiikww...',
    '...kiiwwiiikw...',
    '..kiiiwwiiiww...',
    '..kiiiiiiiii.w..',
    '..kiiiiiiiii.w..',
    '.kiiiiiiiiii.w..',
    '.kiiiiiiiiii.w..',
    '.kiiiiiiiiii.w..',
    '.kiiiiiiiiii.w..',
    'kiiiiiiiiiii.w..',
    'k.iiiiiiiii..w..',
    '..iiiiiiiii..w..',
    '...kkkkkkk...w..',
    '................',
  ],
  palette: { k: P.dark, i: '#a8c4d4', e: '#3a6aa4', w: '#e8f4ff' },
}

// 深渊主教·马尔萨乌斯:红黑高帽法袍,深渊权杖,祭纹
const BOSS_MALSAUUS: PixelDef = {
  rows: [
    '................',
    '.....kkkkk......',
    '....krrrrrk.....',
    '....krrrrrk.....',
    '...krrrrrrrk....',
    '...kr.bb.rrk....',
    '...krrrrrrrk..g.',
    '..krrrrrrrrk..g.',
    '..krrbbbrrrk..g.',
    '..krrbbbrrrk.gg.',
    '.krrrrrrrrrk..g.',
    '.krrrrrrrrrkgg..',
    '.krrrrrrrrrkg...',
    'krrrrrrrrrrkg...',
    'k.rrrrrrrrr.....',
    '..rrrrrrrrr.....',
    '..kkkkkkkkk.....',
    '................',
  ],
  palette: { k: P.dark, r: '#6a2a2a', b: '#c05a5a', g: P.gold },
}

// 掌旗官·科尔特:荆棘军团旗手,战旗+重甲+披风
const BOSS_COLTFELD: PixelDef = {
  rows: [
    '....k...g.......',
    '....k...gg......',
    '....k...gggg....',
    '....k...gggg....',
    '...kkkk.g.......',
    '..kssssssk......',
    '..kseeeeskk.....',
    '..ksssssskkg....',
    '.ksskkkssk.g....',
    '.kssk.kssk......',
    '.kssk.kssk......',
    '.kssk.kssk...k..',
    '.kssk.kssk..kk..',
    '..ksk.ksk...k...',
    '..ksk.ksk.......',
    '..kkk.kkk.......',
    '................',
    '................',
  ],
  palette: { k: P.dark, s: P.steel, e: P.eye, g: P.gold },
}

// ---- 武器贴图(试玩反馈④:换装可见——按装备武器基底切换外形) ----
const WP_SWORD: PixelDef = { rows: ['.ww', 'ww.', 'ww.', 'ww.', 'ww.', '.ll'], palette: { w: '#c8ccd8', l: '#8a6a42' } }
const WP_BOW: PixelDef = { rows: ['.w.', 'w..', 'w..', 'w..', 'w..', '.w.'], palette: { w: '#a8824f' } }
const WP_AXE: PixelDef = { rows: ['www', 'www', '.w.', '.w.', '.w.', '.w.'], palette: { w: '#9aa3b5' } }
const WP_STAFF: PixelDef = { rows: ['gg.', '..w', '..w', '..w', '..w', '..w'], palette: { g: '#7ad4c8', w: '#8a6a42' } }
const WP_DAGGER: PixelDef = { rows: ['ww.', 'w..', 'w..', '.w.', '.w.', '.w.'], palette: { w: '#d8d5c8' } }

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
  bone: BONE,
  miner: MINER,
  cultist: CULTIST,
  thorn: THORN,
  frostwolf: FROSTWOLF,
  wraith: WRAITH,
  'wpn-sword': WP_SWORD,
  'wpn-bow': WP_BOW,
  'wpn-axe': WP_AXE,
  'wpn-staff': WP_STAFF,
  'wpn-dagger': WP_DAGGER,
  'boss-grush': BOSS_GRUSH,
  'boss-delveanchor': BOSS_DELVEANCHOR,
  'boss-moldreke': BOSS_MOLDREKE,
  'boss-velhola': BOSS_VELHOLA,
  'boss-malsauus': BOSS_MALSAUUS,
  'boss-coltfeld': BOSS_COLTFELD,
}

/** 按战斗实体挑精灵 key(阵营/职业/boss 名) */
export function spriteKeyFor(c: { team: string; role?: string; boss?: boolean; name?: string }): string {
  const n = c.name ?? ''
  if (c.boss) {
    if (n.includes('格鲁什')) return 'boss-grush'
    if (n.includes('塔尔玛')) return 'talma'
    if (n.includes('掘锚')) return 'boss-delveanchor'
    if (n.includes('摩尔德雷克')) return 'boss-moldreke'
    if (n.includes('薇尔霍拉')) return 'boss-velhola'
    if (n.includes('马尔萨乌斯')) return 'boss-malsauus'
    if (n.includes('科尔特')) return 'boss-coltfeld'
    if (n.includes('荆棘') || n.includes('维克托')) return 'thorn'
    return 'ogre'
  }
  if (c.team === 'enemy') {
    if (n.includes('狼')) return n.includes('霜') ? 'frostwolf' : 'wolf'
    if (n.includes('矿工') || n.includes('掘锚') || n.includes('蝠') || n.includes('蛛') || n.includes('矿灯')) return 'miner'
    if (n.includes('骸骨') || n.includes('墓卫') || n.includes('掘墓') || n.includes('墓骑') || n.includes('冰棺')) return 'bone'
    if (n.includes('怨灵') || n.includes('挽歌') || n.includes('观渊') || n.includes('眼')) return 'wraith'
    if (n.includes('教徒') || n.includes('食尸鬼') || n.includes('咏叹') || n.includes('主教') || n.includes('恶')) return 'cultist'
    if (n.includes('荆棘') || n.includes('刀盾') || n.includes('弩手') || n.includes('重斧') || n.includes('亲卫') || n.includes('佣兵') || n.includes('旗卫') || n.includes('前卫')) return 'thorn'
    return 'frog'
  }
  const ROLE_KEY: Record<string, string> = { tank: 'guard', healer: 'priest', dps: 'ranger' }
  return ROLE_KEY[c.role ?? 'dps'] ?? 'ranger'
}
