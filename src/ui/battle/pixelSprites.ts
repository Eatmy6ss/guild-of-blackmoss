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

// ---- 我方三职业(HD-2D 精度升级:24 宽 × 28 高,面朝右,三阶光影)----
// 色键约定:大写=暗部/轮廓,k=铁框,g=金饰,小写=中间调,双写=高光

const GUARD: PixelDef = {
  rows: [
    '........................',
    '.......kkkkkkk..........',
    '......khhhhhhhk.........',
    '.....khhhhhhhhhk........',
    '.....khdssssdhk.........',
    '.....khdskeedsk.........',
    '.....khdssssdhk.........',
    '......khdssdhk..........',
    '..kkkkhhsssshhkkkk......',
    '.khhhhhdssssdhhhhhk.....',
    '.khhhhhdssssdhhhhhk.....',
    '.khhhkssssssssshhkkkk...',
    '.khhksaaaaaaasskssssk...',
    '.khksaaaaaaaaassksk.....',
    '.khksaaaaaaaaassk.......',
    '.khksaaaaaaaaassk.......',
    '.khkaaaaaaaaaaaask......',
    '..kkaaaaaaaaaaaak.......',
    '..kkssssssssssskk.......',
    '...ksssssssssssk........',
    '...kss.kkkkk.ssk........',
    '...kss.kddddkssk........',
    '...ksd.kddddksd.........',
    '...ksd.kddddksd.........',
    '...ksd.kddddksd.........',
    '...kkd..kkk.kdk.........',
    '......kddk.kdk..........',
    '......kkkk.kkk..........',
  ],
  palette: {
    k: '#1a2030', h: '#c8d8f0', d: '#5a6f96', s: '#8fa3c8',
    e: '#f0d060', a: '#3a6aa4',
  },
}

const PRIEST: PixelDef = {
  rows: [
    '........................',
    '........kkkkkk..........',
    '.......kggggggk.........',
    '......kgrrrrrrgk........',
    '......krrrrrrrk.........',
    '.....krrssssrrk.........',
    '.....krrseesrrk.........',
    '.....krrssssrrk.........',
    '.....krrrrrrrrk...kk....',
    '....krrrrrrrrrrk.kggk...',
    '....krrwrrwrrrk.kggk....',
    '...krrrwrrwrrrk.kggk....',
    '...krrrrrrrrrrkkgggk....',
    '...krrrrrrrrrrkkgk......',
    '...krrwrrrwrrrk.k.......',
    '..krrrwrrrwrrrk.k.......',
    '..krrrrrrrrrrrrkk.......',
    '..krrrrrrrrrrrrk........',
    '..krrrrrrrrrrrrk........',
    '.krrrrrrrrrrrrrrk.......',
    '.krrrrrrrrrrrrrrk.......',
    '.krrrwwrrrwrrrrrk.......',
    '..krrrrrrrrrrrrrk.......',
    '..krrrrrrrrrrrrk........',
    '...krrrrrrrrrrrk........',
    '...krrrrrrrrrrk.........',
    '....kkkkkkkkkk..........',
    '........................',
  ],
  palette: {
    k: '#2a2418', g: '#e8c87a', r: '#e0e0e0', w: '#a8a8b0',
    s: '#e8c8a0', e: '#1a1a2a',
  },
}

