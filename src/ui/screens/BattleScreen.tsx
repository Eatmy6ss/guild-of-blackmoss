import type { BattleState, Stance } from '../../sim/types'
import { STANCE_NAME, setStance, setFocus, useHealPotion, useFuryPotion } from '../../sim/combat'
import { BattleHints } from '../battle/BattleHints'
import { BATTLE_HINTS } from '../../data/tutorial'
import { SignatureBar } from '../battle/SignatureBar'
import { SIGNATURE_SKILLS } from '../../data/signature'
import { nextBattleSpeed } from '../battle/speed'
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
  logBoxRef: React.RefObject<HTMLDivElement>
  logPinnedRef: { current: boolean }
  retreat: () => void
}) {
  const { run, battle, inBattle, inTowerBattle, battleOver, running, battleSpeed, intents, hintsSeen, lastSummary } = props
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
        <button
          className="speed-btn"
          disabled={battleOver}
          title="实时推进速度"
          onClick={() => { const next = nextBattleSpeed(battleSpeed); props.setBattleSpeed(next); try { localStorage.setItem('gg-speed', String(next)) } catch { /* 会话级回落 */ } }}
        >
          ⏩ {battleSpeed}×
        </button>
        <span className="tick-info">tick {battle.tick ?? 0}</span>
      </div>
      {(inBattle || inTowerBattle) && battle.status === 'running' && !battleOver && (
        <BattleHints
          hints={BATTLE_HINTS.filter((h) => !hintsSeen.includes(h.id) && (h.applies?.({ hasSignature: battle.combatants.some((c) => c.team === 'guild' && c.alive && !!c.specId && SIGNATURE_SKILLS[c.specId]) }) ?? true)).map(({ id, text }) => ({ id, text }))}
          onDismiss={props.dismissHint}
        />
      )}
      {(inBattle || inTowerBattle) && battle.status === 'running' && (
        <SignatureBar
          battle={battle}
          casterId={intents?.casterId}
          focusId={battle.commands.focusId}
          onUse={(memberId, targetId) => { props.onSignatureUse(); props.useSignatureCmd(battle, memberId, targetId) }}
        />
      )}
      {battle && !battleOver && (
        <p className="hint">
          点击场上敌人 = 集火 · boss 蓄力出现红条倒计时 = 切「分散」减伤 · boss 出现紫条咏唱 = 点「打断咏唱！」 ·
          狂暴前 = 爆发药或撤退令 · 倒下即永久牺牲
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
