import { useEffect, type ReactNode } from 'react'
import type { BattleState, Stance, Member } from '../../sim/types'
import { STANCE_NAME, setStance, setFocus, useHealPotion, useFuryPotion, castSkillManually, stopUnit, setHoldGround } from '../../sim/combat'
import { AUTOPAUSE_LABELS, type AutoPausePrefs } from '../battle/autopause'
import { SignatureBar } from '../battle/SignatureBar'
import { SIGNATURE_SKILLS } from '../../data/signature'
import { skillLine } from '../../data/effect-text'
import { Tooltip } from '../Tooltip'

type Aim = { kind: 'skill' | 'sig'; memberId: string; skillId: string }
/** 副本与高塔共用表现；命令、结算和持久化仍由各自控制器负责。 */
export function BattleScreen(props: {
  title: string; route: ReactNode
  battle: BattleState; running: boolean; battleSpeed: 1 | 2 | 3
  intents: { telegraphing: boolean; casting: boolean; casterId?: string } | null
  cmd: (fn: (b: BattleState) => void, force?: boolean) => void
  onAutoMode?: (v: boolean) => void
  sfxCmd: () => void; setRunning: (v: boolean | ((v: boolean) => boolean)) => void
  setBattleSpeed: (v: 1 | 2 | 3) => void
  members: Member[]; selIds: string[]
  onToggleAutoCast: (memberId: string, skillId: string) => void
  aim: Aim | null; onAim: (a: Aim | null) => void
  onSignature: (memberId: string, targetId?: string) => void
  onAttackMove: () => void
  autoPausePrefs: AutoPausePrefs; onToggleAutoPausePref: (k: keyof AutoPausePrefs) => void
  speedCapped: boolean
  logBoxRef: React.RefObject<HTMLDivElement>; logPinnedRef: { current: boolean }
  retreat: () => void
}) {
  const { battle, running, selIds, aim } = props
  const battleOver = battle.status !== 'running'
  const selUnit = selIds.length === 1 ? battle.combatants.find(c => c.team === 'guild' && c.memberId === selIds[0] && c.alive) : undefined
  const order = (fn: (b: BattleState) => void) => { props.sfxCmd(); props.cmd(fn) }
  const auto = () => props.cmd(b => { b.commands.autoMode = !b.commands.autoMode; props.onAutoMode?.(b.commands.autoMode) }, true)
  const stance = () => {
    const all = Object.keys(STANCE_NAME) as Stance[]
    order(b => setStance(b, all[(all.indexOf(b.commands.stance) + 1) % all.length]))
  }
  // U42 的 A/1–5/QWE 等键位不重绑；新增键调用与按钮相同的命令。
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat || battleOver || (e.target as HTMLElement).matches('input,select,textarea')) return
      if (e.key === 'Escape' && aim) { e.preventDefault(); e.stopImmediatePropagation(); props.onAim(null); return }
      const k = e.key.toLowerCase()
      if (k === 't' && props.onAutoMode) auto()
      else if (k === 'g') stance()
      else if (k === 'r') props.retreat()
      else if (k === 'p') order(b => { b.commands.protectRetreat = !b.commands.protectRetreat })
      else return
      e.preventDefault(); e.stopPropagation()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  })
  const toggleAim = (a: Aim) => props.onAim(aim?.memberId === a.memberId && aim?.kind === a.kind && aim.skillId === a.skillId ? null : a)
  const targetDef = aim?.kind === 'skill' ? battle.combatants.find(c => c.memberId === aim.memberId)?.skills.find(r => r.def.id === aim.skillId)?.def : undefined
  const targeting = aim?.kind === 'sig' ? Object.values(SIGNATURE_SKILLS).find(s => s.id === aim.skillId)?.targeting : targetDef?.target
  return <>
    <aside className="battle-route hud-surface" aria-label="战况与节奏">
      <h2>{props.title}</h2>{props.route}
      <div className="battle-tempo">
        <button onClick={() => props.setRunning(r => !r)} disabled={battleOver} aria-keyshortcuts="Space" className="pause-button">{running ? '暂停' : '继续'} <kbd>空格</kbd></button>
        <span className="speed-pick" role="group" aria-label="实时推进速度">
          {([1, 2, 3] as const).map(s => <Tooltip key={s} content={'实时推进速度 ' + s + '× · [ 降速 / ] 加速' + (s === 3 && props.speedCapped ? ' · 首领战上限 2×' : '')}><button className={'speed-opt' + (props.battleSpeed === s ? ' active' : '')} aria-pressed={props.battleSpeed === s} disabled={battleOver || (s === 3 && props.speedCapped)} onClick={() => { props.setBattleSpeed(s); try { localStorage.setItem('gg-speed', String(s)) } catch { /* 会话回落 */ } }}>{s}×</button></Tooltip>)}
        </span>
      </div>
      <details className="auto-pause-menu"><summary>自动暂停 · {Object.values(props.autoPausePrefs).filter(Boolean).length} 项开启</summary>
        <div>{(Object.keys(props.autoPausePrefs) as (keyof AutoPausePrefs)[]).map(k => <button key={k} className={props.autoPausePrefs[k] ? 'active' : ''} aria-pressed={props.autoPausePrefs[k]} onClick={() => props.onToggleAutoPausePref(k)}>{AUTOPAUSE_LABELS[k]}</button>)}</div>
      </details>
    </aside>
    <section className="battle-journal" aria-label="战报">
      <header><strong>战报</strong><span>{(battle.tick / 10).toFixed(1)} 秒</span></header>
      <div className="log-box" ref={props.logBoxRef} onScroll={e => { const box = e.currentTarget; props.logPinnedRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < 40 }}>
        {battle.log.map((entry, i) => <div key={i} className={'log-' + entry.kind}><span className="log-tick">{(entry.tick / 10).toFixed(1)}s </span>{entry.text}</div>)}
      </div>
    </section>
    <section className="battle-dock hud-surface" aria-label="战斗指令">
      <div className="selected-orders">
        <strong>{selUnit?.name ?? (selIds.length ? '已选 ' + selIds.length + ' 人' : '选择队员下令')}</strong>
        <div className="unit-orders">
          <button disabled={!selIds.length || battleOver} onClick={props.onAttackMove}>攻击移动 <kbd>A</kbd></button>
          <button disabled={!selIds.length || battleOver} onClick={() => order(b => selIds.forEach(id => stopUnit(b, id)))}>停止 <kbd>S</kbd></button>
          <button disabled={!selIds.length || battleOver} onClick={() => order(b => selIds.forEach(id => { const c = b.combatants.find(u => u.memberId === id); if (c) setHoldGround(b, id, !c.holdGround) }))}>坚守 <kbd>H</kbd></button>
        </div>
        <div className="skill-strip" role="group" aria-label="技能面板">
          {selUnit?.skills.map((r, i) => {
            const autoOn = !selUnit.autoCastOff?.includes(r.def.id)
            const aimed = aim?.kind === 'skill' && aim.memberId === selUnit.memberId && aim.skillId === r.def.id
            return <Tooltip key={r.def.id} content={<>{skillLine(r.def, r.def.weaponFamily)}<small>自动施法：{autoOn ? '开' : '关'} · 右键切换</small></>}><button className={'skill-button' + (aimed ? ' active' : '') + (autoOn ? ' auto-on' : '')} data-auto={autoOn} disabled={r.cooldownLeft > 0 || battleOver} onClick={() => {
              if (r.def.target === 'ally' || r.def.target === 'enemy') toggleAim({ kind: 'skill', memberId: selUnit.memberId!, skillId: r.def.id })
              else { order(b => { castSkillManually(b, selUnit.memberId!, r.def.id) }); props.onAim(null) }
            }} onContextMenu={e => { e.preventDefault(); props.onToggleAutoCast(selUnit.memberId!, r.def.id) }}>
              <kbd>{'QWE'[i]}</kbd>{r.def.name}<small>{r.cooldownLeft > 0 ? Math.ceil(r.cooldownLeft / 10) + 's' : autoOn ? '自动' : '手动'}</small>
            </button></Tooltip>
          })}
          {!selUnit && <span className="hint">点击头像或框选 · 右键下令</span>}
          {selUnit && !selUnit.skills.length && <span className="hint">普攻型 · 招牌技在下方</span>}
        </div>
      </div>
      {aim && <div className="aim-prompt" role="status"><strong>{aim.kind === 'sig' ? '招牌技' : targetDef?.name}：选择目标</strong><span>点战场目标或左上队友头像</span><button onClick={() => props.onAim(null)}>取消 <kbd>Esc</kbd></button>
        <span className="aim-targets">{battle.combatants.filter(c => c.alive && c.team === (targeting === 'ally' ? 'guild' : 'enemy')).map(c => <button key={c.id} onClick={() => { if (aim.kind === 'sig') props.onSignature(aim.memberId, targeting === 'ally' ? c.memberId : c.id); else order(b => { castSkillManually(b, aim.memberId, aim.skillId, c.id) }); props.onAim(null) }}>{c.name}</button>)}</span>
      </div>}
      <div className="action-row">
        <div className="command-pair">
          {props.onAutoMode && <button className={battle.commands.autoMode ? 'active' : ''} aria-pressed={battle.commands.autoMode} onClick={auto}>挂机 <kbd>T</kbd></button>}
          <button disabled={!battle.commands.focusId} onClick={() => order(b => setFocus(b, undefined))}>取消集火</button>
          <Tooltip content="鼠标停在敌人身上按 F 集火；左键敌人也可集火。"><span tabIndex={0} className="focus-help">集火 <kbd>F</kbd></span></Tooltip>
        </div>
        <SignatureBar battle={battle} members={props.members} casterId={props.intents?.casterId} focusId={battle.commands.focusId} selectedId={selUnit?.memberId} aim={aim} onAim={toggleAim} onUse={props.onSignature} />
        <div className="potion-slots">
          {(['heal', 'fury'] as const).map(kind => { const cd = battle.commands[kind === 'heal' ? 'healCd' : 'furyCd'], stock = battle.commands[kind === 'heal' ? 'healStock' : 'furyStock']; return <Tooltip key={kind} content={kind === 'heal' ? '治疗药 · 恢复全队生命 · Z' : '爆发药 · 提升队伍输出 · X'}><button className={'action-slot potion-' + kind} disabled={battleOver || stock <= 0 || cd > 0} onClick={() => order(kind === 'heal' ? useHealPotion : useFuryPotion)}><kbd>{kind === 'heal' ? 'Z' : 'X'}</kbd><span className="potion-drawing" aria-hidden="true"/><strong>{cd ? Math.ceil(cd / 10) + 's' : stock}</strong><span>{kind === 'heal' ? '治疗药' : '爆发药'}</span></button></Tooltip>})}
        </div>
        <div className="command-pair">
          <button className={props.intents?.telegraphing ? 'urgent' : ''} onClick={stance}>阵型：{STANCE_NAME[battle.commands.stance]} <kbd>G</kbd></button>
          <button aria-pressed={battle.commands.protectRetreat} onClick={() => order(b => { b.commands.protectRetreat = !b.commands.protectRetreat })}>保护撤退{battle.commands.protectRetreat ? '开' : '关'} <kbd>P</kbd></button>
          <button className="retreat-button" disabled={battle.commands.extractingUntil !== undefined || battleOver} onClick={props.retreat}>{battle.commands.extractingUntil !== undefined ? '撤离中…' + Math.max(0, Math.ceil((battle.commands.extractingUntil - battle.tick) / 10)) + 's' : '撤退令'} <kbd>R</kbd></button>
        </div>
      </div>
      <div className="battle-key-guide">1–5 选人／编队 · Ctrl+1–5 保存编队 · Tab 下一位 · Shift 加选 · 右键技能切换自动施法</div>
    </section>
  </>
}
