import { useState } from 'react'
import type { BattleState, Stance, Member } from '../../sim/types'
import { STANCE_NAME, setStance, setFocus, useHealPotion, useFuryPotion, castSkillManually } from '../../sim/combat'
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
  logBoxRef: React.RefObject<HTMLDivElement>
  logPinnedRef: { current: boolean }
  retreat: () => void
}) {
  const { run, battle, battleOver, running, battleSpeed, intents, lastSummary } = props
  // #7.1(U39)RTS 式点选施法:点我方角色→技能面板→点目标施放。状态是纯 UI 选择,施放走 cmd(经挂机守卫)。
  const { selIds, onSelectAlly } = props
  const selId = selIds.length === 1 ? selIds[0]! : null // 技能面板仅单选时显示(RTS 惯例)
  const [aimSkill, setAimSkill] = useState<string | null>(null)
  const selUnit = battle.combatants.find((c) => c.team === 'guild' && c.memberId === selId && c.alive)
  const nameOf = (id: string) => props.members.find((m) => m.id === id)?.name ?? id
  if (!battle) return null
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
              disabled={battle.commands.autoMode}
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
              battle.commands.autoMode ||
              battle.commands.healStock <= 0 ||
              battle.commands.healCd > 0
            }
          >
            💊 治疗药×{battle.commands.healStock}
            {battle.commands.healCd > 0 ? `（${Math.ceil(battle.commands.healCd / 10)}s）` : ''}
          </button>
          <button
            onClick={() => {
              props.sfxCmd()
              props.cmd(useFuryPotion)
            }}
            disabled={
              battle.commands.autoMode ||
              battle.commands.furyStock <= 0 ||
              battle.commands.furyCd > 0
            }
          >
            ⚡ 爆发药×{battle.commands.furyStock}
            {battle.commands.furyCd > 0 ? `（${Math.ceil(battle.commands.furyCd / 10)}s）` : ''}
          </button>
          <span className="cmd-label">│</span>
          <button
            className={battle.commands.protectRetreat ? 'active' : ''}
            disabled={battle.commands.autoMode}
            onClick={() =>
              props.cmd((b) => {
                b.commands.protectRetreat = !b.commands.protectRetreat
              })
            }
          >
            🛡 保护{battle.commands.protectRetreat ? '开' : '关'}
          </button>
          {intents?.casting && intents.casterId && !battle.commands.autoMode && (
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
              disabled={battle.commands.autoMode}
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
              disabled={battle.commands.autoMode}
            >
              🏳 撤退令
            </button>
          )}
        </div>
      )}
      {/* ===== #7.1(U39)RTS 式点选施法:点选我方角色→技能面板→点目标。挂机中禁用(挂机=队长代打) ===== */}
      {battle.status === 'running' && !battle.commands.autoMode && (
        <div className="squad-strip" role="group" aria-label="点选角色">
          {battle.combatants.filter((c) => c.team === 'guild' && c.alive).map((c) => (
            <button
              key={c.id}
              className={selIds.includes(c.memberId ?? '') ? 'active' : ''}
              onClick={() => { const mid = c.memberId ?? null; onSelectAlly(selIds.includes(mid ?? "") ? null : mid); setAimSkill(null) }}
            >
              {nameOf(c.memberId ?? '')} {Math.round((c.hp / c.maxHp) * 100)}%
            </button>
          ))}
          <span className="cmd-label">← 点选角色手动放技能</span>
        </div>
      )}
      {battle.status === 'running' && selUnit && !battle.commands.autoMode && (
        <div className="skill-strip" role="group" aria-label="技能面板">
          <span className="cmd-label">{nameOf(selUnit.memberId ?? '')}的技能:</span>
          {selUnit.skills.map((r) => (
            <button
              key={r.def.id}
              className={aimSkill === r.def.id ? 'active' : ''}
              disabled={r.cooldownLeft > 0}
              title={r.def.effect}
              onClick={() => setAimSkill(aimSkill === r.def.id ? null : r.def.id)}
            >
              ⚡ {r.def.name}{r.cooldownLeft > 0 ? `(${Math.ceil(r.cooldownLeft / 10)}s)` : ''}
            </button>
          ))}
          {selUnit.skills.length === 0 && <span className="hint">该角色没有主动技能(普攻型)——招牌技走下方招牌栏</span>}
          {aimSkill && (() => {
            const def = selUnit.skills.find((r) => r.def.id === aimSkill)!.def
            const allySkill = def.target === 'ally'
            const targets = battle.combatants.filter((c) => c.alive && (allySkill ? c.team === 'guild' : c.team === 'enemy'))
            return (
              <span className="cmd-label">
                {' '}选目标:
                {def.target !== 'ally' && def.target !== 'enemy' ? (
                  <button onClick={() => { props.cmd((b) => { castSkillManually(b, selUnit.memberId!, aimSkill) }); setAimSkill(null); props.sfxCmd() }}>释放(无指定目标)</button>
                ) : targets.map((t) => (
                  <button key={t.id} onClick={() => { props.cmd((b) => { castSkillManually(b, selUnit.memberId!, aimSkill, t.id) }); setAimSkill(null); props.sfxCmd() }}>
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
          {running ? '⏸ 暂停' : '⏵ 继续'}
        </button>
        <button onClick={props.stepTen} disabled={battleOver || running}>
          ⏩ ×10 tick
        </button>
        <button onClick={props.finishBattle} disabled={battleOver || running}>
          ⏭ 跑到结束
        </button>
        <span className="speed-pick" role="group" aria-label="实时推进速度">
          {([1, 2, 3] as const).map((s) => (
            <button
              key={s}
              className={`speed-opt${battleSpeed === s ? ' active' : ''}`}
              disabled={battleOver}
              title={`实时推进速度 ${s}×(当前档位${s === 1 ? ',正常速度' : `,战斗加快 ${s} 倍`})`}
              onClick={() => { props.setBattleSpeed(s); try { localStorage.setItem('gg-speed', String(s)) } catch { /* 会话级回落 */ } }}
            >
              {s}×
            </button>
          ))}
        </span>
        {battleSpeed !== 1 && <span className="speed-live" role="status">⏩ {battleSpeed}× 加速中</span>}
        <span className="tick-info">tick {battle.tick ?? 0}</span>
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
