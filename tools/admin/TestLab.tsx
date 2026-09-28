import { useEffect, useRef, useState } from 'react'
import { DUNGEONS } from '../../src/data/dungeons'
import { ITEM_BASES } from '../../src/data/items'
import { JOBS } from '../../src/data/jobs'
import { HYBRIDS } from '../../src/data/vocations'
import { BattleRenderer } from '../../src/ui/battle/BattleRenderer'
import { bossIntents } from '../../src/sim/mechanics'
import { STANCE_NAME, TICK_HARD_CAP, TICK_MS, setFocus, setStance, stepBattle, useFuryPotion, useHealPotion } from '../../src/sim/combat'
import type { BattleState, ItemQuality, JobId, Slot, Stance } from '../../src/sim/types'
import { SLOTS, createLabBattle, defaultConfig, defaultMember, labResults, labSkills, labSpec, loadLab, normalizeConfig, saveLab } from './lab'
import type { LabConfig, LabMember } from './lab'

const SLOT_NAMES: Record<Slot, string> = { weapon: '武器', armor: '护甲', trinket: '饰品' }
const EQUIPMENT_TIERS = [0, ...new Set(Object.values(ITEM_BASES).map(item => item.tier))].sort((a, b) => a - b)
const STATUS = { running: '战斗进行中', 'guild-win': '测试胜利', 'guild-wipe': '测试团灭', retreated: '已撤退' }
function initialConfig() {
  try { return loadLab(window.localStorage) } catch { return { config: defaultConfig(), warning: '浏览器存储不可用，配置仅在本页保留。' } }
}

