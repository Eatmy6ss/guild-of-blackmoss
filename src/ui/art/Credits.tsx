import { useEffect, useRef } from 'react'
import { credits, SPRITE_PATHS } from './catalog'
import { assetUrl, hasBundledAssets } from './assetLoader'

export function CreditsContent() {
  return <>
    <p className="library-note">{SPRITE_PATHS.length}张像素素材，5首音乐，6个音效。图像和声音逐文件确认CC0许可；思源宋体/黑体界面子集及管理员 Fusion Pixel 字体另遵 OFL。人物与地景共用黑苔色板。</p>
    <div className="source-list">{[...new Map(credits.assets.map(a => [a.source, a])).values()].map(a => <p key={a.source}><a href={a.source} target="_blank" rel="noopener">{a.author}</a> · <a href={a.licenseUrl} target="_blank" rel="noopener">{a.license}</a></p>)}{credits.fonts.map(font => <p key={font.source}><a href={font.source} target="_blank" rel="noopener">{font.author}</a> · <a href={assetUrl(font.notice)}>OFL 许可</a></p>)}</div>
    <details><summary>逐文件来源与改动记录</summary><p><a href={assetUrl('/assets/CREDITS.json')}>完整资源清单</a> · <a href={assetUrl('/assets/licenses/DCSS-README.txt')}>DCSS原包作者列表</a></p>{credits.assets.map(a => <p className="asset-record" key={a.id}>{a.path} · {a.modified ? '音频转码与响度统一' : '原文件'} · {a.license}</p>)}</details>
  </>
}

export function CreditsDialog({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'; panel.current?.focus({ preventScroll: true })
    return () => { document.body.style.overflow = overflow; previous?.focus({ preventScroll: true }) }
  }, [])
  return <div className="screen-overlay art-credits-overlay" onKeyDown={event => {
    event.stopPropagation()
    if (event.key === 'Escape') onClose()
    if (event.key === 'Tab') {
      const elements = Array.from(panel.current?.querySelectorAll<HTMLElement>('button, a, summary') ?? []).filter(e => e.getClientRects().length)
      if (event.shiftKey && (document.activeElement === elements[0] || document.activeElement === panel.current)) { event.preventDefault(); elements.at(-1)?.focus() }
      else if (!event.shiftKey && document.activeElement === elements.at(-1)) { event.preventDefault(); elements[0]?.focus() }
    }
  }}>
    <section ref={panel} tabIndex={-1} className="screen-panel" role="dialog" aria-modal="true" aria-labelledby="art-credits-title">
      <div className="screen-head"><h2 id="art-credits-title">感谢这些世界的创作者</h2><button onClick={onClose}>关闭致谢</button></div>
      {!hasBundledAssets && <p><a href={assetUrl('resources.html')} target="_blank" rel="noopener">打开素材图鉴：地域、人物换装与声音试听</a></p>}
      <CreditsContent />
    </section>
  </div>
}
