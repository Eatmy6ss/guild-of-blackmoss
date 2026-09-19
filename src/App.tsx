import { useEffect, useRef, useState } from 'react'
import type { BattleState, DeadHero, ItemInstance, JobId, Member, Slot, Stance } from './sim/types'
import { generateMember, maxHpOf, bondStars, xpNeeded, seedMemberSeq, reserveNames } from './sim/gen'
import {
  TICK_MS,
  stepBattle,
  setStance,
  setFocus,
  useHealPotion,
  useFuryPotion,
  orderRetreat,
  STANCE_NAME,
} from './sim/combat'
import {
  createRun,
  advanceRun,
  startStep,
  retreatRun,
  resetAfterRun,
  markPermadeath,
  settleGrowth,
  REST_HEAL_PCT,
  type DungeonRun,
} from './sim/run'
import { powerScore } from './sim/combat'

import { rollBossDrops, describeItem, slotsOf } from './sim/loot'
import { loadGuildSave, saveGuild, clearGuildSave } from './state/save'
import { BattleRenderer } from './ui/battle/BattleRenderer'
import { BLACKMOSS } from './data/dungeons'
import { ECONOMY } from './data/economy'
import { rollVisitor, bountyCandidate, taleCandidates, sellValue, cooldownNeeded } from './sim/tavern'
import { JOBS } from './data/jobs'

// M0 D11 开发架：公会层——永久死亡、纪念堂、撤退保护、招募三选一、战术手册。
// 花名册 = 全体成员（含亡者记录）；远征队 = 花名册前三名幸存者。

const START_JOBS = ['guard', 'priest', 'ranger'] as const
const ROLE_NAME: Record<string, string> = { tank: '坦克', healer: '治疗', dps: '输出' }
const SLOT_NAME: Record<Slot, string> = { weapon: '武器', armor: '护甲', trinket: '饰品' }
const SLOTS: Slot[] = ['weapon', 'armor', 'trinket']
const SEED_BASE = 7777
const ROSTER_CAP = 6
const MEMORIAL_AURA = 0.02 // 每位英灵全队伤害 +2%
const MANUAL_BONUS = 0.05 // 已研习 boss 全队对其伤害 +5%

function newRoster(): Member[] {
  return START_JOBS.map((job) => generateMember(job, 5))
}

function attrsLine(m: Member): string {
  const a = m.attrs
  return `力${a.str} 敏${a.agi} 智${a.int}`
}

function personalityLine(m: Member): string {
  const p = m.personality
  return `勇猛${p.bravery} 谨慎${p.caution} 贪婪${p.greed} 忠诚${p.loyalty}`
}

function natureLine(m: Member): string {
  const n = m.nature
  const best = (['str', 'agi', 'int'] as const).reduce((a, b) => (n.caps[a] >= n.caps[b] ? a : b))
  return `天性上限：${best === 'str' ? '力' : best === 'agi' ? '敏' : '智'}${n.caps[best]}`
}

function encName(run: DungeonRun, stepId: string): string {
  return run.dungeon.encounters.find((e) => e.id === stepId)?.name ?? stepId
}

