import { appendFact } from '../sim/fact-ledger'
import { beforeEach, expect, test, vi } from 'vitest'
import { BLACKMOSS, DUNGEONS } from '../data/dungeons'
import { GUILD_EVENTS } from '../data/guild-events'
import { generateMember, maxHpOf, memberGenerationState, restoreMemberGeneration } from '../sim/gen'
import { mapOptions, moveTo, createRun, startStep } from '../sim/run'
import { startTower, towerNext, towerRest, insureNextTowerFloor } from '../sim/tower'
import { runRng, runMembers, runDungeon } from '../sim/run-core'
import { initialRunState, checkpointRunState, validateRunState, runReducer } from '../sim/run-state'
import { stepBattle, useFuryPotion, useHealPotion, setStance, enemyToCombatant, createBattle, applyHit } from '../sim/combat'
import { createStatefulRng, int, createRng } from '../sim/rng'
import { settleEncounter, type EncounterGuild } from '../sim/settlement'
import { rollDrop } from '../sim/loot'
import { rollVisitor } from '../sim/tavern'
import { newStatistics, recordStatistics } from '../sim/statistics'
import { createGuildItems, serializeGuildItems, resolveMembers, itemStateFromSave, applyEncounterItems, itemOwnershipErrors } from './item-registry'
import { migrate, importSave, exportSave, loadGuildSave, saveGuild, clearGuildSave, replaceGuildSave, saveLoadNotice, SAVE_VERSION, type GuildSave } from './save'
import type { Member } from '../sim/types'

const KEY = 'guild-game-save-v1'
let storage: Map<string, string>
beforeEach(() => {
  storage = new Map()
  vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) })
  clearGuildSave()
  restoreMemberGeneration({ seq: 0, usedNames: [] })
})

function roster(): Member[] {
  return (['guard', 'priest', 'ranger'] as const).map((job, i) => {
    const m = generateMember(job, 15, 300930 + i, { race: 'human' })
    m.morale = 80
    m.equipment.weapon = rollDrop(['wpn-t3-dawn', 'wpn-t3-vox', 'wpn-t3-gale'][i], createRng(31 + i))
    m.hp = maxHpOf(m)
    return m
  })
}

function save(members = roster()): GuildSave {
  const fields = serializeGuildItems(createGuildItems(members), members)
  return { ...fields, version: SAVE_VERSION, rngState: 83299, runState: initialRunState(), factLedger: { nextId: 1, facts: [] },
    visitor: null, generationState: memberGenerationState(), trainingReady: false, statistics: newStatistics(8),
    kingdom: { active: [], completed: [] }, rareHuntNext: null, gold: 900, blessing: 4, starMarrow: 3,
    healingMastery: {}, memorial: [], manual: ['talma'], protectOn: false, recruitCooldown: 0,
    towerBest: 0, lastSeen: 1727656000000, chronicle: [], day: 8, buildings: {}, potions: { heal: 4, fury: 4 },
    unlockedHybrids: [], dungeonMastery: {}, pendingConsequences: [], eventsSeen: [], guildBuffs: [] }
}

function resolved(s: GuildSave) { return resolveMembers(s.members, itemStateFromSave(s)) }
function refresh(s: GuildSave): GuildSave {
  s.runState = checkpointRunState(s.runState, resolved(s))
  const loaded = importSave(exportSave(s))
  expect(loaded, '合法运行断点应可导入').not.toBeNull()
  expect(JSON.stringify(loaded)).toBe(JSON.stringify(s))
  return loaded!
}

