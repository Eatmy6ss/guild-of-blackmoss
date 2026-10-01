import { useEffect, useRef, useState } from 'react'
import { heroLayers, type Appearance } from './catalog'
import { getAssetCanvas, loadArt } from './assetLoader'
export function ArtCanvas({ paths, label, size = 64, className = '' }: { paths: string[]; label: string; size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)
  const key = paths.join('|')
  useEffect(() => {
    let cancelled = false
    Promise.all(paths.map(loadArt)).then(images => {
      if (cancelled || !ref.current) return
      const ctx = ref.current.getContext('2d')!
      ctx.clearRect(0, 0, 32, 32)
      setFailed(images.every(image => !image))
      for (const path of paths) { const image = getAssetCanvas(path); if (image) ctx.drawImage(image, 0, 0) }
    })
    return () => { cancelled = true }
  }, [key])
  return <span className={`art-canvas ${className}`} style={{ width: size, height: size }}>
    <canvas ref={ref} width={32} height={32} role="img" aria-label={label} />
    {failed && <span className="art-fallback" aria-hidden="true">♟</span>}
  </span>
}
export function HeroPortrait({ member, size = 64 }: { member: Appearance & { name?: string }; size?: number }) {
  return <ArtCanvas paths={heroLayers(member)} label={`${member.name ?? '人物'}的装备外观`} size={size} className="hero-portrait" />
}
