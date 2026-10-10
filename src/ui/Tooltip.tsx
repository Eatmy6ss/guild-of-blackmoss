import { cloneElement, useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type TriggerProps = { 'aria-describedby'?: string; disabled?: boolean }

/** 说明浮到当前设计舞台，避免被面板滚动区裁掉；定位只换算一次 CSS 缩放。 */
export function Tooltip({ content, children }: { content: ReactNode; children: ReactElement<TriggerProps> }) {
  const id = useId()
  const anchor = useRef<HTMLSpanElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>()
  const enter = () => { clearTimeout(leaveTimer.current); setHovered(true); setDismissed(false) }
  const leave = () => { leaveTimer.current = setTimeout(() => setHovered(false), 160) }
  useEffect(() => () => clearTimeout(leaveTimer.current), [])
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const open = (hovered || focused) && !dismissed
  const host = anchor.current?.closest<HTMLElement>('.game-stage') ?? document.body
  useLayoutEffect(() => {
    if (!open || !anchor.current || !tip.current) return
    const position = () => {
      const a = anchor.current!.getBoundingClientRect(), h = host.getBoundingClientRect()
      const stage = host !== document.body
      const scale = stage ? h.width / host.clientWidth : 1
      const width = stage ? host.clientWidth : window.innerWidth
      const height = stage ? host.clientHeight : window.innerHeight
      const originX = stage ? h.left : 0, originY = stage ? h.top : 0
      const t = tip.current!
      t.style.width = `${Math.min(320, width - 24)}px`
      const x = Math.max(12, Math.min((a.left - originX) / scale, width - t.offsetWidth - 12))
      const below = (a.bottom - originY) / scale + 6
      const y = below + t.offsetHeight < height - 12 ? below : Math.max(12, (a.top - originY) / scale - t.offsetHeight - 6)
      t.style.left = `${x + (stage ? 0 : window.scrollX)}px`
      t.style.top = `${y + (stage ? 0 : window.scrollY)}px`
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setDismissed(true) }
    }
    const observer = new ResizeObserver(position)
    observer.observe(tip.current); observer.observe(host)
    position()
    window.addEventListener('resize', position)
    document.addEventListener('scroll', position, true)
    document.addEventListener('keydown', escape, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', position)
      document.removeEventListener('scroll', position, true)
      document.removeEventListener('keydown', escape, true)
    }
  }, [open, host])
  const describedBy = [children.props['aria-describedby'], open ? id : undefined].filter(Boolean).join(' ') || undefined
  return <span className="tooltip-anchor" ref={anchor}
    tabIndex={children.props.disabled ? 0 : undefined}
    aria-describedby={children.props.disabled ? describedBy : undefined}
    onPointerEnter={enter}
    onPointerLeave={leave}
    onFocus={() => { setFocused(true); setDismissed(false) }}
    onBlur={() => setFocused(false)}>
    {cloneElement(children, { 'aria-describedby': describedBy })}
    {open && createPortal(<div ref={tip} id={id} className="game-tooltip" role="tooltip">{content}</div>, host)}
  </span>
}