// 只调用生产模拟/结算/物品归属入口；不通过历史兼容视图或复制另一份奖励公式。
function settle(s: GuildSave): GuildSave {
  const r = s.runState.activeRun!
  const guild: EncounterGuild = { ...s, members: resolved(s) }
  const before = JSON.stringify({ r, guild })
  const input = r.kind === 'dungeon' ? { source: 'dungeon' as const, run: r, guild }
    : { source: 'tower' as const, run: r, guild }
  const o = settleEncounter(input)!
  expect(o).not.toBeNull()
  expect(JSON.stringify({ r, guild })).toBe(before)
  const items = applyEncounterItems(itemStateFromSave(s), o.guild.members, o.loot.items, o.consequences.relics)
  const progress = runReducer(s.runState, { type: 'patch', patch: { activeRun: o.run, playing: false,
    dropIds: [...s.runState.dropIds, ...items.items.map(i => i.id)], notices: o.notices } })
  const next = { ...s, ...o.guild, ...serializeGuildItems(items.state, o.guild.members),
    gold: s.gold + o.loot.gold + o.loot.clearGold, blessing: s.blessing + o.blessing,
    starMarrow: s.starMarrow + o.loot.starMarrow, memorial: [...s.memorial, ...o.deaths],
    chronicle: [...s.chronicle, ...o.consequences.chronicle],
    statistics: o.statistics.reduce(recordStatistics, s.statistics),
    runState: checkpointRunState(progress, o.guild.members), potions: o.run.potions } as GuildSave
  expect(itemOwnershipErrors(itemStateFromSave(next))).toEqual([])
  expect(validateRunState(next.runState, next.members)).toBe(true)
  return next
}

function finishBattle(s: GuildSave) {
  const b = s.runState.activeRun!.battle!
  b.commands.autoMode = true // U41 手动模式适配:跨刷新一致性验证的是托管战斗
  while (b.status === 'running' && b.tick < 6000) stepBattle(b)
  expect(b.status).not.toBe('running')
  return settle(s)
}

function equalBytes(a: GuildSave, b: GuildSave) {
  // 已了却/重新生成的 wish 可在刷新后插到对象尾部；键序不是玩法数据，统一键序后比较字节。
  const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => [k, canonical(v[k])])) : v
  if (JSON.stringify(canonical(a)) !== JSON.stringify(canonical(b))) {
    const paths: string[] = []
    const visit = (x: any, y: any, path: string) => {
      if (JSON.stringify(x) === JSON.stringify(y)) return
      if (x && y && typeof x === 'object' && typeof y === 'object') {
        for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) visit(x[k], y[k], path + '.' + k)
      } else paths.push(`${path}: ${JSON.stringify(x)} != ${JSON.stringify(y)}`)
    }
    visit(a, b, 'save')
    throw new Error(paths.slice(0, 6).join('\n'))
  }
}

test('现有两种 Run 从出发开始就是 JSON 数据；成员/地图只由 ID 解析，随机序列可续接', () => {
  for (const kind of ['dungeon', 'tower'] as const) {
    const s = save(), members = resolved(s)
    const r = kind === 'tower' ? startTower(members, 53, s.potions)
      : createRun(members, BLACKMOSS, 53, 0, false, s.potions)
    expect(JSON.parse(JSON.stringify(r))).toEqual(r)
    expect(r).not.toHaveProperty('members'); expect(r).not.toHaveProperty('dungeon'); expect(r).not.toHaveProperty('rng')
    expect(r.pendingLoot).toEqual({ items: [], gold: 0, starMarrow: 0, exp: 0 })
    expect(runMembers(r, members)[0]).toBe(members[0])
    if (r.kind === 'dungeon') expect(runDungeon(r)).toBe(BLACKMOSS)
    const expected = createStatefulRng(r.seed)
    for (let i = 0; i < 17; i++) expect(runRng(r)()).toBe(expected())
    const copy = JSON.parse(JSON.stringify(r))
    for (let i = 0; i < 100; i++) expect(runRng(copy)()).toBe(expected())
  }
})

