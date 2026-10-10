export const GAME_WIDTH = 1920
export const GAME_HEIGHT = 1080

export function fitGameViewport(width: number, height: number) {
  const scale = Math.min(width / GAME_WIDTH, height / GAME_HEIGHT)
  return { scale, x: (width - GAME_WIDTH * scale) / 2, y: (height - GAME_HEIGHT * scale) / 2 }
}

/** 纹理的一格只占整数个物理像素；矢量文字不受这个取整限制。 */
export function worldPixelScale(designScale: number, uiScale: number, dpr: number) {
  return Math.max(1, Math.floor(designScale * uiScale * dpr + 1e-6)) / dpr
}