const RANGER: PixelDef = {
  rows: [
    '........................',
    '.......kkkkkk...........',
    '......kccccccck.........',
    '.....kcccccccck..kk.....',
    '.....kcscscscsk.kbbk....',
    '.....kcseseecsk.kbbk....',
    '.....kcscscscsk.kbbk....',
    '......kcscsscsk.kbbk....',
    '...kkkkccccccckkkbbk....',
    '..kllllcccllllk.kbbk....',
    '.kllllllclllllk.kbbk....',
    '.kllkccccccccck.kbbk....',
    '.kllkccllllcckkkbbk.....',
    '.kllkclllllck.kbbk......',
    '.kllkclllllckkbbk.......',
    '.kllkccclllckbbk........',
    '.kllkccccllckb..........',
    '..kllkccccllk...........',
    '..kkllccccck............',
    '...kllccccck............',
    '...klc.kkk.ck...........',
    '...kll.kllk.k...........',
    '...kll.kllk.k...........',
    '...kll.kllk.k...........',
    '...kll.kllk.k...........',
    '...kkk.kkk.kk...........',
    '........................',
    '........................',
  ],
  palette: {
    k: '#1a2418', c: '#6dbf6d', s: '#e8c8a0', e: '#1a1a2a',
    l: '#8a6a42', b: '#a8824f',
  },
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

// 龙铁系独特武器贴图(反馈:boss 掉落要有独特造型)——烙焰长剑:熔岩纹刃+龙骨柄,8×16
const WP_DRAGON: PixelDef = {
  rows: [
    '...fo...',
    '..fho...',
    '..fho...',
    '.fhsf...',
    '.fhsfo..',
    'fhsso...',
    'fhs.f...',
    'fhs.....',
    'fhs.....',
    'khs.....',
    'kk......',
    'kk......',
    'kg......',
    'kg......',
    'kk......',
    'k.......',
  ],
  palette: { f: '#ff9a3a', h: '#ffd060', s: '#f0e4c2', o: '#d84a2a', k: '#3a2a18', g: '#e8c87a' },
}

// ---- 生成管线 ----

// ---- 素材包精灵(CC0 Dungeon Crawl Stone Soup tiles,public/assets/mon/)----
// 制作人指示:网上找素材包模仿/改造,不从零画。DCSS 32×32 手绘像素,质量远超手写矩阵。

const URL_TILES: Record<string, string> = {
  'tile-floor-swamp': '/assets/tiles/floor-swamp.png',
  'tile-floor-lava': '/assets/tiles/floor-lava.png',
  'tile-floor-lava2': '/assets/tiles/floor-lava2.png',
  'tile-floor-ice': '/assets/tiles/floor-ice.png',
  'tile-floor-pebble': '/assets/tiles/floor-pebble.png',
  'tile-floor-pebble2': '/assets/tiles/floor-pebble2.png',
  'tile-floor-ash': '/assets/tiles/floor-ash.png',
  'tile-floor-cobalt': '/assets/tiles/floor-cobalt.png',
  'tile-wall-brick': '/assets/tiles/wall-brick.png',
  'tile-wall-gray': '/assets/tiles/wall-gray.png'
}

const URL_SPRITES: Record<string, string> = {
  'mon-firedragon': '/assets/mon/firedragon.png',
  'mon-deathdrake': '/assets/mon/deathdrake.png',
  'mon-lindwurm': '/assets/mon/lindwurm.png',
  'mon-dracored': '/assets/mon/dracored.png',
  'mon-dracoknight': '/assets/mon/dracoknight.png',
  'mon-dracoscorcher': '/assets/mon/dracoscorcher.png',
  'mon-ghost': '/assets/mon/ghost.png',
  'mon-skelwar': '/assets/mon/skelwar.png',
  'mon-mummypriest': '/assets/mon/mummypriest.png',
  'mon-wolf': '/assets/mon/wolf.png',
  'mon-ogre': '/assets/mon/ogre.png',
  // 全量替换批(版图一/二小怪与 boss 全 DCSS 帧)
  'mon-goliathfrog': '/assets/mon/goliathfrog.png',
  'mon-occultist': '/assets/mon/occultist.png',
  'mon-ghoul': '/assets/mon/ghoul.png',
  'mon-kobold': '/assets/mon/kobold.png',
  'mon-wraith': '/assets/mon/wraith.png',
  'mon-myrmidon': '/assets/mon/myrmidon.png',
  'mon-hierophant': '/assets/mon/hierophant.png',
  'mon-deathknight': '/assets/mon/deathknight.png',
  'mon-arcanist': '/assets/mon/arcanist.png',
  'mon-hellknight': '/assets/mon/hellknight.png',
  'mon-bullfrog': '/assets/mon/bullfrog.png',
  'mon-leech': '/assets/mon/leech.png',
  'mon-bat': '/assets/mon/bat.png',
  'mon-spider': '/assets/mon/spider.png',
  'mon-gnoll': '/assets/mon/gnoll.png',
  'mon-martyredshade': '/assets/mon/martyredshade.png',
}

/** 我方三职业分层(DCSS 分层系统:base+护甲+披风+武器,32×32 同网格叠加) */
const URL_WEAPONS: Record<string, string> = {
  'w-sword': '/assets/layers/w-sword.png',
  'w-axe': '/assets/layers/w-axe.png',
  'w-bow': '/assets/layers/w-bow.png',
  'w-staff': '/assets/layers/w-staff.png',
  'w-dagger': '/assets/layers/w-dagger.png',
  'w-rapier': '/assets/layers/w-rapier.png',
  'w-mace': '/assets/layers/w-mace.png',
  'w-katana': '/assets/layers/w-katana.png',
}

/** 武器 baseId → 素材帧 key(装备联动:换装即换手持) */
export function weaponSpriteKey(baseId: string): string | null {
  const id = baseId
  if (id.includes('dragon-brand')) return 'w-katana' // 烙焰长剑:焰纹长刃
  if (id.includes('greatsword') || id.includes('line-warrior')) return 'w-sword'
  if (id.includes('katana') || id.includes('rapier')) return 'w-rapier'
  if (id.includes('axe')) return 'w-axe'
  if (id.includes('bow') || id.includes('line-ranger')) return 'w-bow'
  if (id.includes('staff') || id.includes('line-priest') || id.includes('line-mage') || id.includes('line-warlock')) return 'w-staff'
  if (id.includes('dagger')) return 'w-dagger'
  if (id.includes('mace') || id.includes('hammer')) return 'w-mace'
  if (id.includes('sword') || id.includes('line-guard')) return 'w-sword'
  return null
}

const URL_LAYERS: Record<string, string[]> = {
  'hero-guard': [
    '/assets/layers/human_m.png',
    '/assets/layers/chainmail.png',
    '/assets/layers/cloak_blue.png',
    '/assets/layers/buckler.png',
    '/assets/layers/long_sword.png',
  ],
  'hero-priest': [
    '/assets/layers/human_m.png',
    '/assets/layers/robe_white.png',
    '/assets/layers/cloak_black.png',
    '/assets/layers/quarterstaff.png',
  ],
  'hero-ranger': [
    '/assets/layers/human_m.png',
    '/assets/layers/leather.png',
    '/assets/layers/cloak_brown.png',
    '/assets/layers/bow.png',
  ],
}

/** 全部待预加载 URL(素材帧+职业分层) */

/** 预加载全部素材 PNG(mount 时 await;成功进同一 texture 缓存) */
export async function preloadUrlSprites(): Promise<void> {
  const jobs: [string, string][] = [
    ...Object.entries(URL_TILES),
    ...Object.entries(URL_WEAPONS),
    ...Object.entries(URL_SPRITES),
    ...Object.values(URL_LAYERS).flat().map((url) => [url, url] as [string, string]),
  ]
  await Promise.all(
    jobs.map(
      ([key, url]) =>
        new Promise<void>((res) => {
          const img = new Image()
          img.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = img.width
            canvas.height = img.height
            canvas.getContext('2d')!.drawImage(img, 0, 0)
            const tex = Texture.from(canvas)
            tex.source.scaleMode = 'nearest'
            tex.source.style.scaleMode = 'nearest'
            cache.set(key, tex)
            cache.set(url, tex)
            res()
          }
          img.onerror = () => {
            console.warn('[pixelSprites] 素材加载失败:', url)
            res()
          }
          img.src = url
        }),
    ),
  )
}