test('副本实战：暂停指令、选路与各场奖励跨刷新保持逐字节一致，终局不再结算', () => {
  for (const seed of [3, 53, 111]) {
    let plain = save()
    plain.runState.activeRun = createRun(resolved(plain), BLACKMOSS, seed, 0, false, plain.potions)
    {
      // R1.1:createRun 不再自动开战——先在地图第 0 层选路开战
      const r0 = plain.runState.activeRun!
      const node0 = mapOptions(r0).find(n => n.kind === 'battle' || n.kind === 'elite') ?? mapOptions(r0)[0]!
      moveTo(r0, node0.id)
      startStep(r0, int(runRng(r0), 1, 100000) * 7777, 0, resolved(plain))
    }
    let resumed = refresh(structuredClone(plain))
    let battles = 0
    let guard = 0
    while (['battle', 'rest'].includes(plain.runState.activeRun!.phase) && guard++ < 30) {
      if (plain.runState.activeRun!.phase === 'battle') {
        for (const s of [plain, resumed]) {
          const b = s.runState.activeRun!.battle!
          b.commands.autoMode = true // U41 适配
          for (let tick = 0; tick < 18 && b.status === 'running'; tick++) stepBattle(b)
          useFuryPotion(b); useHealPotion(b); setStance(b, 'spread')
        }
        resumed = refresh(resumed)
        plain = finishBattle(plain); resumed = finishBattle(resumed); battles++
        equalBytes(resumed, plain)
        const r = plain.runState.activeRun!
        if (r.kind !== 'dungeon' || r.phase !== 'rest') break
        resumed = refresh(resumed)
      }
      for (const s of [plain, resumed]) {
        const current = s.runState.activeRun!
        if (current.kind !== 'dungeon') throw new Error('dungeon')
        const opts = mapOptions(current)
        if (opts.length === 0) {
          // Boss 节点中场休息:连战下一场(无出边可选)
          startStep(current, int(runRng(current), 1, 100000) * 7777, 0, resolved(s))
        } else {
          const node = opts.find(n => n.kind === 'battle' || n.kind === 'elite') ?? opts.find(n => n.kind === 'boss') ?? opts[0]!
          moveTo(current, node.id)
          if (node.kind === 'battle' || node.kind === 'elite' || node.kind === 'boss') {
            startStep(current, int(runRng(current), 1, 100000) * 7777, 0, resolved(s))
          }
          // 非战斗节点(rest/event/treasure):直接走过,其效果不在本测范围
        }
        s.runState = checkpointRunState(s.runState, resolved(s))
      }
    }
    expect(battles).toBeGreaterThan(1)
    expect(plain.runState.activeRun!.phase).toBe('victory')
    resumed = refresh(resumed)
    const r = resumed.runState.activeRun!
    if (r.kind !== 'dungeon') throw new Error('dungeon')
    expect(settleEncounter({ source: 'dungeon', run: r, guild: { ...resumed, members: resolved(resumed) } })).toBeNull()
    expect(resumed.gold).toBeGreaterThan(900)
    // U34:大事记回归里程碑后单趟编年史条数大减;此处只断言终局结算仍有落账(不重复领奖语义)
    expect(resumed.chronicle.length).toBeGreaterThan(0)
  }
})

test('高塔实战：已到账金币、保险、携带药水、Boss 掉落跨三层刷新一致，无二次领奖', () => {
  let plain = save()
  plain.runState.activeRun = startTower(resolved(plain), 71, plain.potions)
  let resumed = refresh(structuredClone(plain))
  for (let floor = 1; floor <= 3; floor++) {
    for (const s of [plain, resumed]) {
      const b = s.runState.activeRun!.battle!
      b.commands.autoMode = true // U41 适配
      for (let tick = 0; tick < 15 && b.status === 'running'; tick++) stepBattle(b)
      useFuryPotion(b); setStance(b, 'tighten')
    }
    resumed = refresh(resumed)
    plain = finishBattle(plain); resumed = finishBattle(resumed)
    equalBytes(resumed, plain)
    expect(plain.runState.activeRun!.phase).toBe('rest')
    if (floor === 3) break
    for (const s of [plain, resumed]) {
      const r = s.runState.activeRun!
      if (r.kind !== 'tower') throw new Error('tower')
      const premium = insureNextTowerFloor(r, s.gold)
      expect(premium).toBe((floor + 1) * 40); s.gold -= premium
      s.runState = checkpointRunState(s.runState, resolved(s))
    }
    resumed = refresh(resumed)
    for (const s of [plain, resumed]) {
      const r = s.runState.activeRun!
      if (r.kind !== 'tower') throw new Error('tower')
      expect(insureNextTowerFloor(r, s.gold)).toBe(0)
      towerRest(r, 0.2, resolved(s)); towerNext(r, int(runRng(r), 1, 100000) * 9973, resolved(s))
      expect(r.insuredFloor).toBe(true)
      s.runState = checkpointRunState(s.runState, resolved(s))
    }
  }
  const r = resumed.runState.activeRun!
  if (r.kind !== 'tower') throw new Error('tower')
  expect(r.goldEarned).toBe(113)
  // #3.1 下塔才结算:爬塔期间金币/掉落进 pending,不入公会账(leaveTower 兑现)
  expect(resumed.gold).toBe(900 - 80 - 120)
  expect(r.pendingLoot.gold).toBe(113)
  expect((r.pendingDrops ?? []).length).toBeGreaterThanOrEqual(1)
  expect(settleEncounter({ source: 'tower', run: r, guild: { ...resumed, members: resolved(resumed) } })).toBeNull()
  equalBytes(resumed, plain) // toEqual 无路径,equalBytes 给出分叉字段
})

