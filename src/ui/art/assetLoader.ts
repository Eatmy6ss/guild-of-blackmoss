import { quantizeRgba } from './palette'

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
export const getAssetCanvas = (path: string) => images.get(path)

/** 一次加载/量化，各个预览与Pixi复用；失败保留降级，不触碰游戏状态。 */
export function loadArt(path: string): Promise<HTMLCanvasElement | null> {
  const cached = loaded.get(path)
  if (cached) return cached
  const pending = new Promise<HTMLCanvasElement | null>(resolve => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(image, 0, 0)
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
