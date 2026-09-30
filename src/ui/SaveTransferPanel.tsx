import { useEffect, useRef, useState } from 'react'
import { importSave, replaceGuildSave, type GuildSave } from '../state/save'
import { kingdomTrust } from '../sim/kingdom'

export function SaveTransferPanel({ mode, initialCode, onClose }: { mode: 'import' | 'export'; initialCode: string; onClose: () => void }) {
  const [code, setCode] = useState(initialCode)
  const [notice, setNotice] = useState('')
  const [preview, setPreview] = useState<GuildSave | null>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    field.current?.focus()
    return () => { document.body.style.overflow = overflow; previous?.focus() }
  }, [])
  return <div className="screen-overlay" onKeyDown={(event) => {
    event.stopPropagation()
    if (event.key === 'Escape') onClose()
    if (event.key === 'Tab') {
      const focusable = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea') ?? [])
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus() }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0]?.focus() }
    }
  }}>
    <section ref={panel} className="screen-panel save-transfer" role="dialog" aria-modal="true" aria-labelledby="save-transfer-title">
      <div className="screen-head"><h2 id="save-transfer-title">{mode === 'export' ? '备份公会存档' : '导入公会存档'}</h2><button onClick={onClose}>关闭</button></div>
      <p>{mode === 'export' ? '复制下方完整代码，保存到自己的文档。成员、装备、王国委托、已领报酬与远征进度都会一并保留。' : '粘贴完整存档代码，先核对预览，再确认替换。建议先导出本机存档作为备份。'}</p>
      <label htmlFor="save-code">存档代码</label>
      <textarea ref={field} id="save-code" value={code} readOnly={mode === 'export'} spellCheck={false} onChange={(event) => { setCode(event.target.value); setPreview(null); setNotice('') }} />
      {notice && <p role="status" className="royal-notice">{notice}</p>}
      {mode === 'export' ? <button className="primary" onClick={async () => {
        try {
          if (!navigator.clipboard) throw new Error('clipboard unavailable')
          await navigator.clipboard.writeText(code)
          setNotice('已复制。请将代码粘贴到自己的备份文档中。')
        } catch {
          field.current?.focus(); field.current?.select()
          setNotice('浏览器未允许自动复制。代码已选中，可按 Ctrl+C（Mac：⌘C）复制。')
        }
      }}>复制完整代码</button> : <>
        <button disabled={!code.trim()} onClick={() => {
          const parsed = importSave(code)
          setPreview(parsed)
          setNotice(parsed ? '' : '代码无效或版本不受支持，当前存档没有改变。请重新粘贴完整代码。')
        }}>检查存档</button>
        {preview && <div className="save-preview">
          <p>第 {preview.day} 日 · {preview.members.filter((m) => m.alive).length} 位存活成员 · {preview.gold} 金 · {preview.blessing} 祝福</p>
          <p>王国信任 {kingdomTrust(preview.kingdom)} · 在办 {preview.kingdom.active.length} 份 · 已结案 {preview.kingdom.completed.length} 份</p>
          {preview.runState.activeRun && <p>正在{preview.runState.activeRun.kind === 'tower' ? `挑战高塔第 ${preview.runState.activeRun.floor} 层` : `进行副本远征（第 ${preview.runState.activeRun.stepIdx + 1} 场）`} · 战斗与已到账奖励将一起恢复。</p>}
          <p>确认后将替换这台设备上当前的公会进度。</p>
          <button className="primary" onClick={() => {
            if (replaceGuildSave(preview)) window.location.reload()
            else setNotice('导入未能保存，当前进度没有改变。请检查浏览器存储后重试。')
          }}>确认导入并替换当前进度</button>
        </div>}
      </>}
    </section>
  </div>
}