test('召唤宠物、Boss 增援与临终呼援的单位编号不依赖模块生命周期，断点后战报完全一致', () => {
  const members = roster()
  members[2].spec = 'ranger-beastmaster'; members[2].equipment = {}; members[2].hp = maxHpOf(members[2])
  const d = DUNGEONS.find(d => d.bosses && Object.values(d.bosses).some(b => b.mechanics.some(m => m.kind === 'summon')))!
  const enc = d.encounters.find(e => e.bossId && d.bosses[e.bossId].mechanics.some(m => m.kind === 'summon'))!
  const a = createBattle(members, d, enc.id, 53, 0, 0, false)
  a.commands.autoMode = true // U41 手动模式适配
  // 给机制留够时间；只改变本条测试的探针状态，不变更数据表/生产伤害规则。
  a.combatants.forEach(c => { c.attack = 1; c.hp = c.maxHp = 100000 })
  const b = JSON.parse(JSON.stringify(a))
  for (let i = 0; i < 300; i++) stepBattle(a)
  for (let i = 0; i < 100; i++) enemyToCombatant(BLACKMOSS.enemyGroups[Object.keys(BLACKMOSS.enemyGroups)[0]][0])
  for (let i = 0; i < 300; i++) stepBattle(b)
  expect(JSON.stringify(b)).toBe(JSON.stringify(a))
  expect(a.combatants.some(c => c.petOf)).toBe(true)
  expect(a.events.filter(e => e.type === 'summoned').length).toBeGreaterThan(1)
  // 临终呼援也必须通过同一场的序号分配，不能重新用 c1。
  const x = JSON.parse(JSON.stringify(a)), y = JSON.parse(JSON.stringify(a))
  const callSeed = [1, 2, 3, 4, 5, 6, 7, 8].find(seed => createRng(seed)() < 0.3)!
  expect(callSeed).toBeDefined()
  for (const state of [x, y]) {
    const victim = state.combatants.find((c: any) => c.team === 'enemy')!
    victim.traits = ['call-reinforce']; state.rngState = callSeed
    applyHit(state, state.combatants[0], victim, victim.hp + 1, '探针')
  }
  expect(JSON.stringify(x)).toBe(JSON.stringify(y))
  expect(x.combatants.length).toBe(a.combatants.length + 1)
  expect(new Set(x.combatants.map((c: any) => c.id)).size).toBe(x.combatants.length)
})

test('待选/已选事件、待出发与延迟后果是存档数据；访客身份和重名避让一并续接', () => {
  const s = save(), event = GUILD_EVENTS[0]
  s.runState = { ...s.runState, eventId: event.id, pendingDeparture: 'go',
    pendingConsequence: { eventId: event.id, dueDay: 9 }, autoLoop: true }
  const waiting = refresh(s)
  expect(waiting.runState.eventResult).toBeNull()
  waiting.runState.eventResult = '报酬已到账'
  waiting.runState.eventImpacts = [{ t: '金币 +40', tone: 'pos' }]; waiting.gold += 40
  waiting.visitor = rollVisitor(createRng(7), resolved(waiting))
  waiting.generationState = memberGenerationState()
  const paid = refresh(waiting)
  expect(paid.gold).toBe(940); expect(paid.visitor).toEqual(waiting.visitor)
  const rng = createStatefulRng(paid.rngState), generation = memberGenerationState()
  const next = rollVisitor(rng, resolved(paid))
  const expectedRng = rng.state()
  restoreMemberGeneration(generation)
  const resumedRng = createStatefulRng(paid.rngState)
  expect(rollVisitor(resumedRng, resolved(paid))).toEqual(next)
  expect(resumedRng.state()).toBe(expectedRng)
})

