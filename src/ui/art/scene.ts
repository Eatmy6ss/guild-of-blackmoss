import { getAssetCanvas } from './assetLoader'
import { sceneArt } from './catalog'

/** 代码构筑场景，不把整张背景当美术包贴图；战场和资源预览共用。 */
export function paintScene(ctx: CanvasRenderingContext2D, width: number, height: number, id: string, tileSize?: number) {
  const art = sceneArt(id)
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = art.sky; ctx.fillRect(0, 0, width, height)
  const floor = getAssetCanvas(art.floor), wall = getAssetCanvas(art.wall)
  const tile = tileSize ?? (width < 640 ? 64 : 96)
  if (floor) for (let y = 52; y < height; y += tile) for (let x = 0; x < width; x += tile) ctx.drawImage(floor, x, y, tile, tile)
  ctx.fillStyle = '#121416'; ctx.globalAlpha = .1; ctx.fillRect(0, 52, width, height - 52); ctx.globalAlpha = 1
  if (art.motif === 'hall' && wall) {
    for (let x = 0; x < width; x += tile) ctx.drawImage(wall, x, 0, tile, 66)
    ctx.fillStyle = '#121416'; ctx.globalAlpha = .3; ctx.fillRect(0, 0, width, 66); ctx.globalAlpha = 1
  } else if (art.motif === 'ridge') {
    ctx.fillStyle = '#202426'
    for (let i = 0; i < 7; i++) {
      const x = Math.floor(width * i / 6)
      ctx.beginPath(); ctx.moveTo(x - 90, 60); ctx.lineTo(x, 8 + (i % 3) * 12); ctx.lineTo(x + 100, 60); ctx.fill()
    }
  }
  // 一条踏过的石路承接战场，不在人物中间画分屏线。
  const path = getAssetCanvas('/assets/tiles/floor-pebble.png')
  ctx.globalAlpha = .35
  if (path) for (let y = 52; y < height; y += tile) ctx.drawImage(path, Math.floor(width / 2 - tile / 2), y, tile, tile)
  ctx.globalAlpha = 1
  const propSize = tile
  for (let i = 0; i < 4; i++) {
    const image = getAssetCanvas(art.props[i % art.props.length])
    if (!image) continue
    const right = i % 2 === 1
    const x = right ? width - propSize - 6 : 6
    const y = i < 2 ? 18 : height - propSize + 12
    ctx.globalAlpha = i < 2 ? .8 : .5
    ctx.drawImage(image, x, y, propSize, propSize)
  }
  ctx.globalAlpha = 1
  // 像素布旗：只有地区识别作用，不增设阵营事实。
  ctx.fillStyle = '#121416'; ctx.fillRect(Math.floor(width / 2) - 12, 0, 24, 36)
  ctx.fillStyle = art.accent; ctx.fillRect(Math.floor(width / 2) - 8, 0, 16, 28)
  ctx.fillStyle = '#dcba87'; ctx.fillRect(Math.floor(width / 2) - 2, 6, 4, 12)
}
