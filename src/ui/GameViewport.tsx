import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { fitGameViewport } from './viewport'

/** 桌面界面保持同一构图；Pixi 单独按屏幕像素渲染，不能跟着 CSS 再缩一遍。 */
export function GameViewport({ children }: { children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const host = viewport.current!, content = stage.current!
    const resize = () => {
      const fit = fitGameViewport(host.clientWidth, host.clientHeight)
      content.style.transform = `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})`
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()
    return () => observer.disconnect()
  }, [])
  return <div className="game-viewport" ref={viewport}>
    <div className="game-stage" ref={stage}>{children}</div>
  </div>
}