test('真实 v20 注册表逐级升 v22：公会资产、UID/序号、公会随机数不变，账本为空、初始化无活动远征', () => {
  const data: any = save()
  data.version = 20; delete data.runState; delete data.visitor; delete data.generationState
  const before = JSON.stringify(data), upgraded = migrate(data)
  expect(upgraded.version).toBe(SAVE_VERSION)
  for (const key of Object.keys(data).filter(k => k !== 'version' && k !== 'members')) expect((upgraded as any)[key]).toEqual(data[key])
  // R5.3d:v26 给在世成员合法补 weaponLearned——除该字段外逐字段相等
  for (const am of (upgraded as any).members) {
    const dm = data.members.find((x: { id: string }) => x.id === am.id)
    const { weaponLearned: _wl, ...rest } = am
    expect(rest).toEqual(dm)
  }
  expect(JSON.stringify(data)).toBe(before)
  expect(upgraded.runState).toEqual(initialRunState()); expect(upgraded.generationState).toBeNull()
  expect(refresh(upgraded)).toEqual(upgraded)
})

test('旧人物分支 v23 回城/steps 途中档迁移保留资产；失效路线撤回一次且不返还已用药水', () => {
  for (const active of [false, true]) {
    const data: any = save()
    data.version = 23
    delete data.runState.lastNodeResult
    data.runState.lastBranch = 'shortcut'
    data.factLedger = { nextId: 2, toldThrough: 1, expeditionStart: 1, facts: [] }
    data.visitor = rollVisitor(createRng(7), resolved(data))
    data.chronicle = [{ day: 8, text: '原有远征记录' }]
    if (active) {
      const r: any = createRun(resolved(data), BLACKMOSS, 53, 0, false, data.potions)
      // 1c1ab0c 的持久形态：steps/stepIdx，而非分层地图；同样的 v23 标签。
      for (const k of ['map', 'path', 'nodeId', 'battlesFought', 'conditions']) delete r[k]
      Object.assign(r, { steps: BLACKMOSS.encounters.map(e => e.id), stepIdx: 0,
        routeTaken: ['shortcut'], nodeIds: [], eliteAt: [], phase: 'battle',
        battle: createBattle(resolved(data), BLACKMOSS, BLACKMOSS.encounters[0].id, 53) })
      r.battle.commands.autoMode = true // U41 手动模式适配(r 引用)
      r.battle.commands.healStock = 2; r.battle.commands.furyStock = 1
      data.runState.activeRun = r; data.runState.playing = true; data.runState.autoLoop = true
    }
    const original = JSON.stringify(data)
    const loaded = importSave(exportSave(data))!
    expect(loaded).not.toBeNull()
    for (const k of ['gold', 'blessing', 'starMarrow', 'items', 'chronicle', 'factLedger', 'visitor', 'dungeonMastery']) {
      expect((loaded as any)[k]).toEqual(data[k])
    }
    expect(loaded.members.map(m => ({ id: m.id, hp: m.hp, equipment: m.equipment })))
      .toEqual(data.members.map((m: any) => ({ id: m.id, hp: m.hp, equipment: m.equipment })))
    expect(loaded.runState.activeRun).toBeNull()
    expect(loaded.runState.lastNodeResult).toBeNull()
    expect(loaded.runState.playing).toBe(false)
    expect(loaded.runState.autoLoop).toBe(false)
    expect(loaded.runState.notices.filter(n => n.includes('旧版远征路线')).length).toBe(active ? 1 : 0)
    expect(loaded.potions).toEqual(active ? { heal: 2, fury: 1 } : data.potions)
    expect(importSave(exportSave(loaded))).toEqual(loaded)
    expect(JSON.stringify(data)).toBe(original)
  }
})

test('v30 当前副本和高塔原样续接；缺图但没有旧 steps 的损坏新档仍拒绝', () => {
  for (const kind of ['dungeon', 'tower'] as const) {
    const s = save()
    s.runState.activeRun = kind === 'tower' ? startTower(resolved(s), 53, s.potions)
      : createRun(resolved(s), BLACKMOSS, 53, 0, false, s.potions)
    const old = { ...s, version: 30 }
    const loaded = importSave(exportSave(old))!
    expect(loaded.runState).toEqual(s.runState)
    expect(loaded.gold).toBe(s.gold)
    if (kind === 'dungeon') {
      const broken = JSON.parse(JSON.stringify(old))
      delete broken.runState.activeRun.map
      expect(importSave(exportSave(broken))).toBeNull()
    }
  }
})

