import { useEffect, useRef, useState } from 'react'
import type { BattleState, DeadHero, ItemInstance, JobId, Member, Slot, Stance } from './sim/types'
import { generateMember, maxHpOf, bondStars, xpNeeded, seedMemberSeq, reserveNames, rollSpec } from './sim/gen'
import { statLayers } from './sim/combat'
import { RACES } from './data/races'
import { guildGoals } from './sim/goals'
import { applyDeathShock, applyFeast, applyVictory, applyRestMorale, refusesToMarch } from './sim/morale'
import { chronicleHeroFall, chronicleFirstKill, chronicleFeast, chronicleTowerRecord, chronicleBattleVictory, chronicleRefusal, chronicleRecruit, chronicleLevelUp, chronicleBondStar, chronicleBuilding, moraleReadout, seedChronicle, type ChronicleEntry } from './sim/chronicle'
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
import { loadGuildSave, saveGuild, clearGuildSave, exportSave, importSave } from './state/save'
import { BattleRenderer } from './ui/battle/BattleRenderer'
import { initAudio, toggleMute, isMuted, sfxVictory, sfxDefeat, sfxCoin, sfxVisitor, sfxCmd } from './ui/audio'
import { bossIntents } from './sim/mechanics'
import { BLACKMOSS, DUNGEONS } from './data/dungeons'
import { startTower, settleTowerFloor, towerRest, towerNext, towerMarkPermadeath, towerFloorIsBoss, type TowerRun } from './sim/tower'
import { ECONOMY } from './data/economy'
import { BUILDINGS, baseEffects } from './data/base'
import { rollVisitor, bountyCandidate, taleCandidates, sellValue, cooldownNeeded, offlineGain } from './sim/tavern'
import { rollGuildEvent, pickOutcome } from './sim/guild-events'
import { applyMoraleDelta } from './sim/morale'
import { rollDrop } from './sim/loot'
import { chronicleRaw } from './sim/chronicle'
import { grantExp } from './sim/gen'
import { JOBS, specOf } from './data/jobs'
import { HYBRIDS, isHybrid } from './data/vocations'

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