/** 纹理缓存直读(渲染器 TilingSprite 用;未加载返回 undefined) */
export function cache_get(key: string): Texture | undefined {
  return cache.get(key)
}

/** 职业分层帧列表(渲染器逐层叠加);非分层 key 返回 undefined */
export function spriteLayersFor(key: string): string[] | undefined {
  return URL_LAYERS[key]
}

const cache = new Map<string, Texture>()

/** 精灵显示缩放:root ×2 后全部 ×2 显示(素材帧/HD/旧矩阵视觉尺寸统一) */
export function spriteScale(_key: string): number {
  return 2
}

/** 纹理就绪探测(素材帧异步加载完成后由渲染层自愈替换;未就绪返回 undefined) */
export function tryGetTex(key: string): Texture | undefined {
  if (key.startsWith('mon-') || key.startsWith('/assets/')) return cache.get(key)
  return undefined
}

/** ASCII 像素图 → nearest-neighbor 纹理(幂等,按 key 缓存;矩阵查 UNIT_SPRITES,素材/分层按 url 查缓存) */
export function pixelTexture(key: string): Texture {
  const cached = cache.get(key)
  if (cached) return cached
  if (key.startsWith('mon-') || key.startsWith('/assets/')) return Texture.WHITE // 预加载未就绪的占位
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
  'wpn-dragon': WP_DRAGON,
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
    // 全量 DCSS 精细帧(素材包打底模仿+改造):14 只 boss 一个不落
    if (n.includes('瓦尔塞隆')) return 'mon-deathdrake'
    if (n.includes('瓦洛萨里斯')) return 'mon-firedragon'
    if (n.includes('格鲁什')) return 'mon-ogre'
    if (n.includes('掘锚')) return 'mon-lindwurm'
    if (n.includes('塔尔玛') || n.includes('马尔萨乌斯')) return 'mon-hierophant'
    if (n.includes('摩尔德雷克')) return 'mon-deathknight'
    if (n.includes('薇尔霍拉')) return 'mon-arcanist'
    if (n.includes('科尔特')) return 'mon-hellknight'
    if (n.includes('维克托')) return 'mon-myrmidon'
    if (n.includes('荆棘')) return 'mon-myrmidon'
    return 'mon-ogre'
  }
  if (c.team === 'enemy') {
    if (n.includes('蛙人') || n.includes('蛙群') || n.includes('蛙')) return 'mon-goliathfrog'
    if (n.includes('水蛭') || n.includes('沼腹')) return 'mon-leech'
    if (n.includes('蝠')) return 'mon-bat'
    if (n.includes('蛛')) return 'mon-spider'
    if (n.includes('龙裔鳞卫') || n.includes('狂信卫士') || n.includes('龙裔祭卫')) return 'mon-dracored'
    if (n.includes('龙渊鳞卫') || n.includes('渊龙亲卫')) return 'mon-dracoknight'
    if (n.includes('龙裔吐息手') || n.includes('龙裔驭火者') || n.includes('龙渊驭火者') || n.includes('焰背蜥后')) return 'mon-dracoscorcher'
    if (n.includes('提灯亡魂')) return 'mon-martyredshade' // 橙焰提灯魂
    if (n.includes('朝圣者亡魂')) return 'mon-ghost'
    if (n.includes('山脊霜狼') || n.includes('头狼')) return 'mon-wolf'
    if (n.includes('食尸鬼')) return 'mon-ghoul'
    if (n.includes('火脊蜥蜴') || n.includes('焰背')) return 'mon-goliathfrog'
    if (n.includes('龙裔') || n.includes('龙渊') || n.includes('渊龙') || n.includes('幼龙') || n.includes('驭火')) return 'mon-dracored'
    if (n.includes('朝圣') || n.includes('狂徒') || n.includes('教团') || n.includes('圣火祭司')) return 'mon-occultist'
    if (n.includes('锻偶') || n.includes('锻炉监工')) return 'mon-myrmidon'
    if (n.includes('重斧')) return 'mon-gnoll' // 持斧豺狼人
    if (n.includes('刀盾') || n.includes('弩手') || n.includes('亲卫') || n.includes('佣兵') || n.includes('旗卫') || n.includes('前卫')) return 'mon-myrmidon'
    if (n.includes('狼')) return 'mon-wolf'
    if (n.includes('矿工') || n.includes('蝠') || n.includes('蛛') || n.includes('矿灯')) return 'mon-kobold'
    if (n.includes('骸骨') || n.includes('墓卫') || n.includes('掘墓') || n.includes('墓骑') || n.includes('冰棺')) return 'mon-skelwar'
    if (n.includes('怨灵') || n.includes('挽歌') || n.includes('观渊') || n.includes('亡魂') || n.includes('提灯') || n.includes('眼')) return 'mon-wraith'
    if (n.includes('教徒') || n.includes('咏叹') || n.includes('主教') || n.includes('恶')) return 'mon-occultist'
    if (n.includes('荆棘')) return 'mon-myrmidon'
    return 'mon-goliathfrog'
  }
  const ROLE_KEY: Record<string, string> = { tank: 'guard', healer: 'priest', dps: 'ranger' }
  return ROLE_KEY[c.role ?? 'dps'] ?? 'ranger'
}