export default function App() {
  // D14 会话级存档：公会资产跨刷新保留；远征中不落盘（远征视为放弃）
  const [saved] = useState(loadGuildSave)
  const [members, setMembers] = useState<Member[]>(() => saved?.members ?? newRoster())
  const membersRef = useRef(members)
  useEffect(() => {
    membersRef.current = members
  }, [members])

  const [inventory, setInventory] = useState<ItemInstance[]>(() => saved?.inventory ?? [])
  const [lastDrops, setLastDrops] = useState<ItemInstance[]>([])
  const [memorial, setMemorial] = useState<DeadHero[]>(() => saved?.memorial ?? [])
  const [manual, setManual] = useState<string[]>(() => saved?.manual ?? [])
  const [protectOn, setProtectOn] = useState(() => saved?.protectOn ?? true)
  const [candidates, setCandidates] = useState<Member[]>([])
  const [gold, setGold] = useState(() => saved?.gold ?? 150)
  const [blessing, setBlessing] = useState(() => saved?.blessing ?? 0)
  const [recruitCooldown, setRecruitCooldown] = useState(() => saved?.recruitCooldown ?? 0)
  const [visitor, setVisitor] = useState<ReturnType<typeof rollVisitor> | null>(null)

  // 读档登记已用名字：新招募不与存档英雄/英灵重名
  useEffect(() => {
    if (saved) {
      seedMemberSeq(saved.members) // 防新招募与存档成员撞 ID(血量写回会串位)
      reserveNames([...saved.members.map((m) => m.name), ...saved.memorial.map((h) => h.name)])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runRef = useRef<DungeonRun | null>(null)
  const [run, setRun] = useState<DungeonRun | null>(null)
  const [battle, setBattle] = useState<BattleState | null>(null)
  const [running, setRunning] = useState(false)
  const seedRef = useRef((Date.now() % 100000) + 1) // 每次会话不同种子（读档后不复刻上局随机序列）
  const logBoxRef = useRef<HTMLDivElement | null>(null)
  const logPinnedRef = useRef(true) // 战报钉底：用户上滚阅读即放手，滚回底部自动恢复跟随
  const growthSnapshotRef = useRef<Map<string, { level: number; power: number; bondTotal: number }>>(new Map())
  const eventCursorRef = useRef(0)
  const lastBattleRef = useRef<BattleState | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<BattleRenderer | null>(null)

  useEffect(() => {
    const renderer = new BattleRenderer()
    rendererRef.current = renderer
    renderer.mount(stageRef.current!).catch(() => {})
    // 指挥台：点击场上敌人 = 集火
    renderer.onUnitClick = (c) => {
      if (c.team !== 'enemy' || !c.alive) return
      const b = runRef.current?.battle
      if (!b || b.status !== 'running') return
      setFocus(b, c.id)
      drainAndSync(b)
    }
    // 开发架调试钩子：透视 Pixi 舞台用
    ;(window as unknown as Record<string, unknown>).__br = renderer
    return () => renderer.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const drainAndSync = (state: BattleState) => {
    if (state !== lastBattleRef.current) {
      lastBattleRef.current = state
      eventCursorRef.current = 0
      try {
        rendererRef.current?.setBattle(state, [])
      } catch (e) {
        // 渲染层异常不得拖死 React 提交：界面至少保持可玩、错误进控制台（D14 卡死修复）
        console.error('渲染同步失败', e)
      }
    }
    const fresh = state.events.slice(eventCursorRef.current)
    eventCursorRef.current = state.events.length
    try {
      rendererRef.current?.setBattle(state, fresh)
    } catch (e) {
      console.error('渲染同步失败', e)
    }
    setBattle({ ...state })
  }

  const syncAll = () => {
    const r = runRef.current
    setRun(r ? { ...r } : null)
    if (r?.battle) drainAndSync(r.battle)
    else setBattle(null)
  }

  // 公会阶段自动落盘;远征进行中(战斗/休整)跳过。
  // 结算页(victory/defeat/retreated)是安全边界:成长必须在结算时落盘,
  // 否则玩家在结算页关页会丢掉这把的成长(save-systems:安全边界自动存档)。
  useEffect(() => {
    if (run && run.phase !== 'victory' && run.phase !== 'defeat' && run.phase !== 'retreated') return
    saveGuild({ members, inventory, memorial, manual, protectOn, gold, blessing, recruitCooldown })
  }, [members, inventory, memorial, manual, protectOn, gold, blessing, recruitCooldown, run])

  // 战报钉底：新战报到达时跟随滚动；用户上滚阅读时暂不抢滚动条，滚回底部自动恢复
  useEffect(() => {
    const box = logBoxRef.current
    if (!box || !logPinnedRef.current) return
    box.scrollTop = box.scrollHeight
  }, [battle?.log.length])

  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      const r = runRef.current
      const b = r?.battle
      if (!r || !b || r.phase !== 'battle' || b.status !== 'running') return
      // 渲染停摆（遮挡/最小化 → rAF 停）则暂停模拟：没有画面，跑模拟只会堆积冻结动画
      if (performance.now() - (rendererRef.current?.lastTickAt ?? 0) > 800) return
      stepBattle(b)
      // 终局结算先于界面同步：同步若抛错，结算（血量写回/永久死亡/掉落）不能被跳过
      if (b.status !== 'running') {
        setRunning(false)
        settleBattleEnd(r)
        syncAll()
        return
      }
      drainAndSync(b)
    }, TICK_MS)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  // 战斗终态兜底（D13 修复软锁）：×10 步进/暂停步进跳过实时循环时，
  // 终局结算（血量写回/永久死亡/掉落）依然必须发生。幂等由 settleBattleEnd 的
  // phase 守卫保证，实时循环里的调用与此处只会生效一次。
  useEffect(() => {
    const r = runRef.current
    const b = r?.battle
    if (!r || !b || r.phase !== 'battle') return
    if (b.status === 'running') return
    setRunning(false)
    settleBattleEnd(r)
    syncAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle?.status])

  // 远征队 = 花名册前三名幸存者（D11：亡者由招募补位）
  const expedition = members.filter((m) => m.alive).slice(0, 3)
  const expeditionRef = useRef(expedition)
  useEffect(() => {
    expeditionRef.current = expedition
  }, [members])

  // 战斗终局结算：boss 击杀 roll 掉落 + 手册研习 + 永久死亡登记 + 推进远征。
  // 幂等：phase === 'battle' 表示尚未结算（D13 修复——×10 步进跳过终态时不再软锁）。
  const settleBattleEnd = (r: DungeonRun) => {
    const b = r.battle
    if (!b || b.status === 'running') return
    if (r.phase !== 'battle') return
    const enc = r.dungeon.encounters.find((e) => e.id === r.steps[r.stepIdx])
    if (b.status === 'guild-win' && enc?.kind === 'boss' && enc.bossId) {
      const bossId = enc.bossId
      // D14 首杀保底：该 boss 尚未研习（首杀）时空手则必掉一件
      const pity = !manual.includes(bossId)
      const drops = rollBossDrops(r.dungeon.bosses[bossId].dropTable, ++seedRef.current * 31, { pity })
      if (drops.length > 0) {
        setInventory((inv) => [...inv, ...drops])
        setLastDrops((d) => [...d, ...drops])
      }
      setManual((m) => (m.includes(bossId) ? m : [...m, bossId]))
    }
    advanceRun(r)
    const dead = markPermadeath(r)
    if (dead.length > 0) setMemorial((m) => [...m, ...dead])
    // M1 P0 成长:经验 + 默契的发放下沉在 sim 层(可被 smoke 直接验证)
    settleGrowth(r)
    // M1 P0 经济:胜场金币 / 通关奖励 / 阵亡祝福 / 招募冷却递减
    if (b.status === 'guild-win') {
      setGold((g) => g + (enc?.kind === 'boss' ? ECONOMY.battleGold.boss : ECONOMY.battleGold.wave))
    }
    const endPhase = r.phase as DungeonRun['phase']
    if (endPhase === 'victory') setGold((g) => g + ECONOMY.clearBonus)
    if (dead.length > 0) setBlessing((b2) => b2 + dead.length * ECONOMY.blessingPerDeath)
    setRecruitCooldown((c) => Math.max(0, c - 1))
  }

  const equip = (m: Member, slot: Slot, itemId: string) => {
    const old = m.equipment[slot]
    if (old) setInventory((inv) => [...inv, old])
    if (itemId) {
      const item = inventory.find((i) => i.id === itemId)
      if (item) {
        setInventory((inv) => inv.filter((i) => i.id !== item.id))
        m.equipment[slot] = item
      }
    } else {
      delete m.equipment[slot]
    }
    setMembers([...membersRef.current])
  }

  const retreat = () => {
    const r = runRef.current
    if (!r) return
    // 战斗中：下撤退令（Q32 撤离过程）；休整中：直接回城
    if (r.phase === 'battle' && r.battle && r.battle.status === 'running') {
      if (orderRetreat(r.battle)) {
        syncAll()
      }
      return
    }
    if (r.phase === 'rest') {
      setRunning(false)
      retreatRun(r)
      syncAll()
    }
  }

  const cmd = (fn: (b: BattleState) => void, force = false) => {
    const b = runRef.current?.battle
    if (!b) return
    // 终局态也同步一次：×10 步进跳过终态后，UI 可能停在过期快照（D13 软锁修复）
    if (b.status === 'running') {
      if (b.commands.autoMode && !force) return // 挂机中：队长代打
      fn(b)
    }
    drainAndSync(b)
  }

  const startExpedition = (branchId: string) => {
    if (expedition.length < 3) return
    // M1 P0 成长快照:结算页要展示"这把你变强了什么"
    growthSnapshotRef.current = new Map(
      expedition.map((m) => [m.id, { level: m.level, power: powerScore(m), bondTotal: Object.values(m.bonds).reduce((s, n) => s + bondStars(n), 0) }]),
    )
    runRef.current = createRun(
      expedition,
      BLACKMOSS,
      branchId,
      ++seedRef.current * SEED_BASE,
      memorial.length * MEMORIAL_AURA,
      protectOn,
    )
    setLastDrops([])
    setRunning(true)
    syncAll()
  }

  const continueDeep = () => {
    const r = runRef.current
    if (!r || r.phase !== 'rest') return
    const enc = r.dungeon.encounters.find((e) => e.id === r.steps[r.stepIdx])
    const manualBonus = enc?.bossId && manual.includes(enc.bossId) ? MANUAL_BONUS : 0
    startStep(r, ++seedRef.current * SEED_BASE, manualBonus)
    setRunning(true)
    syncAll()
  }

  const backToGuild = () => {
    const r = runRef.current
    if (r) resetAfterRun(membersRef.current)
    runRef.current = null
    setRunning(false)
    setRun(null)
    setBattle(null)
    lastBattleRef.current = null
    rendererRef.current?.reset()
    setMembers([...membersRef.current])
    // M1 P0:回城 roll 上门事件(涌现叙事入口;缘分不排队,不受冷却)
    if (Math.random() < ECONOMY.visitorChance && membersRef.current.filter((m) => m.alive).length < ROSTER_CAP) {
      setVisitor(rollVisitor(Math.random, membersRef.current))
    }
  }

  const restartGuild = () => {
    // 破坏性操作加确认（D14：手滑清档太疼）
    if (!window.confirm('确定重开公会？所有英雄、装备与纪念堂记录将全部清空。')) return
    clearGuildSave()
    runRef.current = null
    setRunning(false)
    setRun(null)
    setBattle(null)
    lastBattleRef.current = null
    rendererRef.current?.reset()
    setInventory([])
    setLastDrops([])
    setMemorial([])
    setManual([])
    setCandidates([])
    setVisitor(null)
    setGold(150)
    setBlessing(0)
    setRecruitCooldown(0)
    setMembers(newRoster())
  }

  // ---- M1 P0 招募三路径(宪法红线 6:上门缘分不排队;悬赏/传闻受冷却;冷却防软锁减半)----
  const aliveCount = () => membersRef.current.filter((m) => m.alive).length

  const signVisitor = () => {
    if (!visitor || runRef.current || aliveCount() >= ROSTER_CAP) return
    setMembers((roster) => [...roster, visitor.member])
    setVisitor(null)
  }

  const hireBounty = (job: JobId) => {
    if (runRef.current || effectiveCooldown > 0 || gold < ECONOMY.bountyCost || aliveCount() >= ROSTER_CAP) return
    setGold((g) => g - ECONOMY.bountyCost)
    const m = bountyCandidate(Math.random, membersRef.current, job)
    setMembers((roster) => [...roster, m])
    setRecruitCooldown(cooldownNeeded(aliveCount()))
  }

  const rollTale = () => {
    if (runRef.current || effectiveCooldown > 0 || aliveCount() >= ROSTER_CAP) return
    if (gold < ECONOMY.taleCost.gold || blessing < ECONOMY.taleCost.blessing) return
    setGold((g) => g - ECONOMY.taleCost.gold)
    setBlessing((b) => b - ECONOMY.taleCost.blessing)
    setCandidates(taleCandidates(Math.random, membersRef.current))
    setRecruitCooldown(cooldownNeeded(aliveCount()))
  }

  const hire = (m: Member) => {
    setMembers((roster) => [...roster, m])
    setCandidates([])
  }

  const sellItem = (id: string) => {
    const item = inventory.find((i) => i.id === id)
    if (!item) return
    setGold((g) => g + sellValue(item))
    setInventory((inv) => inv.filter((i) => i.id !== id))
  }

  const stepTen = () => {
    const b = runRef.current?.battle
    if (!b || b.status !== 'running') return
    for (let i = 0; i < 10; i++) stepBattle(b)
    drainAndSync(b)
  }

  const finishBattle = () => {
    const r = runRef.current
    const b = r?.battle
    if (!r || !b) return
    setRunning(false)
    // 已终局（×10 步进越过后）：只补结算与同步，不再推 tick
    if (b.status !== 'running') {
      settleBattleEnd(r)
      syncAll()
      return
    }
    let guard = 0
    while (b.status === 'running' && guard++ < 20000) stepBattle(b)
    settleBattleEnd(r)
    syncAll()
  }

  // ---- 派生状态 ----
  // 紧急招募:人手不足时免冷却(防软锁)
  const effectiveCooldown = members.filter((m) => m.alive).length < 3 ? 0 : recruitCooldown
  const inBattle = run?.phase === 'battle' && battle != null
  const battleOver = inBattle && battle!.status !== 'running'
  const finished = run != null && (run.phase === 'victory' || run.phase === 'defeat' || run.phase === 'retreated')
  const canExpedition = !run && expedition.length >= 3

  const memberCard = (m: Member) => {
    const c = battle?.combatants.find((x) => x.memberId === m.id)
    const hp = c ? c.hp : m.hp
    const max = c ? c.maxHp : maxHpOf(m)
    const onExpedition = run != null && run.members.includes(m)
    return (
      <div key={m.id} className="member-card">
        <div className="mc-head">
          <span className="name">{m.name}</span>
          <span className="job">
            {JOBS[m.job].name} Lv{m.level} · {ROLE_NAME[JOBS[m.job].role]}
            {onExpedition ? ' · ⚔远征队' : ''}
          </span>
          <span className={`hp${c && !c.alive ? ' dead' : ''}`}>
            HP {hp}/{max}
            {c && !c.alive ? '（已倒下）' : ''}
          </span>
        </div>
        <div className="row">
          <span>{attrsLine(m)}</span>
          <span>{personalityLine(m)}</span>
          <span>战力 {powerScore(m)}</span>
          <span>经验 {m.exp}/{xpNeeded(m.level)}</span>
        </div>
        <div className="mc-slots">
          {SLOTS.map((slot) => {
            const equipped = m.equipment[slot]
            const options = [
              ...(equipped ? [equipped] : []),
              ...inventory.filter((i) => slotsOf(i) === slot),
            ]
            return (
              <select
                key={slot}
                className="slot-select"
                value={equipped?.id ?? ''}
                title={equipped ? describeItem(equipped) : `${SLOT_NAME[slot]}（空）`}
                onChange={(e) => equip(m, slot, e.target.value)}
              >
                <option value="">{SLOT_NAME[slot]}·空</option>
                {options.map((i) => (
                  <option key={i.id} value={i.id}>
                    {describeItem(i)}
                  </option>
                ))}
              </select>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="app-header">
        <h1>guild-game</h1>
        <span className="slice-tag">M0 · D14 验收版 —— 会话存档 · 首杀保底 · 技能曲线已锁定</span>
      </div>
      <div className="layout">
        <div className="panel">
          <h2>
            公会花名册（{members.filter((m) => m.alive).length} 人存活）
            {run ? ' · 远征中' : ''}
          </h2>
          {expedition.map(memberCard)}
          <div className="end-actions">
            <button onClick={restartGuild}>☠ 重开公会</button>
          </div>
          <div className="inv-panel tavern-panel">
            <h2>
              🍺 酒馆 —— 💰 {gold} · 🕯 祝福 {blessing} · 招募位 {members.filter((m) => m.alive).length}/{ROSTER_CAP}
            </h2>
            <p className="hint">
              {effectiveCooldown > 0
                ? `招募冷却：完成 ${effectiveCooldown} 次远征后解除（上门访客不受影响）`
                : members.filter((m) => m.alive).length < 3
                  ? '⚠ 人手不足：紧急招募免冷却'
                  : '可招募'}
            </p>
            {visitor ? (
              <div className="member-card candidate">
                <div className="mc-head">
                  <span className="name">🚪 {visitor.member.name}</span>
                  <span className="job">
                    {JOBS[visitor.member.job].name} Lv{visitor.member.level} · {ROLE_NAME[JOBS[visitor.member.job].role]}
                  </span>
                  <span className="hp">战力 {powerScore(visitor.member)}</span>
                </div>
                <div className="row">
                  <span>{attrsLine(visitor.member)}</span>
                  <span>{personalityLine(visitor.member)}</span>
                </div>
                <p className="hint">“{visitor.story}”</p>
                <button onClick={signVisitor} disabled={!!run || members.filter((m) => m.alive).length >= ROSTER_CAP}>
                  ✋ 免费签下（缘分不排队）
                </button>
              </div>
            ) : members.filter((m) => m.alive).length < 3 ? (
              <div>
                <p className="hint">🚪 暂时没有访客——但公会正缺人手,守夜人去酒馆后巷喊一嗓子总会有人应。</p>
                <button
                  disabled={!!run}
                  onClick={() => setVisitor(rollVisitor(Math.random, membersRef.current))}
                >
                  🌙 在酒馆等一晚(必定有人上门)
                </button>
              </div>
            ) : (
              <p className="hint">🚪 暂时没有访客——每次回城都有概率有人上门。</p>
            )}
            <div className="tavern-row">
              <span className="cmd-label">定向悬赏：</span>
              {START_JOBS.map((job) => (
                <button
                  key={job}
                  disabled={!!run || effectiveCooldown > 0 || gold < ECONOMY.bountyCost || members.filter((m) => m.alive).length >= ROSTER_CAP}
                  onClick={() => hireBounty(job)}
                >
                  {JOBS[job].name} {ECONOMY.bountyCost} 金
                </button>
              ))}
            </div>
            <div className="tavern-row">
              <button
                disabled={!!run || effectiveCooldown > 0 || gold < ECONOMY.taleCost.gold || blessing < ECONOMY.taleCost.blessing || members.filter((m) => m.alive).length >= ROSTER_CAP}
                onClick={rollTale}
              >
                🎲 酒馆传闻：{ECONOMY.taleCost.gold} 金 + {ECONOMY.taleCost.blessing} 祝福，三选一（品质更高）
              </button>
            </div>
            {candidates.length > 0 && (
              <div>
                <h2>来应征的冒险者（选一位入职）</h2>
                {candidates.map((m) => (
                  <div key={m.id} className="member-card candidate">
                    <div className="mc-head">
                      <span className="name">{m.name}</span>
                      <span className="job">
                        {JOBS[m.job].name} Lv{m.level} · {ROLE_NAME[JOBS[m.job].role]}
                      </span>
                      <span className="hp">战力 {powerScore(m)}</span>
                    </div>
                    <div className="row">
                      <span>{attrsLine(m)} · {natureLine(m)}</span>
                    </div>
                    <div className="row">
                      <span>{personalityLine(m)}</span>
                    </div>
                    <button onClick={() => hire(m)}>✋ 招募入职</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {candidates.length > 0 && (
            <div className="inv-panel">
              <h2>来应征的冒险者（选一位入职）</h2>
              {candidates.map((m) => (
                <div key={m.id} className="member-card candidate">
                  <div>
                    <span className="name">{m.name}</span>
                    <span className="job">
                      {JOBS[m.job].name} Lv{m.level} · {ROLE_NAME[JOBS[m.job].role]}
                    </span>
                  </div>
                  <div className="row">
                    <span>{attrsLine(m)} · {natureLine(m)}</span>
                  </div>
                  <div className="row">
                    <span>{personalityLine(m)}</span>
                  </div>
                  <button onClick={() => hire(m)}>✋ 招募入职</button>
                </div>
              ))}
            </div>
          )}
          <div className="inv-panel">
            <h2>公会仓库（{inventory.length}）</h2>
            {inventory.length === 0 ? (
              <p className="hint">击败 boss 掉落装备（首次击杀保底一件）。从成员卡的下拉框穿戴。</p>
            ) : (
              inventory.map((i) => (
                <div key={i.id} className="inv-item">
                  {describeItem(i)}
                  <button className="sell-btn" onClick={() => sellItem(i.id)}>
                    变卖 +{sellValue(i)} 金
                  </button>
                </div>
              ))
            )}
            {lastDrops.length > 0 && (
              <p className="hint" style={{ marginTop: 6 }}>
                本次远征共获得 {lastDrops.length} 件装备
              </p>
            )}
          </div>
          <div className="inv-panel">
            <h2>
              🕯 纪念堂（{memorial.length} 位英灵 · 全队伤害 +
              {Math.round(memorial.length * MEMORIAL_AURA * 100)}%）
            </h2>
            {memorial.length === 0 ? (
              <p className="hint">还没有人牺牲。愿它一直空着。</p>
            ) : (
              memorial.map((h) => (
                <div key={h.id} className="inv-item memorial-item">
                  ⚰ {h.name}（{JOBS[h.job].name} Lv{h.level}）——{h.cause}
                </div>
              ))
            )}
          </div>
          <div className="inv-panel">
            <h2>📖 战术手册（已研习 boss 伤害 +5%）</h2>
            <p className="hint">
              {manual.length === 0 ? '尚未研习任何 boss。' : `已研习：${manual.map((id) => BLACKMOSS.bosses[id]?.name ?? id).join('、')}`}
            </p>
            <button
              className={protectOn ? 'active' : ''}
              onClick={() => setProtectOn((p) => !p)}
            >
              🛡 撤退保护：{protectOn ? '开（濒危自动撤离）' : '关（搏命模式）'}
            </button>
          </div>
        </div>

        <div className="panel">
          {/* 舞台常驻：渲染器挂载一次，非战斗阶段隐藏（避免 ref 为 null 导致挂载失败） */}
          <div className="stage" ref={stageRef} style={{ display: inBattle ? undefined : 'none' }} />

          {!run && (
            <>
              <h2>出击（黑苔沼泽）</h2>
              <p style={{ color: '#7a8191', marginBottom: 10 }}>
                选择路线：险路战斗更多、收获机会更多；稳路少打一场杂兵。血量全程延续，
                <b style={{ color: '#d48f8f' }}>战斗死亡即永久牺牲</b>，团灭将失去整支远征队。
              </p>
              {BLACKMOSS.branches.map((br) => (
                <button
                  key={br.id}
                  className="branch-btn"
                  disabled={!canExpedition}
                  onClick={() => startExpedition(br.id)}
                >
                  ⚔ {br.name}（风险 {br.risk} / 收获 {br.reward}）—— {br.desc}
                </button>
              ))}
              {!canExpedition && (
                <p style={{ color: '#d48f8f' }}>
                  {expedition.length < 3
                    ? `人手不足（${expedition.length}/3）：去酒馆招募，或等待英灵庇佑。`
                    : ''}
                </p>
              )}
            </>
          )}

          {run && inBattle && (
            <>
              <h2>
                {encName(run, run.steps[run.stepIdx])}（第 {run.stepIdx + 1}/{run.steps.length} 场）
              </h2>
              {/* ===== 团长指挥台（Q27）===== */}
              {battle && battle.status === 'running' && (
                <div className="cmd-bar">
                  <button
                    className={battle.commands.autoMode ? 'active' : ''}
                    onClick={() =>
                      cmd(
                        (b) => {
                          b.commands.autoMode = !b.commands.autoMode
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
                      className={battle.commands.stance === s ? 'active' : ''}
                      disabled={battle.commands.autoMode}
                      onClick={() => cmd((b) => setStance(b, s))}
                    >
                      {STANCE_NAME[s]}
                    </button>
                  ))}
                  <span className="cmd-label">│</span>
                  <button
                    onClick={() => cmd(useHealPotion)}
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
                    onClick={() => cmd(useFuryPotion)}
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
                      cmd((b) => {
                        b.commands.protectRetreat = !b.commands.protectRetreat
                      })
                    }
                  >
                    🛡 保护{battle.commands.protectRetreat ? '开' : '关'}
                  </button>
                  {battle.commands.focusId && (
                    <button
                      className="focus-tag"
                      disabled={battle.commands.autoMode}
                      onClick={() => cmd((b) => setFocus(b, undefined))}
                    >
                      ✕ 取消集火
                    </button>
                  )}
                  {battle.commands.extractingUntil !== undefined ? (
                    <button disabled>
                      🏳 撤离中…{Math.max(0, Math.ceil((battle.commands.extractingUntil - battle.tick) / 10))}s
                    </button>
                  ) : (
                    <button onClick={() => retreat()} disabled={battle.commands.autoMode}>
                      🏳 撤退令
                    </button>
                  )}
                </div>
              )}
              <div className="enc-row">
                <button onClick={() => setRunning((r) => !r)} disabled={battleOver}>
                  {running ? '⏸ 暂停' : '⏵ 继续'}
                </button>
                <button onClick={stepTen} disabled={battleOver || running}>
                  ⏩ ×10 tick
                </button>
                <button onClick={finishBattle} disabled={battleOver || running}>
                  ⏭ 跑到结束
                </button>
                <span className="tick-info">tick {battle?.tick ?? 0}</span>
              </div>
              {battle && !battleOver && (
                <p className="hint">
                  点击场上敌人 = 集火 · boss 红圈蓄力 = 切「分散」 · 咏唱 = 集火打断 · 狂暴前 = 爆发药或撤退令 ·
                  倒下即永久牺牲
                </p>
              )}
              {battleOver && (
                <div
                  className={`result-banner ${
                    battle!.status === 'guild-win'
                      ? 'win'
                      : battle!.status === 'retreated'
                        ? 'win'
                        : 'wipe'
                  }`}
                >
                  {battle!.status === 'guild-win'
                    ? '★ 战斗胜利'
                    : battle!.status === 'retreated'
                      ? '🏳 已撤离'
                      : '✝ 队伍全灭'}
                </div>
              )}
              {battle && (
                <div
                  className="log-box"
                  ref={logBoxRef}
                  onScroll={(e) => {
                    const box = e.currentTarget
                    logPinnedRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < 40
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
          )}

          {run && run.phase === 'rest' && (
            <>
              <h2>战斗胜利 · 原地休整</h2>
              <div className="result-banner win">
                幸存者回复 {Math.round(REST_HEAL_PCT * 100)}% 生命。下一场：{encName(run, run.steps[run.stepIdx])}
              </div>
              {lastDrops.length > 0 && (
                <div className="inv-panel">
                  {lastDrops.map((i) => (
                    <div key={i.id} className="inv-item">
                      🎁 {describeItem(i)}
                    </div>
                  ))}
                </div>
              )}
              <div className="end-actions">
                <button onClick={continueDeep}>⬇ 继续深入</button>
                <button onClick={retreat}>🏳 撤退回城</button>
              </div>
            </>
          )}

          {finished && (
            <>
              <h2>远征结束</h2>
              <div
                className={`result-banner ${
                  run!.phase === 'victory' ? 'win' : run!.phase === 'defeat' ? 'wipe' : 'win'
                }`}
              >
                {run!.phase === 'victory'
                  ? '★ 副本通关！（掉落与奖励已入仓库）'
                  : run!.phase === 'defeat'
                    ? '✝ 远征失败——阵亡的英雄已入纪念堂，愿他们安息'
                    : '🏳 已撤退回城'}
              </div>
              {/* M1 P0 成长结算:这把你变强了什么(出击前快照 vs 现在) */}
              {(() => {
                const rows = run!.members.map((m) => {
                  const snap = growthSnapshotRef.current.get(m.id)
                  if (!snap) return null
                  return { m, snap, power: powerScore(m) }
                })
                const survivors = run!.members.filter((m) => m.alive)
                const pairs: { a: string; b: string; stars: number }[] = []
                for (let i = 0; i < survivors.length; i++) {
                  for (let j = i + 1; j < survivors.length; j++) {
                    const stars = bondStars(survivors[i].bonds[survivors[j].id] ?? 0)
                    if (stars > 0) pairs.push({ a: survivors[i].name, b: survivors[j].name, stars })
                  }
                }
                return (
                  <div className="inv-panel">
                    <h2>📈 成长结算</h2>
                    {rows.map((r) =>
                      r ? (
                        <div key={r.m.id} className={`growth-row${r.m.alive ? '' : ' dead'}`}>
                          <span className="g-name">{r.m.alive ? r.m.name : `⚰ ${r.m.name}`}</span>
                          <span>Lv{r.snap.level}→{r.m.level}</span>
                          <span>
                            战力 {r.snap.power}→{r.power}
                            {r.power > r.snap.power ? `（+${r.power - r.snap.power}）` : ''}
                          </span>
                          <span className="g-exp">经验 {r.m.exp}/{xpNeeded(r.m.level)}</span>
                        </div>
                      ) : null,
                    )}
                    {pairs.length > 0 && (
                      <p className="hint">
                        🤝 默契:{pairs.map((p) => `${p.a} ↔ ${p.b} ${'★'.repeat(p.stars)}`).join('，')}
                        （同队时每 ★ 全员伤害 +3%）
                      </p>
                    )}
                  </div>
                )
              })()}
              <div className="end-actions">
                <button onClick={backToGuild}>← 返回公会</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
