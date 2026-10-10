import { Tooltip } from '../Tooltip'
import { useEffect } from 'react'
import type { BattleState, Stance, Member } from '../../sim/types'
import { STANCE_NAME, setStance, setFocus, useHealPotion, useFuryPotion, castSkillManually } from '../../sim/combat'
import { AUTOPAUSE_LABELS } from '../battle/autopause'
import type { DungeonRun } from '../../sim/run'

// R5.2c(U33⑦):战场区(指挥台/节奏条/招牌技栏/战报/日志)自 App.tsx 迁出——行为零变,处理器留 App。
export function BattleScreen(props: {
  run: DungeonRun
  battle: BattleState
  inBattle: boolean
  inTowerBattle: boolean
  battleOver: boolean
  running: boolean
  battleSpeed: 1 | 2 | 3
  intents: { telegraphing: boolean; casting: boolean; casterId?: string } | null
  hintsSeen: string[]
  lastSummary: import('../../sim/battle-summary').BattleSummary | null
  encName: (run: DungeonRun, id: string) => string
  cmd: (fn: (b: BattleState) => void, force?: boolean) => void
  autoLoopSet: (v: boolean) => void
  runAutoSet: (v: boolean) => void
  sfxCmd: () => void
  setRunning: (v: boolean | ((v: boolean) => boolean)) => void
  stepTen: () => void
  finishBattle: () => void
  setBattleSpeed: (v: 1 | 2 | 3) => void
  dismissHint: (id: string) => void
  onSignatureUse: () => void
  useSignatureCmd: (battle: BattleState, memberId: string, targetId?: string) => void
  /** #7.1(U39)RTS 式点选施法:花名册(选人/选目标用名字与血量) */
  members: Member[]
  onManualCast: (b: BattleState, memberId: string, skillId: string, targetId?: string) => void
  /** U41 操作层:选中我方角色集(框选/单选/小队条共用;RTS 多选) */
  selIds: string[]
  onSelectAlly: (id: string | null) => void
  /** U42 #9.2 自动施法开关:右键技能图标切换(成员偏好持久化+战斗投影同步) */
  onToggleAutoCast: (memberId: string, skillId: string) => void
  /** U42 #9.4:画面瞄准施法态(Q/W/E 触发,点画面单位施放)+开关 */
  aim: { kind: 'skill' | 'sig'; memberId: string; skillId: string } | null
  onAim: (a: { kind: 'skill' | 'sig'; memberId: string; skillId: string } | null) => void
  /** U42 #9.4:自动暂停偏好与开关(战斗右上角逐项开关) */
  autoPausePrefs: import('../../ui/battle/autopause').AutoPausePrefs
  onToggleAutoPausePref: (k: keyof import('../../ui/battle/autopause').AutoPausePrefs) => void
  /** U42 #9.5:首领战倍速上限 2×(3 倍按钮置灰) */
  speedCapped: boolean
  logBoxRef: React.RefObject<HTMLDivElement>
  logPinnedRef: { current: boolean }
  retreat: () => void
}) {
  const { run, battle, battleOver, running, battleSpeed, intents, lastSummary } = props
  // #7.1(U39)RTS 式点选施法:点我方角色→技能面板→点目标施放。状态是纯 UI 选择,施放走 cmd(经挂机守卫)。
  const { selIds, onSelectAlly } = props
  const selId = selIds.length === 1 ? selIds[0]! : null // 技能面板仅单选时显示(RTS 惯例)
  const aim = props.aim // U42 #9.4:瞄准态提升到 App(键盘 Q/W/E 与画面点选共用)
  const selUnit = battle.combatants.find((c) => c.team === 'guild' && c.memberId === selId && c.alive)
  const nameOf = (id: string) => props.members.find((m) => m.id === id)?.name ?? id
  // U42 #9.3:Esc 两段式——瞄准态先取消瞄准(捕获层拦截,不再传给 App 的清选择)
  useEffect(() => {
    if (!aim) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); props.onAim(null) }
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aim])
  if (!battle) return null
  const onAimToggle = (a: { kind: 'skill' | 'sig'; memberId: string; skillId: string }) => {
    props.onAim(aim?.kind === a.kind && aim?.skillId === a.skillId ? null : a)
  }
  return (
    <>
      <h2>
        {props.encName(run, run.battle?.encounterId ?? '')}（第 {run.battlesFought} 场）
      </h2>
      {/* ===== 团长指挥台(Q27)===== */}
      {battle.status === 'running' && (
        <div className="cmd-bar">
          <button
            className={battle.commands.autoMode ? 'active' : ''}
            onClick={() =>
              props.cmd(
                (b) => {
                  b.commands.autoMode = !b.commands.autoMode
                  props.autoLoopSet(b.commands.autoMode)
                  props.runAutoSet(b.commands.autoMode)
                },
                true,
              )
            }
          >
            🤖 挂机{battle.commands.autoMode ? '中（队长代打）' : ''}
          </button>
          <span className="cmd-label">│</span>
          <span className="cmd-label">阵型</span>
          {(Object.keys(STANCE_NAME) as Stance[]).map((s) => (
            <button
              key={s}
              className={
                (battle.commands.stance === s ? 'active' : '') +
                (intents?.telegraphing && s === 'spread' ? ' urgent' : '')
              }
              onClick={() => {
                props.sfxCmd()
                props.cmd((b) => setStance(b, s))
              }}
            >
              {STANCE_NAME[s]}
            </button>
          ))}
          <span className="cmd-label">│</span>
          <button
            onClick={() => {
              props.sfxCmd()
              props.cmd(useHealPotion)
            }}
            disabled={
              battle.commands.healStock <= 0 ||
              battle.commands.healCd > 0
            }
          >
            💊 治疗药×{battle.commands.healStock}
            <span className="cmd-label">(Z)</span>
            {battle.commands.healCd > 0 ? `（${Math.ceil(battle.commands.healCd / 10)}s）` : ''}
          </button>
          <button
            onClick={() => {
              props.sfxCmd()
              props.cmd(useFuryPotion)
            }}
            disabled={
              battle.commands.furyStock <= 0 ||
              battle.commands.furyCd > 0
            }
          >
            ⚡ 爆发药×{battle.commands.furyStock}
            <span className="cmd-label">(X)</span>
            {battle.commands.furyCd > 0 ? `（${Math.ceil(battle.commands.furyCd / 10)}s）` : ''}
          </button>
          <span className="cmd-label">│</span>
          <button
            className={battle.commands.protectRetreat ? 'active' : ''}
            onClick={() =>
              props.cmd((b) => {
                b.commands.protectRetreat = !b.commands.protectRetreat
              })
            }
          >
            🛡 保护{battle.commands.protectRetreat ? '开' : '关'}
          </button>
          {intents?.casting && intents.casterId && (
            <button
              className="urgent"
              onClick={() => {
                if (!intents?.casterId) return
                props.sfxCmd()
                props.cmd((b) => setFocus(b, intents.casterId))
              }}
            >
              ⚔ 打断咏唱！
            </button>
          )}
          {battle.commands.focusId && (
            <button
              className="focus-tag"
              onClick={() => props.cmd((b) => setFocus(b, undefined))}
            >
              ✕ 取消集火
            </button>
          )}
          {battle.commands.extractingUntil !== undefined ? (
            <button disabled>
              🏳 撤离中…{Math.max(0, Math.ceil((battle.commands.extractingUntil - battle.tick) / 10))}s
            </button>
          ) : (
            <button
              onClick={() => {
                props.sfxCmd()
                props.retreat()
              }}
            >
              🏳 撤退令
            </button>
          )}
        </div>
      )}
      {/* ===== U42 #9.2 点选角色/技能面板:挂机中同样可点(指令经接管窗口生效,不再被拦截) ===== */}
      {battle.status === 'running' && (
        <div className="squad-strip" role="group" aria-label="点选角色">
          {battle.combatants.filter((c) => c.team === 'guild' && c.alive).map((c) => (
            <button
              key={c.id}
              className={selIds.includes(c.memberId ?? '') ? 'active' : ''}
              onClick={() => { const mid = c.memberId ?? null; onSelectAlly(selIds.includes(mid ?? "") ? null : mid); props.onAim(null) }}
            >
              {nameOf(c.memberId ?? '')} {Math.round((c.hp / c.maxHp) * 100)}%
            </button>
          ))}
          <span className="cmd-label">← 点选角色下指令(挂机中=接管 3 秒)</span>
        </div>
      )}
      {battle.status === 'running' && selUnit && (
        <div className="skill-strip" role="group" aria-label="技能面板">
          <span className="cmd-label">{nameOf(selUnit.memberId ?? '')}的技能:</span>
          {selUnit.skills.map((r, i) => {
            const autoOn = !selUnit.autoCastOff?.includes(r.def.id)
            const aimed = aim?.kind === 'skill' && aim.skillId === r.def.id
            return (
              <Tooltip key={r.def.id} content={<><strong>{r.def.name}</strong>{r.def.effect}<small>自动施法：{autoOn ? '开' : '关'} · 右键切换 · 快捷键 {'QWE'[i] ?? '无'}{r.cooldownLeft > 0 ? ` · 冷却 ${Math.ceil(r.cooldownLeft / 10)} 秒` : ''}</small></>}><button
                className={aimed ? 'active' : ''}
                disabled={r.cooldownLeft > 0}
                style={autoOn ? { outline: '1px solid var(--edge-gold-hi)' } : { opacity: 0.45 }}
                onClick={() => onAimToggle({ kind: 'skill', memberId: selUnit.memberId!, skillId: r.def.id })}
                onContextMenu={(e) => { e.preventDefault(); props.onToggleAutoCast(selUnit.memberId!, r.def.id) }}
              >
                ⚡ {r.def.name}{'QWE'[i] ?? ''}{r.cooldownLeft > 0 ? `(${Math.ceil(r.cooldownLeft / 10)}s)` : ''}
              </button></Tooltip>
            )
          })}
          {selUnit.skills.length === 0 && <span className="hint">该角色没有主动技能(普攻型)——招牌技走下方招牌栏</span>}
          {aim && aim.kind === 'sig' && <span className="cmd-label">招牌技瞄准中:点画面上的目标施放,右键/Esc 取消</span>}
          {aim && aim.kind === 'skill' && (() => {
            const def = selUnit.skills.find((r) => r.def.id === aim.skillId)!.def
            const allySkill = def.target === 'ally'
            const targets = battle.combatants.filter((c) => c.alive && (allySkill ? c.team === 'guild' : c.team === 'enemy'))
            return (
              <span className="cmd-label">
                {' '}选目标:
                {def.target !== 'ally' && def.target !== 'enemy' ? (
                  <button onClick={() => { props.cmd((b) => { castSkillManually(b, selUnit.memberId!, aim.skillId) }); props.onAim(null); props.sfxCmd() }}>释放(无指定目标)</button>
                ) : targets.map((t) => (
                  <button key={t.id} onClick={() => { props.cmd((b) => { castSkillManually(b, selUnit.memberId!, aim.skillId, t.id) }); props.onAim(null); props.sfxCmd() }}>
                    {allySkill ? nameOf(t.memberId ?? '') : t.name}
                  </button>
                ))}
              </span>
            )
          })()}
        </div>
      )}
      <div className="enc-row">
        <button onClick={() => props.setRunning((r) => !r)} disabled={battleOver}>
          {running ? '⏸ 暂停(空格)' : '⏵ 继续(空格)'}
        </button>
        <button onClick={props.stepTen} disabled={battleOver || running}>
          ⏩ ×10 tick
        </button>
        <button onClick={props.finishBattle} disabled={battleOver || running}>
          ⏭ 跑到结束
        </button>
        <span className="speed-pick" role="group" aria-label="实时推进速度">
          {([1, 2, 3] as const).map((s, i) => (
            <Tooltip key={s} content={`实时推进速度 ${s}×${s === 3 && props.speedCapped ? ' · 首领战上限 2×，预警需要反应时间' : ''}${i < 2 ? ` · 快捷键 ${'[]'[i]}` : ''}`}><button
              className={`speed-opt${battleSpeed === s ? ' active' : ''}`}
              disabled={battleOver || (s === 3 && props.speedCapped)}
              onClick={() => { props.setBattleSpeed(s); try { localStorage.setItem('gg-speed', String(s)) } catch { /* 会话级回落 */ } }}
            >
              {s}×
            </button></Tooltip>
          ))}
        </span>
        {battleSpeed !== 1 && <span className="speed-live" role="status">⏩ {battleSpeed}× 加速中</span>}
        <span className="tick-info">tick {battle.tick ?? 0}</span>
        {/* U42 #9.4:自动暂停(博德之门 1/2 式)——战斗右上角逐项开关;偏好存 gg-autopause */}
        <span className="cmd-label" style={{ marginLeft: 'auto' }}>自动暂停:</span>
        {(Object.keys(props.autoPausePrefs) as (keyof typeof props.autoPausePrefs)[]).map((k) => (
          <button
            key={k}
            className={props.autoPausePrefs[k] ? 'active' : ''}
            title="开关该自动暂停触发条件(偏好保存在本机)"
            onClick={() => props.onToggleAutoPausePref(k)}
          >
            {AUTOPAUSE_LABELS[k]}
          </button>
        ))}
      </div>
      {battle && !battleOver && (
        <p className="hint">
          点击场上敌人集火 · 根据顶部机制提示应对读条 · 紫条可打断，红条须应对 · 留意队员生命与撤退时机
        </p>
      )}
      {battleOver && (
        <div
          className={`result-banner ${
            battle.status === 'guild-win'
              ? 'win'
              : battle.status === 'retreated'
                ? 'win'
                : 'wipe'
          }`}
        >
          {battle.status === 'guild-win'
            ? '★ 战斗胜利'
            : battle.status === 'retreated'
              ? '🏳 已撤离'
              : '✝ 队伍全灭'}
        </div>
      )}
      {battleOver && lastSummary && (
        <div className="battle-summary">
          {lastSummary.deaths.length > 0 && (
            <div className="bs-row">
              <span className="bs-label">阵亡</span>
              <span className="bs-text">
                {lastSummary.deaths.map((d) =>
                  d.name + '(' + d.cause + (d.killerName ? ' · 出手者 ' + d.killerName : '') + ')',
                ).join(';')}
              </span>
            </div>
          )}
          {lastSummary.wiped && lastSummary.topDamage.length > 0 && (
            <div className="bs-row">
              <span className="bs-label">败因</span>
              <span className="bs-text">
                {lastSummary.topDamage.map((t) => t.name + ' 输出 ' + t.amount).join(' · ')}
              </span>
            </div>
          )}
          {lastSummary.moments.length > 0 && (
            <div className="bs-row">
              <span className="bs-label">关键时刻</span>
              <span className="bs-text">{lastSummary.moments.join(' · ')}</span>
            </div>
          )}
        </div>
      )}
      {battle && (
        <div
          className="log-box"
          ref={props.logBoxRef}
          onScroll={(e) => {
            const box = e.currentTarget
            props.logPinnedRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < 40
          }}
        >
          {battle.log.map((entry, i) => (
            <div key={i} className={`log-${entry.kind}`}>
              <span className="log-tick">[{entry.tick}]</span>
              {entry.text}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