test('坏远征断点不能覆盖资产：拒绝导入；有效备份恢复；双坏档保留，只有确认导入可解除保护', () => {
  const good = save()
  good.runState.activeRun = startTower(resolved(good), 3, good.potions)
  expect(saveGuild(good)).toBe(true)
  const raw = storage.get(KEY)!
  for (const change of [
    (s: any) => { s.runState.activeRun.memberIds[0] = '不存在' },
    (s: any) => { s.runState.activeRun.rngState = -1 },
    (s: any) => { s.runState.activeRun.battle.unitSeq = 0 },
    (s: any) => { s.runState.activeRun.battle.combatants[1].id = s.runState.activeRun.battle.combatants[0].id },
    (s: any) => { s.runState.eventId = '已删除的事件' },
    (s: any) => { s.visitor = { story: '坏访客', member: {} } },
  ]) {
    const bad = JSON.parse(raw); change(bad)
    expect(importSave(exportSave(bad))).toBeNull()
    expect(storage.get(KEY)).toBe(raw)
  }
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    storage.set(KEY + '.bak', raw); storage.set(KEY, '{broken')
    expect(loadGuildSave()!.runState).toEqual(good.runState)
    expect(saveLoadNotice()).toContain('备份')
    expect(saveGuild(good)).toBe(true); expect(storage.get(KEY + '.bak')).toBe(raw)
    storage.set(KEY, 'bad-primary'); storage.set(KEY + '.bak', 'bad-backup')
    expect(loadGuildSave()).toBeNull()
    const preview = importSave(exportSave(good))!
    expect(saveGuild(preview)).toBe(false)
    expect(storage.get(KEY)).toBe('bad-primary'); expect(storage.get(KEY + '.bak')).toBe('bad-backup')
    expect(replaceGuildSave(preview)).toBe(true)
    expect(loadGuildSave()!.runState).toEqual(good.runState)
    expect(saveLoadNotice()).toBe('')
  } finally { warn.mockRestore() }
})

test('当前版坏账本导入局部修复，保留资产/远征/延迟来源且编号不复用', () => {
  const s = save()
  s.runState.activeRun = createRun(resolved(s), BLACKMOSS, 53)
  const choice = appendFact(s.factLedger, 2, {kind:'event-choice',actors:[],refs:{eventId:'dragon-egg'}})!
  s.pendingConsequences = [{eventId:'egg-hatch',dueDay:9,originFactId:choice.id}]
  ;(s.factLedger.facts as any[]).push({id:18,day:3,kind:'death',actors:['old'],refs:{},cause:{}}, {id:19,day:3,kind:'unknown',actors:[],refs:{}})
  const loaded = importSave(exportSave(s))!
  expect(loaded).not.toBeNull()
  expect(loaded.gold).toBe(s.gold); expect(loaded.items).toEqual(s.items)
  expect(loaded.members).toEqual(s.members); expect(loaded.runState).toEqual(s.runState)
  expect(loaded.pendingConsequences).toEqual(s.pendingConsequences)
  expect(loaded.factLedger.facts).toEqual([choice])
  expect(appendFact(loaded.factLedger, 8, {kind:'wish-done',actors:[],refs:{}})!.id).toBeGreaterThan(19)
})

test('已弹出后果的非法来源局部降级，队列与弹窗可匹配消费', () => {
  const s = save()
  s.pendingConsequences = [{eventId:'egg-hatch',dueDay:9,originFactId:{bad:true} as any}]
  s.runState.eventId = 'egg-hatch'
  s.runState.pendingConsequence = {...s.pendingConsequences[0]}
  const loaded = importSave(exportSave(s))!
  expect(loaded).not.toBeNull()
  expect(loaded.pendingConsequences).toEqual([{eventId:'egg-hatch',dueDay:9}])
  expect(loaded.runState.pendingConsequence).toEqual(loaded.pendingConsequences![0])
  expect(loaded.gold).toBe(s.gold); expect(loaded.members).toEqual(s.members)
})
