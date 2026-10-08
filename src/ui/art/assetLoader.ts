import { quantizeRgba } from './palette'
import credits from '../../../public/assets/CREDITS.json'

const bundledNode = typeof document === 'undefined' ? null : document.getElementById('blackmoss-bundled-assets')
export const hasBundledAssets = !!bundledNode
const bundled: Record<string, string> = bundledNode ? JSON.parse(bundledNode.textContent || '{}') : {}
export function assetUrl(path: string): string {
  if (path.startsWith('data:')) return path
  if (bundled[path]) return bundled[path]
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
}
const loaded = new Map<string, Promise<HTMLCanvasElement | null>>()
const images = new Map<string, HTMLCanvasElement>()
const frames = new Map(credits.assets.flatMap(asset => 'sourceRect' in asset ? [[asset.path, asset.sourceRect] as const] : []))
export const getAssetCanvas = (path: string) => images.get(path)

/** 一次加载/量化，各个预览与Pixi复用；失败保留降级，不触碰游戏状态。 */
export function loadArt(path: string): Promise<HTMLCanvasElement | null> {
  const cached = loaded.get(path)
  if (cached) return cached
  const pending = new Promise<HTMLCanvasElement | null>(resolve => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      const frame = frames.get(path)
      canvas.width = frame ? 32 : image.naturalWidth; canvas.height = frame ? 32 : image.naturalHeight
      const ctx = canvas.getContext('2d')!
      // 原包没有持握书层，复用原版书图，以同一32px画布定位到左手。
      // DOM与Pixi都读取本缓存，避免人物头像与战场拿不同的物件。
      ctx.imageSmoothingEnabled = false
      if (frame) {
        const [x, y, width, height] = frame
        ctx.drawImage(image, x, y, width, height, Math.floor((32 - width) / 2), Math.floor((32 - height) / 2), width, height)
      } else if (/\/layers\/held_(soulbook|tidebook)\.png$/.test(path)) ctx.drawImage(image, 0, 10, 16, 16)
      else ctx.drawImage(image, 0, 0)
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
      quantizeRgba(pixels.data, path.includes('/tiles/floor-')); ctx.putImageData(pixels, 0, 0)
      images.set(path, canvas); resolve(canvas)
    }
    image.onerror = () => { console.warn('[art] 素材不可用，使用降级画面:', path); resolve(null) }
    image.src = assetUrl(path)
  })
  loaded.set(path, pending)
  return pending
}
