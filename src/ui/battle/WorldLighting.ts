import { Container, Sprite, Texture } from 'pixi.js'

/** 三层只照亮世界，不盖住 HTML 指令/说明。纹理复用至窗口或场景改变。 */
export class WorldLighting extends Container {
  constructor() { super(); this.eventMode = 'none' }

  resize(width: number, height: number, cool: boolean) {
    this.removeChildren().forEach(child => child.destroy({ texture: true, textureSource: true }))
    for (const kind of ['ambient', 'light', 'vignette']) {
      const canvas = document.createElement('canvas')
      canvas.width = 512; canvas.height = 512
      const ctx = canvas.getContext('2d')!
      if (kind === 'ambient') {
        ctx.fillStyle = 'rgba(20,28,42,.16)'
        ctx.fillRect(0, 0, 512, 512)
      } else if (kind === 'light') {
        for (const [x, y] of [[80, 100], [440, 200]]) {
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, 200)
          gradient.addColorStop(0, cool ? 'rgba(140,186,228,.18)' : 'rgba(255,170,88,.22)')
          gradient.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.fillStyle = gradient; ctx.fillRect(0, 0, 512, 512)
        }
      } else {
        const gradient = ctx.createRadialGradient(256, 245, 130, 256, 245, 355)
        gradient.addColorStop(0, 'rgba(3,3,5,0)'); gradient.addColorStop(1, 'rgba(3,3,5,.65)')
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, 512, 512)
      }
      const sprite = new Sprite(Texture.from(canvas))
      if (kind === 'light') sprite.blendMode = 'screen'
      sprite.width = width; sprite.height = height
      this.addChild(sprite)
    }
  }

  override destroy() {
    this.removeChildren().forEach(child => child.destroy({ texture: true, textureSource: true }))
    super.destroy()
  }
}