export function TestLab() {
  const [initial] = useState(initialConfig)
  const [config, setConfig] = useState(initial.config)
  const [notice, setNotice] = useState(initial.warning)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [report, setReport] = useState('')
  const [, refresh] = useState(0)
  const stage = useRef<HTMLDivElement>(null)
  const renderer = useRef<BattleRenderer | null>(null)
  const runRef = useRef<ReturnType<typeof createLabBattle> | null>(null)
  const cursor = useRef(0)
  const run = runRef.current
  const battle = run?.battle
  const dungeon = DUNGEONS.find(d => d.id === config.dungeonId)!
  const intents = battle ? bossIntents(battle) : null
  const dirty = run && JSON.stringify(config) !== JSON.stringify(run.config)

  function sync(animate = true) {
    const current = runRef.current
    if (!current) return
    renderer.current?.setBattle(current.battle, animate ? current.battle.events.slice(cursor.current) : [])
    cursor.current = current.battle.events.length
    refresh(value => value + 1)
  }
  function command(action: (state: BattleState) => void) {
    const current = runRef.current?.battle
    if (!current || current.status !== 'running') return
    action(current)
    sync()
  }
  function advance(count: number, animate = true) {
    const current = runRef.current?.battle
    if (!current) return
    for (let i = 0; i < count && current.status === 'running'; i++) stepBattle(current)
    if (current.status !== 'running') setPlaying(false)
    sync(animate)
  }
  function start(input: LabConfig) {
    setPlaying(false)
    setReport('')
    const next = createLabBattle(input)
    runRef.current = next
    cursor.current = 0
    renderer.current?.setMembers(next.members)
    renderer.current?.setTheme(next.config.dungeonId)
    sync(false)
  }
  useEffect(() => {
    const view = new BattleRenderer()
    renderer.current = view
    view.mount(stage.current!).catch(() => setNotice('战场画面加载失败；下方单位、技能和战报仍可用于测试。'))
    view.onUnitClick = unit => { if (unit.alive && unit.team === 'enemy') command(state => setFocus(state, unit.id)) }
    return () => { view.destroy(); renderer.current = null }
  }, [])
  useEffect(() => {
    try {
      if (!saveLab(window.localStorage, config)) setNotice('配置保存失败，请导出测试报告留存；正常公会不受影响。')
    } catch { setNotice('浏览器存储不可用，配置仅在本页保留。') }
  }, [config])
  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => advance(speed), TICK_MS)
    return () => window.clearInterval(timer)
  }, [playing, speed])

  function patchMember(index: number, patch: Partial<LabMember>) {
    setConfig(previous => ({ ...previous, party: previous.party.map((member, i) => i === index ? { ...member, ...patch } : member) }))
  }
  function equipTier(index: number, tier: number) {
    const equipment = { weapon: '', armor: '', trinket: '' }
    for (const slot of SLOTS) equipment[slot] = Object.values(ITEM_BASES).find(item => item.tier === tier && item.slot === slot)?.id ?? ''
    patchMember(index, { equipment })
  }
  function exportReport() {
    if (!run) return
    setReport(JSON.stringify({ tool: 'blackmoss-admin-lab', version: 1, config: run.config,
      result: { status: run.battle.status, seconds: run.battle.tick / 10, members: labResults(run.battle),
        interrupts: run.battle.events.filter(e => e.type === 'interrupted').length },
      log: run.battle.log, events: run.battle.events }, null, 2))
  }

  return <main className="admin-lab">
    <header className="lab-header">
      <div><p className="lab-eyebrow">BLACKMOSS · ADMIN LAB</p><h1>管理员战斗实验室</h1></div>
      <span className="lab-badge">独立本机工具</span>
    </header>
    <p className="lab-intro">直接验证关卡、队伍与技能。测试不产生奖励、不消耗公会资源，也不读写正式存档。</p>
    {notice && <p role="status" className="lab-notice">{notice}</p>}
    <section className="lab-panel" aria-labelledby="lab-config-title">
      <h2 id="lab-config-title">测试配置</h2>
      <fieldset disabled={playing}>
        <div className="lab-fields">
          <label>测试档名称<input value={config.name} maxLength={32} onChange={e => setConfig({ ...config, name: e.target.value })} /></label>
          <label>关卡<select value={config.dungeonId} onChange={e => {
            const next = DUNGEONS.find(d => d.id === e.target.value)!
            setConfig({ ...config, dungeonId: next.id, encounterId: next.encounters.find(enc => enc.bossId)?.id ?? next.encounters[0].id })
          }}>{DUNGEONS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
          <label>遭遇<select value={config.encounterId} onChange={e => setConfig({ ...config, encounterId: e.target.value })}>
            {dungeon.encounters.map(enc => <option key={enc.id} value={enc.id}>{enc.bossId ? '首领 · ' : '杂兵 · '}{enc.name}</option>)}
          </select></label>
          <label>战斗种子<input type="number" min={0} max={4294967295} value={config.seed} onChange={e => setConfig({ ...config, seed: Math.min(4294967295, Math.max(0, Number(e.target.value))) })} /></label>
        </div>
        <label className="lab-check"><input type="checkbox" checked={config.protect} onChange={e => setConfig({ ...config, protect: e.target.checked })} />濒危自动撤退保护</label>
        <p className="lab-help">本图常规编制 {dungeon.size} 人；测试可选 1–6 人。人物使用固定人类样本，装备词条固定抽样；改变战斗种子只影响战斗随机。配置自动保存，进行中的战斗不会保存。</p>
        <div className="lab-party">
          {config.party.map((member, index) => <details key={index} className="lab-member" open={index === 0 ? true : undefined}>
            <summary>试员 {index + 1} · {labSpec(member).name} · Lv{member.level}</summary>
            <div className="lab-fields">
              <label>职业 {index + 1}<select value={member.job} onChange={e => {
                const job = e.target.value as JobId
                patchMember(index, { job, spec: JOBS[job].defaultSpec, advanced: '', cooldowns: {}, disabledSkills: [] })
              }}>{Object.values(JOBS).map(job => <option key={job.id} value={job.id}>{job.name}</option>)}</select></label>
              <label>专精 {index + 1}<select value={member.spec} onChange={e => patchMember(index, { spec: e.target.value, advanced: '', cooldowns: {}, disabledSkills: [] })}>
                {Object.values(JOBS[member.job].specs).map(spec => <option key={spec.id} value={spec.id}>{spec.name}</option>)}
                {Object.values(HYBRIDS).filter(h => h.lines.includes(member.job)).map(h => <option key={h.id} value={h.id}>混合 · {h.name}</option>)}
              </select></label>
              <label>等级 {index + 1}<input type="number" min={1} max={15} value={member.level} onChange={e => patchMember(index, { level: Math.min(15, Math.max(1, Number(e.target.value))) })} /></label>
              <label>精进技能 {index + 1}<select disabled={member.level < 6} value={member.level >= 6 ? member.advanced : ''} onChange={e => patchMember(index, { advanced: e.target.value, cooldowns: {}, disabledSkills: [] })}>
                <option value="">不选精进（6 级起可选）</option>
                {labSpec(member).advancedSkills?.map(skill => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
              </select></label>
            </div>
            <div className="lab-actions" aria-label={`试员 ${index + 1} 装备预设`}>
              {EQUIPMENT_TIERS.map(tier => <button key={tier} onClick={() => equipTier(index, tier)}>{tier ? `全套 T${tier}` : '卸下装备'}</button>)}
            </div>
            <div className="lab-fields">
              {SLOTS.map(slot => <label key={slot}>{SLOT_NAMES[slot]} {index + 1}<select value={member.equipment[slot]} onChange={e => patchMember(index, { equipment: { ...member.equipment, [slot]: e.target.value } })}>
                <option value="">无装备</option>
                {Object.values(ITEM_BASES).filter(item => item.slot === slot).map(item => <option key={item.id} value={item.id}>T{item.tier} · {item.name}</option>)}
              </select></label>)}
              <label>品质 {index + 1}<select value={member.quality} onChange={e => patchMember(index, { quality: e.target.value as ItemQuality })}>
                <option value="white">普通</option><option value="green">精良</option><option value="purple">史诗</option>
              </select></label>
            </div>
            <p className="lab-help">技能按实际专精自动释放。可以单独禁用，或试验冷却；仅影响本次测试，不修改游戏技能表。</p>
            {labSkills(member).map(skill => <div className="lab-skill-config" key={skill.id}>
              <label className="lab-check"><input type="checkbox" checked={!member.disabledSkills.includes(skill.id)} onChange={e => patchMember(index, {
                disabledSkills: e.target.checked ? member.disabledSkills.filter(id => id !== skill.id) : [...member.disabledSkills, skill.id],
              })} />{skill.name}</label>
              <label>{skill.name}冷却（秒）<input type="number" min={0.1} max={60} step={0.1} value={(member.cooldowns[skill.id] ?? skill.cooldownTicks) / 10}
                onChange={e => patchMember(index, { cooldowns: { ...member.cooldowns, [skill.id]: Math.max(1, Math.min(600, Math.round(Number(e.target.value) * 10))) } })} /></label>
              <span className="lab-help">默认 {skill.cooldownTicks / 10}s</span>
            </div>)}
            <div className="lab-actions">
              <button onClick={() => patchMember(index, { cooldowns: {}, disabledSkills: [] })}>还原技能设置</button>
              <button disabled={config.party.length <= 1} onClick={() => setConfig({ ...config, party: config.party.filter((_, i) => i !== index) })}>移出试员 {index + 1}</button>
            </div>
          </details>)}
        </div>
        <button disabled={config.party.length >= 6} onClick={() => setConfig({ ...config, party: [...config.party, defaultMember()] })}>＋ 添加试员（{config.party.length}/6）</button>
      </fieldset>
      <div className="lab-actions">
        <button className="primary" onClick={() => { const next = normalizeConfig(config); setConfig(next); start(next) }}>应用配置并备战</button>
        <button disabled={!run} onClick={() => { if (run) start(run.config) }}>同条件重战</button>
        <span className="lab-help">{dirty ? '配置已改动，尚未应用到战斗。' : '每次备战恢复满血、药水与冷却。'}</span>
      </div>
    </section>

    <section className="lab-panel" aria-labelledby="lab-battle-title">
      <h2 id="lab-battle-title">{run ? `${DUNGEONS.find(d => d.id === run.config.dungeonId)!.encounters.find(e => e.id === run.config.encounterId)!.name} · ${STATUS[run.battle.status]}` : '战斗观察台'}</h2>
      <div className="lab-actions">
        <button disabled={!battle || battle.status !== 'running'} onClick={() => setPlaying(!playing)}>{playing ? '暂停' : '开始 / 继续'}</button>
        <button disabled={!battle || playing || battle.status !== 'running'} onClick={() => advance(1)}>单步 0.1 秒</button>
        <button disabled={!battle || playing || battle.status !== 'running'} onClick={() => advance(10)}>推进 1 秒</button>
        <button disabled={!battle || playing || battle.status !== 'running'} onClick={() => advance(TICK_HARD_CAP + 1, false)}>快速结算</button>
        <label>播放速度<select value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value={1}>1 倍</option><option value={2}>2 倍</option><option value={5}>5 倍</option></select></label>
        <strong aria-live="off">{battle ? `${(battle.tick / 10).toFixed(1)} 秒` : '等待备战'}</strong>
      </div>
      <div className="lab-stage-scroll"><div ref={stage} className="lab-stage" /></div>
      {battle && <>
        <div className="lab-actions">
          {(Object.keys(STANCE_NAME) as Stance[]).map(stance => <button key={stance} aria-pressed={battle.commands.stance === stance} onClick={() => command(b => setStance(b, stance))}>{STANCE_NAME[stance]}</button>)}
          {intents?.casting && <button className="primary" onClick={() => command(b => setFocus(b, intents.casterId))}>集火打断咏唱</button>}
          <button onClick={() => command(b => setFocus(b, undefined))}>取消集火</button>
          <button onClick={() => command(useHealPotion)}>治疗药 ×{battle.commands.healStock}</button>
          <button onClick={() => command(useFuryPotion)}>爆发药 ×{battle.commands.furyStock}</button>
          <button aria-pressed={battle.commands.autoMode} onClick={() => command(b => { b.commands.autoMode = !b.commands.autoMode })}>自动指挥：{battle.commands.autoMode ? '开' : '关'}</button>
        </div>
        <p className="lab-help">{intents?.telegraphing ? '范围攻击蓄力中，可切分散应对。' : '点击敌人或下方目标按钮集火；窄屏可横向查看战场。'} 技能冷却在单位可行动时才检查，并非归零就立即释放。</p>
        <div className="lab-targets">{battle.combatants.filter(c => c.team === 'enemy').map(unit => <button key={unit.id} disabled={!unit.alive || battle.status !== 'running'} aria-pressed={battle.commands.focusId === unit.id} onClick={() => command(b => setFocus(b, unit.id))}>
          {unit.name} · {unit.hp}/{unit.maxHp}
        </button>)}</div>
        <div className="lab-units">{battle.combatants.filter(c => c.team === 'guild').map(unit => <article key={unit.id}>
          <h3>{unit.name} {!unit.alive && '· 阵亡'}</h3><p>生命 {unit.hp}/{unit.maxHp} · 攻击 {unit.attack} · 防御 {unit.defense}</p>
          {unit.skills.map(skill => <p key={skill.def.id}>{skill.def.name} · 剩余 {(Math.max(0, skill.cooldownLeft) / 10).toFixed(1)}s / 冷却 {skill.def.cooldownTicks / 10}s</p>)}
        </article>)}</div>
        <div className="lab-table-scroll"><table><caption>本场记录 · 命中伤害含过量，反击不并入；治疗按引擎事件记录</caption><thead><tr><th>单位</th><th>命中伤害</th><th>治疗记录</th><th>剩余生命</th></tr></thead>
          <tbody>{labResults(battle).map((row, index) => <tr key={index}><td>{row.name}</td><td>{row.damage}</td><td>{row.healing}</td><td>{row.hp}/{row.maxHp}</td></tr>)}</tbody></table></div>
        <h3>战斗日志</h3><div className="lab-log" role="log" aria-live="off">{battle.log.slice(-120).map((line, index) => <p key={`${line.tick}-${index}`}>[{(line.tick / 10).toFixed(1)}s] {line.text}</p>)}</div>
        <button onClick={exportReport}>生成测试报告</button>
        {report && <label className="lab-report">测试报告（可全选复制）<textarea readOnly value={report} /></label>}
      </>}
    </section>
  </main>
}
