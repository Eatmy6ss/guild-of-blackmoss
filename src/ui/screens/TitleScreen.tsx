// 标题屏(U29 R2-5 自 App.tsx 迁出;行为零变)
import { exportSave, loadGuildSave } from '../../state/save'

interface TitleScreenProps {
  hasSave: boolean
  offlineNote: string | null
  resumeNotice: string
  muted: boolean
  volume: number
  buildDate: string
  onEnter: () => void
  onRestart: () => void
  onToggleMute: () => void
  onVolume: (v: number) => void
  onShowCredits: () => void
  onExportSave: () => void
  onImportSave: () => void
}

export function TitleScreen(props: TitleScreenProps) {
  const { hasSave, offlineNote, resumeNotice, muted, volume, buildDate } = props
  return (
    <div className="title-overlay">
      <div className="title-logo">黑苔公会</div>
      <div className="title-sub">GUILD OF BLACKMOSS</div>
      <div className="title-tagline">英雄会死，故事不会。</div>
      <div className="title-version">build {buildDate} · 熟练度/难度以本版为准</div>
      {offlineNote && <div className="title-offline">{offlineNote}</div>}
      {resumeNotice && <p className="title-offline" role="status">{resumeNotice}</p>}
      <div className="title-actions">
        <button onClick={props.onEnter}>
          {hasSave ? '▶ 继续旅程' : '▶ 开始新公会'}
        </button>
        {hasSave && (
          <button onClick={props.onRestart}>✦ 开始新公会</button>
        )}
      </div>
      <div className="title-foot">
        M1 · 内部构建 · 暂定名《黑苔公会》
        <span className="title-saveops">
          <button className="mini-btn" onClick={props.onToggleMute}>{muted ? '🔇' : '🔊'}</button>
          <input className="mini-volume" type="range" min={0} max={100} value={Math.round(volume * 100)} aria-label="主音量" title="主音量"
            onChange={(e) => props.onVolume(Number(e.target.value) / 100)} />
          <button className="mini-btn" onClick={props.onShowCredits}>素材致谢</button>
          <button className="mini-btn" onClick={props.onExportSave}>📤 导出存档</button>
          <button className="mini-btn" onClick={props.onImportSave}>📥 导入存档</button>
        </span>
      </div>
    </div>
  )
}

export { loadGuildSave, exportSave }