// UI 2.0 屏幕栈:公会大厅(hub) + 功能界面覆盖层。快捷键呼出,Esc/再按关闭。
type UIScreen = 'roster' | 'tavern' | 'warehouse' | 'base' | 'chronicle' | 'memorial' | 'manual' | 'expedition'
// 大厅功能坞:图标 + 名称 + 快捷键(顺序即展示顺序)
const HUB_DOCK: { key: UIScreen; icon: string; label: string; hotkey: string }[] = [
  { key: 'roster', icon: '🛡', label: '花名册', hotkey: 'C' },
  { key: 'tavern', icon: '🍺', label: '酒馆', hotkey: 'T' },
  { key: 'warehouse', icon: '🎒', label: '仓库', hotkey: 'B' },
  { key: 'base', icon: '🏰', label: '基地', hotkey: 'N' },
  { key: 'chronicle', icon: '📜', label: '大事记', hotkey: 'J' },
  { key: 'memorial', icon: '🕯', label: '名人堂', hotkey: 'H' },
  { key: 'manual', icon: '📖', label: '手册', hotkey: 'K' },
]

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
  // 副本选择(节奏改版:多副本)——仅决定下一次出征打哪张图,不入存档
  const [dungeonId, setDungeonId] = useState('blackmoss')
  const activeDungeon = DUNGEONS.find((d) => d.id === dungeonId) ?? BLACKMOSS
  const [memorial, setMemorial] = useState<DeadHero[]>(() => saved?.memorial ?? [])
  const [manual, setManual] = useState<string[]>(() => saved?.manual ?? [])
  const [protectOn, setProtectOn] = useState(() => saved?.protectOn ?? true)
  const [candidates, setCandidates] = useState<Member[]>([])
  const [screen, setScreen] = useState<'title' | 'game'>('title')
  const [muted, setMuted] = useState(isMuted())
  const [gold, setGold] = useState(() => saved?.gold ?? 150)
  const [blessing, setBlessing] = useState(() => saved?.blessing ?? 0)
  const [recruitCooldown, setRecruitCooldown] = useState(() => saved?.recruitCooldown ?? 0)
  const [visitor, setVisitor] = useState<ReturnType<typeof rollVisitor> | null>(null)
  const [pendingEvent, setPendingEvent] = useState<ReturnType<typeof rollGuildEvent> | null>(null)
  const [eventResult, setEventResult] = useState<string | null>(null)
  const [offlineNote, setOfflineNote] = useState<string | null>(null)
  const [chronicle, setChronicle] = useState<ChronicleEntry[]>(() => saved?.chronicle ?? [])
  const [buildings, setBuildings] = useState<Record<string, number>>(() => saved?.buildings ?? {})
  const [day, setDay] = useState(() => saved?.day ?? 1)
  const [towerBest, setTowerBest] = useState(() => saved?.towerBest ?? 0)
  // 药水库存(经济改造):出征携带/战斗消耗/回城退回,仓库补货
  const [potions, setPotions] = useState(() => saved?.potions ?? { ...ECONOMY.startingPotions })
  // 已解锁混合职阶(宪法 v3,训练场一次性解锁)
  const [unlockedHybrids, setUnlockedHybrids] = useState<string[]>(() => saved?.unlockedHybrids ?? [])
  const [towerRun, setTowerRun] = useState<TowerRun | null>(null)

  // 读档登记已用名字：新招募不与存档英雄/英灵重名
  useEffect(() => {
    if (saved) {
      seedMemberSeq(saved.members) // 防新招募与存档成员撞 ID(血量写回会串位)
      reserveNames([...saved.members.map((m) => m.name), ...saved.memorial.map((h) => h.name)])
      seedChronicle(saved.chronicle ?? [])
      // M1 P1 离线累积:离开的时间里,存活英雄们接零工
      const { hours, gold } = offlineGain(saved.members, saved.lastSeen, Date.now())
      if (gold > 0) {
        setGold((g) => g + gold)
        setOfflineNote(`🕯 离开的 ${hours} 小时里,队员们接了些零工,赚了 ${gold} 金。`)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runRef = useRef<DungeonRun | null>(null)
  const lastBranchRef = useRef('shortcut')
  const autoLoopRef = useRef(false)
  const continueDeepRef = useRef<(() => void) | null>(null)
  const startExpeditionRef = useRef<((branchId: string) => void) | null>(null)
  const [run, setRun] = useState<DungeonRun | null>(null)
  const [battle, setBattle] = useState<BattleState | null>(null)
  const [running, setRunning] = useState(false)
  const seedRef = useRef((Date.now() % 100000) + 1) // 每次会话不同种子（读档后不复刻上局随机序列）
  const logBoxRef = useRef<HTMLDivElement | null>(null)
  const logPinnedRef = useRef(true) // 战报钉底：用户上滚阅读即放手，滚回底部自动恢复跟随
  const growthSnapshotRef = useRef<Map<string, { level: number; power: number; bondTotal: number; bonds: Record<string, number> }>>(new Map())
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

  // 塔层结算(M1 P1):阵亡全款登记/金币入账/最高层记录/层推进。幂等:phase 守卫。
  useEffect(() => {
    const t = towerRunRef.current
    const b = t?.battle
    if (!t || !b || t.phase !== 'battle') return
    if (b.status === 'running') return
    const dead = towerMarkPermadeath(t, '黑苔高塔')
    if (dead.length > 0) {
      setMemorial((m) => [...m, ...dead])
      setBlessing((b2) => b2 + dead.length * fx.blessingPerDeath)
      setMembers([...membersRef.current])
    }
    const { gold } = settleTowerFloor(t)
    if (gold > 0) setGold((g) => g + gold)
    const endPhase = t.phase as TowerRun['phase']
    if (endPhase === 'rest') {
      if (t.floor > towerBest) logChronicle(chronicleTowerRecord(day, t.floor))
      setTowerBest((best) => Math.max(best, t.floor))
      setTowerRunning(false)
      setTowerRun({ ...t })
      // 挂机连刷:rest 自动休整并深入下一层
      if (t.autoMode) {
        window.setTimeout(() => {
          const t2 = towerRunRef.current
          if (!t2 || t2.phase !== 'rest') return
          towerRest(t2)
          towerNext(t2, ++seedRef.current * 9973)
          setTowerRun({ ...t2 })
          setTowerRunning(true)
          setBattle(null)
          lastBattleRef.current = null
          drainAndSync(t2.battle!)
        }, 500)
      }
    } else {
      setTowerRunning(false)
      setTowerRun({ ...t })
    }
    drainAndSync(b)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [towerRun?.battle?.status])

  // 公会阶段自动落盘;远征进行中(战斗/休整)跳过。
  // 结算页(victory/defeat/retreated)是安全边界:成长必须在结算时落盘,
  // 否则玩家在结算页关页会丢掉这把的成长(save-systems:安全边界自动存档)。
  useEffect(() => {
    if (run && run.phase !== 'victory' && run.phase !== 'defeat' && run.phase !== 'retreated') return
    if (towerRun && towerRun.phase !== 'ended') return
    saveGuild({ members, inventory, memorial, manual, protectOn, gold, blessing, recruitCooldown, towerBest, chronicle, day, buildings, potions, unlockedHybrids })
  }, [members, inventory, memorial, manual, protectOn, gold, blessing, recruitCooldown, towerBest, chronicle, day, buildings, potions, unlockedHybrids, run, towerRun])

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
  // M1 P0:出征队编组——显式编入/替补,不再固定'花名册前三个'
  // 团本编制:上限随所选副本(activeDungeon.size),3 人本照旧,5 人团本可上 5 人
  const [expeditionIds, setExpeditionIds] = useState<string[]>([])
  const expedition = (() => {
    const byId = new Map(members.map((m) => [m.id, m]))
    return expeditionIds.map((id) => byId.get(id)).filter((m): m is Member => !!m && m.alive)
  })()
  useEffect(() => {
    // 初次加载/远征减员后:自动补齐到所选副本编制(花名册顺序);换小图时裁到编制内
    setExpeditionIds((ids) => {
      const aliveIds = members.filter((m) => m.alive).map((m) => m.id)
      const kept = ids.filter((id) => aliveIds.includes(id))
      if (kept.length >= activeDungeon.size) return kept.slice(0, activeDungeon.size)
      return [...kept, ...aliveIds.filter((id) => !kept.includes(id))].slice(0, activeDungeon.size)
    })
  }, [members, dungeonId])
  const enterExpedition = (id: string) => {
    if (runRef.current || towerRunRef.current) return
    setExpeditionIds((ids) => {
      const aliveIds = members.filter((m) => m.alive).map((m) => m.id)
      const kept = ids.filter((x) => x !== id && aliveIds.includes(x))
      if (kept.length >= activeDungeon.size) return [...kept.slice(0, activeDungeon.size - 1), id] // 满员时编入=换下最后一位
      return [...kept, id]
    })
  }
  const leaveExpedition = (id: string) => {
    if (runRef.current || towerRunRef.current) return
    setExpeditionIds((ids) => ids.filter((x) => x !== id))
  }

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
      if (!manual.includes(bossId)) {
        logChronicle(chronicleFirstKill(day, r.dungeon.bosses[bossId].name, r.members.find((m) => m.alive) ?? r.members[0]))
      }
    }
    advanceRun(r)
    const dead = markPermadeath(r)
    if (dead.length > 0) {
      const witnesses = r.members.filter((m) => m.alive)
      applyDeathShock(dead[0].id, witnesses)
      for (const d of dead) logChronicle(chronicleHeroFall(day, d.name, JOBS[d.job].name, r.dungeon.name))
    }
    if (b.status === 'guild-win') {
      applyVictory(r.members.filter((m) => m.alive))
      logChronicle(chronicleBattleVictory(day, r.dungeon.name, r.members.filter((m) => m.alive)))
    }
    if (dead.length > 0) setMemorial((m) => [...m, ...dead])
    // M1 P0 成长:经验 + 默契的发放下沉在 sim 层(可被 smoke 直接验证)
    settleGrowth(r, fx.expMult)
    // M1 P2 编年史:升级与默契升星(出击前快照对比)
    for (const m of r.members) {
      const snap = growthSnapshotRef.current.get(m.id)
      if (snap && m.level > snap.level) logChronicle(chronicleLevelUp(day, m, m.level))
    }
    {
      const surv = r.members.filter((m) => m.alive)
      for (let i = 0; i < surv.length; i++) {
        for (let j = i + 1; j < surv.length; j++) {
          const a = surv[i]
          const b2 = surv[j]
          const beforeStars = bondStars(growthSnapshotRef.current.get(a.id)?.bonds?.[b2.id] ?? 0)
          const afterStars = bondStars(a.bonds[b2.id] ?? 0)
          if (afterStars > beforeStars && afterStars >= 1) {
            logChronicle(chronicleBondStar(day, a, b2, afterStars))
          }
        }
      }
    }
    // M1 P0 经济:胜场金币 / 通关奖励 / 阵亡祝福 / 招募冷却递减
    if (b.status === 'guild-win') {
      setGold((g) => g + (enc?.kind === 'boss' ? ECONOMY.battleGold.boss : ECONOMY.battleGold.wave))
    }
    const endPhase = r.phase as DungeonRun['phase']
    if (endPhase === 'victory') { setGold((g) => g + ECONOMY.clearBonus); sfxVictory() }
    if (endPhase === 'defeat') sfxDefeat()
    if (dead.length > 0) setBlessing((b2) => b2 + dead.length * fx.blessingPerDeath)
    setRecruitCooldown((c) => Math.max(0, c - 1))
    // 挂机连刷(试玩反馈):rest 自动下一场;victory 自动重刷同一副本;团灭/保护撤退停止
    if (endPhase !== 'battle' && r.autoMode) {
      if (endPhase === 'rest') {
        window.setTimeout(() => continueDeepRef.current?.(), 500)
      } else if (endPhase === 'victory') {
        window.setTimeout(() => startExpeditionRef.current?.(lastBranchRef.current), 600)
      } else if (endPhase === 'defeat') {
        logChronicle(chronicleRaw(day, '挂机连刷结束:队伍全灭于' + r.dungeon.name + '。'))
      } else if (endPhase === 'retreated') {
        logChronicle(chronicleRaw(day, '挂机连刷结束:撤退保护把队伍带回了公会。'))
      }
    }
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
    if (runRef.current || towerRunRef.current) return
    lastBranchRef.current = branchId
    const refusers = expedition.filter((m) => refusesToMarch(m))
    if (refusers.length > 0) {
      logChronicle(chronicleRefusal(day, refusers))
      setMembers([...membersRef.current])
      return
    }
    setDay((d) => d + 1)
    if (expedition.length < activeDungeon.size) return
    // M1 P0 成长快照:结算页要展示"这把你变强了什么"
    growthSnapshotRef.current = new Map(
      expedition.map((m) => [m.id, { level: m.level, power: powerScore(m), bondTotal: Object.values(m.bonds).reduce((s, n) => s + bondStars(n), 0), bonds: { ...m.bonds } }]),
    )
    runRef.current = createRun(
      expedition,
      activeDungeon,
      branchId,
      ++seedRef.current * SEED_BASE,
      memorial.length * MEMORIAL_AURA,
      protectOn,
      potions,
    )
    runRef.current.autoMode = autoLoopRef.current
    setLastDrops([])
    setRunning(true)
    syncAll()
  }
  startExpeditionRef.current = startExpedition

  const continueDeep = () => {
    const r = runRef.current
    if (!r || r.phase !== 'rest') return
    applyRestMorale(r.members.filter((m) => m.alive))
    const enc = r.dungeon.encounters.find((e) => e.id === r.steps[r.stepIdx])
    const manualBonus = enc?.bossId && manual.includes(enc.bossId) ? MANUAL_BONUS : 0
    startStep(r, ++seedRef.current * SEED_BASE, manualBonus)
    setRunning(true)
    syncAll()
  }
  continueDeepRef.current = continueDeep

  const backToGuild = () => {
    const r = runRef.current
    if (r) resetAfterRun(membersRef.current)
    // 药水经济:未用完的药水退回公会库存
    if (r) setPotions({ ...r.potions })
    runRef.current = null
    setRunning(false)
    setRun(null)
    setBattle(null)
    lastBattleRef.current = null
    rendererRef.current?.reset()
    setMembers([...membersRef.current])
    // M1 P0:回城 roll 上门事件与大事事件(涌现叙事双井;缘分不排队,不受冷却)
    const roll = Math.random()
    if (roll < fx.visitorChance && membersRef.current.filter((m) => m.alive).length < ROSTER_CAP) {
      setVisitor(rollVisitor(Math.random, membersRef.current, buildings.tavern ?? 0))
    } else if (roll < fx.visitorChance + 0.35 && !pendingEvent) {
      const ev = rollGuildEvent(Math.random)
      if (ev) { setPendingEvent(ev); setEventResult(null); sfxVisitor() }
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
    setPotions({ ...ECONOMY.startingPotions })
    setUnlockedHybrids([])
    setMembers(newRoster())
  }

  const logChronicle = (e: ChronicleEntry) => setChronicle((c) => [...c, e])

  // ---- M1 P0 招募三路径(宪法红线 6:上门缘分不排队;悬赏/传闻受冷却;冷却防软锁减半)----
  const aliveCount = () => membersRef.current.filter((m) => m.alive).length

  const signVisitor = () => {
    if (!visitor || runRef.current || aliveCount() >= ROSTER_CAP) return
    setMembers((roster) => [...roster, visitor.member])
    logChronicle(chronicleRecruit(day, visitor.member, '上门投奔'))
    setVisitor(null)
  }

  const hireBounty = (job: JobId) => {
    if (runRef.current || effectiveCooldown > 0 || gold < ECONOMY.bountyCost || aliveCount() >= ROSTER_CAP) return
    setGold((g) => g - ECONOMY.bountyCost)
    const m = bountyCandidate(Math.random, membersRef.current, job)
    setMembers((roster) => [...roster, m])
    logChronicle(chronicleRecruit(day, m, '定向悬赏'))
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
    // 宪法 v3:招募即带专精(三专精随机);种族在生成时已定
    const recruited = { ...m, spec: rollSpec(m.job, Math.random) }
    setMembers((roster) => [...roster, recruited])
    logChronicle(chronicleRecruit(day, recruited, '酒馆传闻'))
    setCandidates([])
  }

  // 大事事件:按权重结算选择并应用效果(效果声明在 data/guild-events.ts)
  const resolveEvent = (choiceIdx: number) => {
    const ev = pendingEvent
    if (!ev) return
    const outcome = pickOutcome(ev, choiceIdx, Math.random())
    const fx = outcome.effects ?? {}
    const gold2 = fx.gold
    if (gold2) setGold((g) => Math.max(0, g + gold2))
    const blessing2 = fx.blessing
    if (blessing2) setBlessing((b) => Math.max(0, b + blessing2))
    if (fx.moraleAll) applyMoraleDelta(membersRef.current.filter((m) => m.alive), fx.moraleAll)
    if (fx.moraleRandom) {
      const alive = membersRef.current.filter((m) => m.alive)
      if (alive.length > 0) applyMoraleDelta([alive[Math.floor(Math.random() * alive.length)]], fx.moraleRandom)
    }
    if (fx.expAll) for (const m of membersRef.current) if (m.alive) grantExp(m, fx.expAll)
    if (fx.item) setInventory((inv) => [...inv, rollDrop(fx.item!, Math.random)])
    if (fx.recruit) setVisitor(rollVisitor(Math.random, membersRef.current))
    if (fx.injure) {
      const alive = membersRef.current.filter((m) => m.alive)
      if (alive.length > 0) {
        const hurt = alive[Math.floor(Math.random() * alive.length)]
        hurt.hp = Math.max(1, Math.floor(hurt.hp / 2))
        setMembers([...membersRef.current])
      }
    }
    // 药水经济接入事件叙事:补给/失窃/赠礼直接改公会库存
    if (fx.potionHeal) setPotions((p) => ({ ...p, heal: Math.max(0, p.heal + fx.potionHeal!) }))
    if (fx.potionFury) setPotions((p) => ({ ...p, fury: Math.max(0, p.fury + fx.potionFury!) }))
    logChronicle(chronicleRaw(day, ev.title + ':' + outcome.text))
    setEventResult(outcome.text)
    setMembers([...membersRef.current])
  }

  const dismissEvent = () => {
    setPendingEvent(null)
    setEventResult(null)
  }

  const sellItem = (id: string) => {
    const item = inventory.find((i) => i.id === id)
    if (!item) return
    setGold((g) => g + sellValue(item, fx.sellMult)); sfxCoin()
    setInventory((inv) => inv.filter((i) => i.id !== id))
  }

  // ---- M1 P1 黑苔高塔 ----
  const towerRunRef = useRef<TowerRun | null>(null)
  const [towerRunning, setTowerRunning] = useState(false)

  const enterTower = () => {
    if (runRef.current || towerRunRef.current || expedition.length < 3) return
    const t = startTower(expedition, ++seedRef.current * 9973, potions)
    towerRunRef.current = t
    setTowerRun({ ...t })
    setTowerRunning(true)
    setBattle(null)
    lastBattleRef.current = null
    drainAndSync(t.battle!)
  }

  const cmdTower = (fn: (b: BattleState) => void, force = false) => {
    const b = towerRunRef.current?.battle
    if (!b) return
    if (b.status === 'running') {
      if (b.commands.autoMode && !force) return
      fn(b)
    }
    drainAndSync(b)
  }

  const towerNextFloor = () => {
    const t = towerRunRef.current
    if (!t || t.phase !== 'rest') return
    towerRest(t)
    towerNext(t, ++seedRef.current * 9973)
    setTowerRun({ ...t })
    setTowerRunning(true)
    setBattle(null)
    lastBattleRef.current = null
    drainAndSync(t.battle!)
  }

  const leaveTower = () => {
    const t = towerRunRef.current
    // 药水经济:离开高塔,未用完的药水退回公会库存(settleTowerFloor 已逐层回写)
    if (t) setPotions({ ...t.potions })
    towerRunRef.current = null
    setTowerRun(null)
    setTowerRunning(false)
    setBattle(null)
    lastBattleRef.current = null
    rendererRef.current?.reset()
    setMembers([...membersRef.current])
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
  const fx = baseEffects(buildings)
  const upgradeBuilding = (id: string) => {
    const def = BUILDINGS.find((b) => b.id === id)
    if (!def) return
    const lv = buildings[id] ?? 0
    if (lv >= def.maxLevel) return
    const cost = def.costs[lv]
    if (gold < cost.gold || blessing < (cost.blessing ?? 0)) return
    setGold((g) => g - cost.gold)
    if (cost.blessing) setBlessing((b) => b - cost.blessing!)
    setBuildings((bs) => ({ ...bs, [id]: lv + 1 }))
    logChronicle(chronicleBuilding(day, def.name, lv + 1))
    sfxCoin()
  }

  // 药水经济:仓库金币补货(远征中不卖货)
  const buyPotion = (kind: 'heal' | 'fury') => {
    const cost = ECONOMY.potionCost[kind]
    if (run || gold < cost) return
    setGold((g) => g - cost)
    setPotions((p) => ({ ...p, [kind]: p[kind] + 1 }))
    sfxCoin()
  }

  // 职阶切换(宪法 v3):基础专精间轻消耗;混合职阶需默契达标+公会一次性解锁(重消耗)
  const bondTotalOf = (m: Member) => Object.values(m.bonds).reduce((s2, n) => s2 + bondStars(n), 0)
  const changeVocation = (memberId: string, newSpecId: string) => {
    if (runRef.current || towerRunRef.current) return
    const m = membersRef.current.find((x) => x.id === memberId)
    if (!m || m.spec === newSpecId) return
    const isHy = isHybrid(newSpecId)
    if (isHy) {
      if (!unlockedHybrids.includes(newSpecId)) {
        // 一次性解锁:钱+祝福,同时记录
        const c = ECONOMY.vocation
        if (gold < c.hybridUnlockGold || blessing < c.hybridUnlockBlessing) return
        if (bondTotalOf(m) < ECONOMY.hybridBondRequirement) return
        setGold((g) => g - c.hybridUnlockGold)
        setBlessing((b) => b - c.hybridUnlockBlessing)
        setUnlockedHybrids((hs) => [...hs, newSpecId])
      }
    } else {
      const c = ECONOMY.vocation
      if (gold < c.switchGold || blessing < c.switchBlessing) return
      setGold((g) => g - c.switchGold)
      setBlessing((b) => b - c.switchBlessing)
    }
    setMembers((ms) => ms.map((x) => (x.id === memberId ? { ...x, spec: newSpecId } : x)))
    const label = isHy ? HYBRIDS[newSpecId].name : specOf(m.job, newSpecId).name
    logChronicle(chronicleRaw(day, m.name + ' 在训练场改换行当,如今是' + label + '。'))
    sfxCoin()
  }

  // 精进(宪法 v3 精进层):Lv6+,当前专精的精进池二选一,按专精记录
  const advanceSpec = (memberId: string, skillId: string) => {
    if (runRef.current || towerRunRef.current) return
    const m = membersRef.current.find((x) => x.id === memberId)
    if (!m || m.level < 6 || isHybrid(m.spec)) return
    const spec = specOf(m.job, m.spec)
    const sk = spec.advancedSkills?.find((x) => x.id === skillId)
    if (!sk) return
    if (m.specAdvanced?.[spec.id]) return
    const c = ECONOMY.advancedCost
    if (gold < c.gold || blessing < c.blessing) return
    setGold((g) => g - c.gold)
    setBlessing((b) => b - c.blessing)
    setMembers((ms) => ms.map((x) => (x.id === memberId ? { ...x, specAdvanced: { ...(x.specAdvanced ?? {}), [spec.id]: skillId } } : x)))
    logChronicle(chronicleRaw(day, m.name + ' 精进了' + spec.name + '之道,习得【' + sk.name + '】。'))
    sfxCoin()
  }

  // 通用战技(DD Augment):祝福学,永久,跨专精携带
  const learnAugment = (memberId: string, augId: string) => {
    if (runRef.current || towerRunRef.current) return
    const m = membersRef.current.find((x) => x.id === memberId)
    if (!m || m.augments?.includes(augId)) return
    if (blessing < ECONOMY.augmentCost) return
    setBlessing((b) => b - ECONOMY.augmentCost)
    setMembers((ms) => ms.map((x) => (x.id === memberId ? { ...x, augments: [...(x.augments ?? []), augId] } : x)))
    logChronicle(chronicleRaw(day, m.name + ' 在训练场悟出了通用战技【' + (ECONOMY.augments as Record<string, { name: string; desc: string }>)[augId].name + '】。'))
    sfxCoin()
  }
  // 紧急招募:人手不足时免冷却(防软锁)
  const effectiveCooldown = members.filter((m) => m.alive).length < 3 ? 0 : recruitCooldown
  const towerUnlocked = manual.includes('talma')
  const inTowerBattle = towerRun?.phase === 'battle' && towerRun.battle != null
  const inBattle = run?.phase === 'battle' && battle != null
  const battleOver = inBattle && battle!.status !== 'running'
  // 指挥有感:boss 意图实时推导——蓄力中「分散」脉冲,咏唱中亮「打断咏唱」按钮(决策窗口可见)
  const intents = inBattle && battle!.status === 'running' ? bossIntents(battle!) : null
  // 屏幕栈状态:null = 大厅;远征/爬塔中快捷键不劫持(战斗界面是全屏态)。与 title/game 阶段状态相互独立
  const [hubScreen, setHubScreen] = useState<UIScreen | null>(null)
  // 透明面板(宪法 v3.2 缺陷二):展开显示乘区逐层明细的成员
  const [detailOpen, setDetailOpen] = useState<Set<string>>(new Set())
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (runRef.current || towerRunRef.current) return
      if (e.key === 'Escape') {
        setHubScreen(null)
        return
      }
      const hit = HUB_DOCK.find((it) => it.hotkey.toLowerCase() === e.key.toLowerCase())
      if (hit) setHubScreen((cur) => (cur === hit.key ? null : hit.key))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const finished = run != null && (run.phase === 'victory' || run.phase === 'defeat' || run.phase === 'retreated')
  const canExpedition = !run && !towerRun && expedition.length >= activeDungeon.size

  const memberCard = (m: Member) => {
    const c = battle?.combatants.find((x) => x.memberId === m.id)
    const hp = c ? c.hp : m.hp
    const max = c ? c.maxHp : maxHpOf(m)
    const onExpedition = run != null ? run.members.includes(m) : expedition.includes(m)
    return (
      <div key={m.id} className="member-card">
        <div className="mc-head" style={{ cursor: 'pointer' }} title="点击展开属性明细" onClick={() => setDetailOpen((cur) => { const n = new Set(cur); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n })}>
          <span className="name">{m.name}</span>
          <span className="job">
            {RACES[m.race ?? 'human'].name}·{isHybrid(m.spec) ? HYBRIDS[m.spec!].name : specOf(m.job, m.spec).name}({JOBS[m.job].name}) Lv{m.level}
            {onExpedition ? ' · ⚔远征队' : ''}
          </span>
          <span className={`hp${c && !c.alive ? ' dead' : ''}`}>
            HP {hp}/{max}
            {c && !c.alive ? '（已倒下）' : ''}
          </span>
        </div>
        {detailOpen.has(m.id) && (
          <div className="stat-layers">
            {statLayers(m).map((l, i) => (
              <div key={i} className="stat-layer">
                <span className="sl-label">{l.label}</span>
                <span className={l.good ? 'good' : l.bad ? 'bad' : ''}>{l.text}</span>
              </div>
            ))}
          </div>
        )}
        <div className="row">
          <span>{attrsLine(m)}</span>
          <span>{personalityLine(m)}</span>
          <span>战力 {powerScore(m)}</span>
          <span>{moraleReadout(m)}</span>
          {!run && m.alive && (
            expeditionIds.includes(m.id) ? (
              <button className="mini-btn" onClick={() => leaveExpedition(m.id)}>▼ 替补</button>
            ) : (
              <button className="mini-btn" onClick={() => enterExpedition(m.id)}>▲ 编入</button>
            )
          )}
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
      {screen === 'title' && (
        <div className="title-overlay">
          <div className="title-logo">黑苔公会</div>
          <div className="title-sub">GUILD OF BLACKMOSS</div>
          <div className="title-tagline">英雄会死，故事不会。</div>
          {offlineNote && <div className="title-offline">{offlineNote}</div>}
          <div className="title-actions">
            <button onClick={() => { initAudio(); setScreen('game') }}>
              {saved ? '▶ 继续旅程' : '▶ 开始新公会'}
            </button>
            {saved && (
              <button
                onClick={() => {
                  if (!window.confirm('重新开始将清空当前进度，确定？')) return
                  initAudio()
                  clearGuildSave()
                  restartGuild()
                  setScreen('game')
                }}
              >
                ✦ 开始新公会
              </button>
            )}
          </div>
          <div className="title-foot">
            M1 · 内部构建 · 暂定名《黑苔公会》
            <span className="title-saveops">
              <button className="mini-btn" onClick={() => {
                const code = exportSave(loadGuildSave()!)
                void navigator.clipboard?.writeText(code).catch(() => {})
                window.prompt('已导出当前存档,复制这段代码备份:', code)
              }}>📤 导出存档</button>
              <button className="mini-btn" onClick={() => {
                const code = window.prompt('粘贴要导入的存档代码(将覆盖当前进度):')
                if (!code) return
                const imported = importSave(code)
                if (!imported) { window.alert('存档代码无效'); return }
                saveGuild({ ...imported, members: imported.members })
                window.location.reload()
              }}>📥 导入存档</button>
            </span>
          </div>
        </div>
      )}
      <button
        className="mute-btn"
        onClick={() => { initAudio(); setMuted(toggleMute()) }}
      >
        {muted ? '🔇' : '🔊'}
      </button>
      <div className="app-header">
        <h1>guild-game</h1>
        <span className="slice-tag">M1 · 高塔版 —— 爬塔 / 招募三路径 / 成长 / 演出</span>
      </div>
      <div className="layout">
        <div className="panel hub-panel">
          <div className="hub-topbar">
            <span className="hub-title">🏰 黑苔公会</span>
            <span>第 {day} 日</span>
            <span>💰 {gold}</span>
            <span>🕯 {blessing}</span>
            <span>👥 {members.filter((m) => m.alive).length}/{ROSTER_CAP}</span>
            <span>🧪 {potions.heal}</span>
            <span>⚡ {potions.fury}</span>
          </div>
          <h2>公会大厅</h2>
          <div className="hub-dock">
            {HUB_DOCK.map((it) => (
              <button
                key={it.key}
                disabled={!!run || !!towerRun}
                className={`dock-btn${hubScreen === it.key ? ' open' : ''}`}
                onClick={() => setHubScreen((cur) => (cur === it.key ? null : it.key))}
              >
                <span className="dock-icon">{it.icon}</span>
                <span className="dock-label">{it.label}</span>
                <span className="dock-key">{it.hotkey}</span>
              </button>
            ))}
          </div>
          {(() => {
            const goals = guildGoals({ members, inventory, manual, expedition, towerBest })
            const cur = goals.find((g) => !g.done)
            return (
              <p className="hub-goal">
                📋 当前目标:{cur ? cur.text : '全部达成!'}{cur?.progress ? `(${cur.progress})` : ''}
              </p>
            )
          })()}
          <div className="inv-panel tower-entry">
            <h2>🗼 黑苔高塔 —— 最高纪录 第 {towerBest} 层</h2>
            <p className="hint">
              逐层深入，敌人逐层变强；每 3 层遭遇守塔 boss。第 5 层起药水减半，
              <b style={{ color: '#d48f8f' }}>第 9 层起撤退保护失效</b>。奖励逐层立即入账，随时可带着离开。
            </p>
            {towerUnlocked ? (
              <button className="branch-btn" disabled={!canExpedition} onClick={enterTower}>
                🗼 进入高塔（从第 1 层开始）
              </button>
            ) : (
              <p className="hint">🔒 击败深渊祭司·塔尔玛后解锁</p>
            )}
          </div>
          <p className="hint hub-keys">
            快捷键:C 花名册 · T 酒馆 · B 仓库 · N 基地 · J 大事记 · H 名人堂 · K 手册 · Esc 关闭
          </p>
          <div className="end-actions">
            <button onClick={restartGuild}>☠ 重开公会</button>
          </div>
          {pendingEvent && (
            <div className="screen-overlay event-overlay">
              <div className="screen-panel event-modal">
                <div className="screen-head">
                  <h2>⚖ {pendingEvent.title}</h2>
                </div>
                {eventResult ? (
                  <>
                    <p className="event-result">{eventResult}</p>
                    <button onClick={dismissEvent}>知道了</button>
                  </>
                ) : (
                  <>
                    <p className="event-text">{pendingEvent.text}</p>
                    <div className="event-choices">
                      {pendingEvent.choices.map((c, i) => (
                        <button key={i} disabled={!!run} onClick={() => resolveEvent(i)}>
                          {c.text}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                </div>
              </div>
            )}
            {hubScreen === 'tavern' && (
              <div className="screen-overlay">
                <div className="screen-panel">
                  <div className="screen-head">
                    <h2>🍺 酒馆</h2>
                    <button className="screen-close" onClick={() => setHubScreen(null)}>✕ Esc</button>
                  </div>
                  <p className="screen-sub">
                    💰 {gold} · 🕯 祝福 {blessing} · 招募位 {members.filter((m) => m.alive).length}/{ROSTER_CAP}
                  </p>
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
              <button
                disabled={!!run || gold < 60}
                onClick={() => { setGold((g) => g - 60); applyFeast(membersRef.current); setMembers([...membersRef.current]); logChronicle(chronicleFeast(day, 60)); sfxCoin() }}
              >
                🍻 庆功宴（60 金）：全员士气 +30
              </button>
            </div>
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
                        {RACES[m.race ?? 'human'].name}·{isHybrid(m.spec) ? HYBRIDS[m.spec!].name : specOf(m.job, m.spec).name}({JOBS[m.job].name}) Lv{m.level}
                      </span>
                      <div className="row">
                        <span className="hint">{isHybrid(m.spec) ? HYBRIDS[m.spec!].identity : specOf(m.job, m.spec).identity}</span>
                      </div>
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
              </div>
            )}
            {hubScreen === 'warehouse' && (
              <div className="screen-overlay">
                <div className="screen-panel">
                  <div className="screen-head">
                    <h2>🎒 公会仓库</h2>
                    <button className="screen-close" onClick={() => setHubScreen(null)}>✕ Esc</button>
                  </div>
          <div className="inv-panel">
            <h2>公会仓库（{inventory.length}）</h2>
            <div className="potion-supply">
              <span className="hint">
                🧪 治疗药 ×{potions.heal} · ⚡ 爆发药 ×{potions.fury} —— 出征携带,战斗消耗,回城退回
              </span>
              <div className="tavern-row">
                <button disabled={!!run || gold < ECONOMY.potionCost.heal} onClick={() => buyPotion('heal')}>
                  🧪 补充治疗药（{ECONOMY.potionCost.heal} 金）
                </button>
                <button disabled={!!run || gold < ECONOMY.potionCost.fury} onClick={() => buyPotion('fury')}>
                  ⚡ 补充爆发药（{ECONOMY.potionCost.fury} 金）
                </button>
              </div>
            </div>
            {inventory.length === 0 ? (
              <p className="hint">击败 boss 掉落装备（首次击杀保底一件）。从成员卡的下拉框穿戴。</p>
            ) : (
              inventory.map((i) => (
                <div key={i.id} className="inv-item">
                  {describeItem(i)}
                  <button className="sell-btn" onClick={() => sellItem(i.id)}>
                    变卖 +{sellValue(i, fx.sellMult)} 金
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
              </div>
              </div>
            )}
            {hubScreen === 'base' && (
              <div className="screen-overlay">
                <div className="screen-panel">
                  <div className="screen-head">
                    <h2>🏰 公会基地</h2>
                    <button className="screen-close" onClick={() => setHubScreen(null)}>✕ Esc</button>
                  </div>
          <div className="inv-panel">
            <h2>🏰 公会基地（第 {day} 日）</h2>
            <div className="base-grid">
              {BUILDINGS.map((def) => {
                const lv = buildings[def.id] ?? 0
                const maxed = lv >= def.maxLevel
                const cost = maxed ? null : def.costs[lv]
                const affordable = cost != null && gold >= cost.gold && blessing >= (cost.blessing ?? 0)
                return (
                  <div key={def.id} className={`base-card${lv > 0 ? ' owned' : ''}`}>
                    <div className="base-head">
                      <span className="base-name">{def.icon} {def.name}</span>
                      <span className="base-lv">{lv > 0 ? 'Lv' + lv : '未建'}</span>
                    </div>
                    <p className="hint">{def.desc}</p>
                    {maxed ? (
                      <button disabled>已满级</button>
                    ) : (
                      <button disabled={!!run || !affordable} onClick={() => upgradeBuilding(def.id)}>
                        升到 Lv{lv + 1}：{cost!.gold} 金{cost!.blessing ? ` + ${cost!.blessing} 祝福` : ''}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="voc-panel">
              <h2>⚔ 训练场 —— 行当更换</h2>
              <p className="hint">
                换行当:{ECONOMY.vocation.switchGold} 金 + {ECONOMY.vocation.switchBlessing} 祝福。
                混合职阶首次解锁 {ECONOMY.vocation.hybridUnlockGold} 金 + {ECONOMY.vocation.hybridUnlockBlessing} 祝福,
                且要求本人默契 ≥ {ECONOMY.hybridBondRequirement} 星(共同远征积累)。🔒 = 公会尚未解锁该混合行当。
              </p>
              {members.filter((m) => m.alive).map((m) => {
                const cur = isHybrid(m.spec) ? HYBRIDS[m.spec!].name : specOf(m.job, m.spec).name
                const sameLine = Object.values(JOBS[m.job].specs).filter((sp) => sp.id !== m.spec)
                const bond = bondTotalOf(m)
                const canSwitch = !run && gold >= ECONOMY.vocation.switchGold && blessing >= ECONOMY.vocation.switchBlessing
                return (
                  <div key={m.id} className="voc-row">
                    <div className="voc-head">
                      <b>{m.name}</b>
                      <span className="hint">现为 {cur} · Lv{m.level} · 默契 {bond} 星</span>
                    </div>
                    <div className="voc-btns">
                      {sameLine.map((sp) => (
                        <button key={sp.id} disabled={!canSwitch} title={sp.identity} onClick={() => changeVocation(m.id, sp.id)}>
                          {sp.name}
                        </button>
                      ))}
                      {Object.values(HYBRIDS).map((hy) => {
                        const unlocked = unlockedHybrids.includes(hy.id)
                        const canBond = bond >= ECONOMY.hybridBondRequirement
                        const canPay = gold >= ECONOMY.vocation.hybridUnlockGold && blessing >= ECONOMY.vocation.hybridUnlockBlessing
                        return (
                          <button
                            key={hy.id}
                            disabled={!canSwitch || m.spec === hy.id || !canBond || (!unlocked && !canPay)}
                            title={hy.identity + (unlocked ? '' : '(首次解锁需额外花费)')}
                            onClick={() => changeVocation(m.id, hy.id)}
                          >
                            {hy.name}{unlocked ? '' : ' 🔒'}
                          </button>
                        )
                      })}
                    </div>
                    {!isHybrid(m.spec) && m.level >= 6 && (
                      <div className="voc-row2">
                        <span className="hint">精进:</span>
                        {(specOf(m.job, m.spec).advancedSkills ?? []).map((sk) => {
                          const chosen = m.specAdvanced?.[specOf(m.job, m.spec).id] === sk.id
                          const any = !!m.specAdvanced?.[specOf(m.job, m.spec).id]
                          return (
                            <button key={sk.id} disabled={any || !!run || gold < ECONOMY.advancedCost.gold || blessing < ECONOMY.advancedCost.blessing} title={sk.name} onClick={() => advanceSpec(m.id, sk.id)}>
                              {sk.name}{chosen ? ' ✓' : ''}
                            </button>
                          )
                        })}
                        {m.specAdvanced?.[specOf(m.job, m.spec).id] ? <span className="hint">已精进</span> : null}
                      </div>
                    )}
                    <div className="voc-row2">
                      <span className="hint">通用战技:</span>
                      {(Object.entries(ECONOMY.augments) as [string, { name: string; desc: string }][]).map(([id, ag]) => {
                        const learned = m.augments?.includes(id)
                        return (
                          <button key={id} disabled={!!run || !!learned || blessing < ECONOMY.augmentCost} title={ag.desc} onClick={() => learnAugment(m.id, id)}>
                            {ag.name}{learned ? ' ✓' : ' ' + ECONOMY.augmentCost + '🕯'}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
                </div>
              </div>
              </div>
            )}
            {hubScreen === 'chronicle' && (
              <div className="screen-overlay">
                <div className="screen-panel">
                  <div className="screen-head">
                    <h2>📜 大事记</h2>
                    <button className="screen-close" onClick={() => setHubScreen(null)}>✕ Esc</button>
                  </div>
          <div className="inv-panel">
            <h2>📜 编年史（第 {day} 日 · {chronicle.length} 则）</h2>
            <div className="chronicle-box">
              {chronicle.length === 0 ? (
                <p className="hint">还没有故事发生。故事从第一次出击开始。</p>
              ) : (
                chronicle.slice(-40).map((e) => (
                  <div key={e.seq} className="chronicle-row">
                    <span className="chronicle-day">第{e.day}日</span>
                    <span>{e.text}</span>
                  </div>
                ))
              )}
            </div>
                </div>
              </div>
              </div>
            )}
            {hubScreen === 'memorial' && (
              <div className="screen-overlay">
                <div className="screen-panel">
                  <div className="screen-head">
                    <h2>🕯 名人堂</h2>
                    <button className="screen-close" onClick={() => setHubScreen(null)}>✕ Esc</button>
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
              </div>
              </div>
            )}
            {hubScreen === 'manual' && (
              <div className="screen-overlay">
                <div className="screen-panel">
                  <div className="screen-head">
                    <h2>📖 战术手册</h2>
                    <button className="screen-close" onClick={() => setHubScreen(null)}>✕ Esc</button>
                  </div>
          <div className="inv-panel">
            <h2>📖 战术手册（已研习 boss 伤害 +5%）</h2>
            <p className="hint">
              {manual.length === 0 ? '尚未研习任何 boss。' : `已研习：${manual.map((id) => DUNGEONS.map((d) => d.bosses[id]?.name).find(Boolean) ?? id).join('、')}`}
            </p>
            <button
              className={protectOn ? 'active' : ''}
              onClick={() => setProtectOn((p) => !p)}
            >
              🛡 撤退保护：{protectOn ? '开（濒危自动撤离）' : '关（搏命模式）'}
            </button>
                </div>
              </div>
              </div>
            )}
            {hubScreen === 'roster' && (
              <div className="screen-overlay">
                <div className="screen-panel">
                  <div className="screen-head">
                    <h2>🛡 花名册</h2>
                    <button className="screen-close" onClick={() => setHubScreen(null)}>✕ Esc</button>
                  </div>
                  <div className="inv-panel">
                    {members.filter((m) => m.alive).map(memberCard)}
                  </div>
                </div>
              </div>
            )}
        </div>

        <div className="panel">
          {/* 舞台常驻：渲染器挂载一次，非战斗阶段隐藏（避免 ref 为 null 导致挂载失败） */}
          <div className="stage" ref={stageRef} style={{ display: inBattle || inTowerBattle ? undefined : 'none' }} />

          {!run && !towerRun && (
            <>
              <h2>⚔ 作战板</h2>
              <p style={{ color: '#7a8191', marginBottom: 10 }}>
                选择路线：险路战斗更多、收获机会更多；稳路少打一场杂兵。血量全程延续，
                <b style={{ color: '#d48f8f' }}>战斗死亡即永久牺牲</b>，团灭将失去整支远征队。
              </p>
              <div className="dungeon-picker">
                {DUNGEONS.map((d) => (
                  <button
                    key={d.id}
                    className={d.id === dungeonId ? 'active' : ''}
                    disabled={!!run}
                    onClick={() => setDungeonId(d.id)}
                  >
                    🗺 {d.name}{d.size > 3 ? `（${d.size} 人团本）` : ''}
                  </button>
                ))}
              </div>
              {activeDungeon.branches.map((br) => (
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
                  {expedition.length < activeDungeon.size
                    ? `编制不足（${expedition.length}/${activeDungeon.size}）：去花名册编入队员，或去酒馆招募。`
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
                          if (runRef.current) runRef.current.autoMode = b.commands.autoMode
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
                        sfxCmd()
                        cmd((b) => setStance(b, s))
                      }}
                    >
                      {STANCE_NAME[s]}
                    </button>
                  ))}
                  <span className="cmd-label">│</span>
                  <button
                    onClick={() => {
                      sfxCmd()
                      cmd(useHealPotion)
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
                      sfxCmd()
                      cmd(useFuryPotion)
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
                      cmd((b) => {
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
                        sfxCmd()
                        cmd((b) => setFocus(b, intents.casterId))
                      }}
                    >
                      ⚔ 打断咏唱！
                    </button>
                  )}
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
                    <button
                      onClick={() => {
                        sfxCmd()
                        retreat()
                      }}
                      disabled={battle.commands.autoMode}
                    >
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
                  点击场上敌人 = 集火 · boss 蓄力出现红条倒计时 = 切「分散」减伤 · boss 出现紫条咏唱 = 点「打断咏唱！」 ·
                  狂暴前 = 爆发药或撤退令 · 倒下即永久牺牲
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

          {towerRun?.phase === 'battle' && battle && (
            <>
              <h2>🗼 黑苔高塔 · 第 {towerRun.floor} 层{towerFloorIsBoss(towerRun.floor) ? '（守塔者）' : ''}</h2>
              <div className="cmd-bar">
                <button
                  className={battle.commands.autoMode ? 'active' : ''}
                  onClick={() => cmdTower((b) => { b.commands.autoMode = !b.commands.autoMode; if (towerRunRef.current) towerRunRef.current.autoMode = b.commands.autoMode }, true)}
                >
                  🤖 挂机{battle.commands.autoMode ? '中（自动深入）' : ''}
                </button>
                <span className="cmd-label">│</span>
                <span className="cmd-label">阵型</span>
                {(Object.keys(STANCE_NAME) as Stance[]).map((st) => (
                  <button
                    key={st}
                    className={
                      (battle.commands.stance === st ? 'active' : '') +
                      (intents?.telegraphing && st === 'spread' ? ' urgent' : '')
                    }
                    disabled={battle.commands.autoMode}
                    onClick={() => {
                      sfxCmd()
                      cmdTower((b) => setStance(b, st))
                    }}
                  >
                    {STANCE_NAME[st]}
                  </button>
                ))}
                <span className="cmd-label">│</span>
                <button
                  onClick={() => {
                    sfxCmd()
                    cmdTower((b) => useHealPotion(b))
                  }}
                  disabled={battle.commands.autoMode || battle.commands.healStock <= 0 || battle.commands.healCd > 0}
                >
                  💊 {battle.commands.healStock}
                </button>
                <button
                  onClick={() => {
                    sfxCmd()
                    cmdTower((b) => useFuryPotion(b))
                  }}
                  disabled={battle.commands.autoMode || battle.commands.furyStock <= 0 || battle.commands.furyCd > 0}
                >
                  ⚡ {battle.commands.furyStock}
                </button>
                {intents?.casting && intents.casterId && !battle.commands.autoMode && (
                  <button
                    className="urgent"
                    onClick={() => {
                      if (!intents?.casterId) return
                      sfxCmd()
                      cmdTower((b) => setFocus(b, intents.casterId))
                    }}
                  >
                    ⚔ 打断咏唱！
                  </button>
                )}
                <button
                  className="focus-tag"
                  onClick={() => {
                    sfxCmd()
                    cmdTower((b) => orderRetreat(b))
                  }}
                >
                  🏳 撤退令
                </button>
              </div>
              <div className="enc-row">
                <button onClick={() => setTowerRunning((r) => !r)} disabled={battle.status !== 'running'}>
                  {towerRunning ? '⏸ 暂停' : '⏵ 继续'}
                </button>
                <span className="tick-info">tick {battle.tick}</span>
                <span className="tick-info">· 塔内金币已入账 {towerRun.goldEarned}</span>
              </div>
              <div className="log-box">
                {battle.log.map((entry, i) => (
                  <div key={i} className={`log-${entry.kind}`}>
                    <span className="log-tick">[{entry.tick}]</span>
                    {entry.text}
                  </div>
                ))}
              </div>
            </>
          )}

          {towerRun && towerRun.phase === 'rest' && (
            <>
              <h2>🗼 第 {towerRun.floor} 层突破</h2>
              <div className="result-banner win">
                幸存者回复 20% 生命。第 9 层起撤退保护失效——量力而行。
              </div>
              <div className="end-actions">
                <button onClick={towerNextFloor}>⬆ 深入第 {towerRun.floor + 1} 层</button>
                <button onClick={leaveTower}>🏰 带着奖励离开</button>
              </div>
            </>
          )}

          {towerRun && towerRun.phase === 'ended' && (
            <>
              <h2>塔内征程结束</h2>
              <div className={`result-banner ${towerRun.result === 'defeated' ? 'wipe' : 'win'}`}>
                {towerRun.result === 'defeated'
                  ? '✝ 高塔吞没了远征队——已得奖励保留，阵亡者入纪念堂'
                  : '🏰 你带着收获离开了高塔'}
              </div>
              <div className="end-actions">
                <button onClick={leaveTower}>← 返回公会</button>
              </div>
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
