import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ItemArt, ItemLore, ITEM_QUALITY_NAME } from '../art/ItemArt'
import { HeroPortrait } from '../art/ArtCanvas'
import { sceneArt } from '../art/catalog'
import { loadArt } from '../art/assetLoader'
import { paintScene } from '../art/scene'
import { ITEM_BASES } from '../../data/items'
import { JOBS, specOf } from '../../data/jobs'
import { HYBRIDS, isHybrid } from '../../data/vocations'
import { ECONOMY } from '../../data/economy'
import type { Member, ItemInstance } from '../../sim/types'
import type { DungeonRun } from '../../sim/run'
import type { GrowthSnapshot } from './resultPresentation'
import type { FactLedger } from '../../sim/fact-ledger'
import { xpNeeded } from '../../sim/gen'
import { powerScore } from '../../sim/combat'
import { runMembers, runDungeon } from '../../sim/run-core'
import { describeItem } from '../../sim/loot'
import { scarStatName } from '../../sim/scars'
import { resultFacts, resultBonds } from './resultPresentation'
import { Meter } from '../Meter'
import { Tooltip } from '../Tooltip'

interface ResultScreenProps {
  run: DungeonRun
  dungeonName: string
  members: Member[]
  snapshot: Map<string, GrowthSnapshot>
  drops: ItemInstance[]
  ledger: FactLedger
  day: number
  notices?: string[]
  commissions?: string[]
  story: string | null
  onBack: () => void
  onAgain?: () => void
}

function ResultBackdrop({ dungeonId }: { dungeonId: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let cancelled = false
    const art = sceneArt(dungeonId)
    Promise.all([art.floor, art.wall, ...art.props, '/assets/tiles/floor-pebble.png'].map(loadArt)).then(() => {
      if (!cancelled && canvas.current) paintScene(canvas.current.getContext('2d')!, 640, 360, dungeonId, 32)
    })
    return () => { cancelled = true }
  }, [dungeonId])
  return <canvas className="rs-backdrop" width={640} height={360} ref={canvas} aria-hidden="true" />
}

const PAGE_SIZE = 12
export function ResultScreen({ run, dungeonName, members, snapshot, drops, ledger, day, story, notices = [], commissions = [], onBack, onAgain }: ResultScreenProps) {
  const party = runMembers(run, members)
  const survivors = party.filter(m => m.alive)
  const facts = resultFacts(run, ledger)
  const kills = facts.filter(f => f.kind === 'first-kill')
  const bossNames = [...new Set(kills.map(f => runDungeon(run).encounters.find(e => e.bossId === f.refs.bossId)?.name).filter(Boolean))]
  const win = run.phase === 'victory', dead = run.phase === 'defeat'
  const cost = run.phase === 'retreated' ? run.retreatCost : undefined
  const records = notices.filter(n => n !== story)
  const storyText = story?.replace(/^📖\s*/, '')
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(drops.length / PAGE_SIZE))
  const [detail, setDetail] = useState<{ title: string; body: ReactNode } | null>(null)
  const main = useRef<HTMLDivElement>(null)
  const detailPanel = useRef<HTMLElement>(null)
  const backButton = useRef<HTMLButtonElement>(null)
  useEffect(() => { backButton.current?.focus() }, [])
  useEffect(() => {
    if (!detail) return
    const previous = document.activeElement as HTMLElement | null
    detailPanel.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => { previous?.focus() }
  }, [detail])
  const keyDown = (e: KeyboardEvent) => {
    // 结算拥有键盘焦点，避免大厅快捷键在底下打开其它页面。
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); if (detail) setDetail(null); else onBack() }
    if (e.key !== 'Tab') return
    const panel = detail ? detailPanel.current : main.current
    const buttons = [...(panel?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]') ?? [])].filter(b => b.offsetWidth)
    const first = buttons[0], last = buttons[buttons.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
    if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
  }
  const openRecords = () => setDetail({ title: '终局记录', body: <>
    <p className="rs-muted">最后一场战斗与回程结算的通知；完整旅程保存在公会大事记。</p>
    {records.length ? records.map((n, i) => <p key={i}>{n}</p>) : <p>没有额外通知。</p>}
    {!!commissions.length && <><h3>王国委托</h3>{commissions.map(c => <p key={c}>{c}</p>)}</>}
  </> })
  return <section className={`result-screen ${dead ? 'rs-defeat' : win ? 'rs-victory' : 'rs-retreated'}`} role="dialog" aria-modal="true" aria-label="远征结算" onKeyDown={keyDown}>
    <ResultBackdrop dungeonId={run.dungeonId} />
    <div className="rs-veil" />
    <div className="rs-content" ref={main} {...(detail ? { inert: '' } : {})} aria-hidden={detail ? true : undefined}>
      <header className="rs-header">
        <h1>{win ? '讨伐完成' : dead ? '远征失利' : '撤退归来'}</h1>
        <p className="rs-subtitle">{dungeonName} · 第 {day} 日 · 历经 {run.battlesFought} 场战斗</p>
        <p className="rs-outcome">{win ? '战利品已入仓库' : dead ? '阵亡者已入纪念堂，留下的装备与记录仍在' : '已获装备保留，幸存者带着经历归来'} · {party.length} 人出征 / {survivors.length} 人生还</p>
        {kills.length > 0 && <Tooltip content={<><strong>本趟首次击败</strong>{bossNames.join('、')}</>}>
          <button className="rs-first-kill" aria-label={'本趟首杀：' + bossNames.join('、')} onClick={() => setDetail({ title: '本趟首杀', body: <p>{bossNames.join('、')}</p> })}><b>首杀</b><small>公会初捷</small></button>
        </Tooltip>}
      </header>

      <div className="rs-columns">
        <section className={'rs-party' + (party.length > 3 ? ' rs-party-dense' : '')} aria-label="远征队回顾">
          <h2 className="rs-heading">小队 <small>{survivors.length} 人生还{party.length > survivors.length ? ` · ${party.length - survivors.length} 人阵亡` : ''}</small></h2>
          <div className="rs-roster">{party.map(m => {
            const before = snapshot.get(m.id), power = powerScore(m)
            const bonds = resultBonds(m, survivors, before)
            const wishDone = facts.some(f => f.kind === 'wish-done' && f.actors.includes(m.id))
            const scars = m.scars ?? []
            const scarLines = scars.map((s, i) => `${facts.some(f => f.kind === 'scar' && f.actors.includes(m.id) && f.refs.scarNth === i + 1) ? '本趟新伤' : '现有创伤'}：${s.text}（${s.faint ? '虚痕，不减属性' : scarStatName(s.stat) + ' −' + s.value}）`)
            const notes = [...scarLines, ...(wishDone ? ['本趟心愿达成'] : []), ...bonds]
            const openMember = () => setDetail({ title: m.name + ' · 远征回顾', body: <>
              <p>{m.alive ? '生还' : '已阵亡'} · {JOBS[m.job].name} · {(isHybrid(m.spec) ? HYBRIDS[m.spec!].name : specOf(m.job, m.spec).name)}</p>
              <p>等级 {before ? before.level + ' → ' : ''}{m.level} · 战力 {before ? before.power + ' → ' : ''}{power}</p>
              {!before && <p className="rs-muted">未保留出征前快照，仅展示当前状态。</p>}
              <p>当前经验 {m.exp} / {xpNeeded(m.level)}</p>
              {notes.map((n, i) => <p key={i}>{n}</p>)}
              {!scars.length && <p>当前无创伤。</p>}
              {m.wish && <p>当前心愿：{m.wish.text}</p>}
            </> })
            return <article className={'rs-member' + (m.alive ? '' : ' rs-fallen')} key={m.id}>
              <div className="rs-portrait"><HeroPortrait member={m} size={party.length > 3 ? 80 : 104} />
                {!m.alive ? <span>已阵亡</span> : before && m.level > before.level ? <span className="rs-level-up">升至 Lv{m.level}</span> : null}
              </div>
              <div className="rs-member-body">
                <div className="rs-member-head"><h3>{m.name}</h3><span>{(isHybrid(m.spec) ? HYBRIDS[m.spec!].name : specOf(m.job, m.spec).name)} · Lv{m.level}</span><button onClick={openMember} aria-label={'查看' + m.name + '的远征回顾'}>详情</button></div>
                <div className="rs-member-stats"><span>等级 {before && before.level !== m.level ? before.level + ' → ' : ''}{m.level}</span><span>战力 {before && before.power !== power ? before.power + ' → ' : ''}{power}</span><span>当前经验 {m.exp} / {xpNeeded(m.level)}</span></div>
                <Meter value={m.exp} max={xpNeeded(m.level)} aria-label={m.name + '当前经验'} />
                <p className={'rs-member-note' + (scars.length ? ' rs-cost' : '')}>{notes[0] ?? (m.alive ? '当前无创伤' : '事迹留在纪念堂')}{notes.length > 1 && <span className="rs-muted"> · 另 {notes.length - 1} 项，见详情</span>}</p>
              </div>
            </article>
          })}</div>
        </section>

        <section className="rs-rewards" aria-label="战利品与代价">
          <h2 className="rs-heading">战利品 <small>{drops.length} 件 · 已入仓库</small></h2>
          <div className="rs-loot-area">
            {drops.length ? <div className="rs-loot-grid">{drops.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(item => {
              const base = ITEM_BASES[item.baseId]
              const content = <><strong>{base.name}</strong><p>{describeItem(item)}</p><ItemLore baseId={item.baseId} /></>
              return <Tooltip key={item.id} content={content}><button className="rs-loot" data-quality={item.quality ?? 'white'} aria-label={ITEM_QUALITY_NAME[item.quality ?? 'white'] + ' · ' + base.name} onClick={() => setDetail({ title: base.name, body: content })}>
                <ItemArt item={item} slot={base.slot} size={48} /><small>{base.name}</small>
              </button></Tooltip>
            })}</div> : <p className="rs-no-loot">本趟未获得装备<span>成长与经历仍会留下。</span></p>}
          </div>
          <nav className="rs-loot-pages" aria-label="战利品翻页">
            <span>悬停查看属性 · 点击展开</span>
            {pages > 1 && <><button disabled={page === 0} onClick={() => setPage(p => p - 1)} aria-label="上一页战利品">上一页</button><span aria-live="polite">{page + 1} / {pages}</span><button disabled={page === pages - 1} onClick={() => setPage(p => p + 1)} aria-label="下一页战利品">下一页</button></>}
          </nav>
          <dl className="rs-tally">
            <div><dt>战斗与宝箱金币 <small>已入账</small></dt><dd>{run.earnedGold === undefined ? '未记录' : '+' + run.earnedGold + ' 金'}</dd></div>
            {win && <div><dt>通关奖励 <small>已入账</small></dt><dd>+{ECONOMY.clearBonus} 金</dd></div>}
            {cost && <div className="rs-cost"><dt>撤退代价 <small>已扣除</small></dt><dd>−{cost.gold} 金 / −{cost.mastery} 熟练度</dd></div>}
            <div><dt>出征补给</dt><dd className="rs-muted">出发时结算 · 金额未留存</dd></div>
            <div className={run.maintenanceDue ? 'rs-cost' : ''}><dt>装备维护 <small>回城支付</small></dt><dd>{run.maintenanceDue ?? 0} 金</dd></div>
            <div><dt>剩余药水 <small>回城退回</small></dt><dd>治疗 {run.potions.heal} / 狂暴 {run.potions.fury}</dd></div>
          </dl>
          <p className="rs-finance-note">仅列可追溯收支，未合计本趟净收益。</p>
          <button className="rs-records-link" onClick={openRecords}>终局记录 · {records.length} 条{commissions.length ? ` / 委托 ${commissions.length} 项` : ''} <span>查看 →</span></button>
        </section>
      </div>

      <div className="rs-story">
        {storyText ? <><p>{storyText}</p><button onClick={() => setDetail({ title: '说书人的记录', body: <p>{storyText}</p> })}>已记入大事记 · 阅读全文</button></> : <p className="rs-muted">这一趟的经历，留在每个人身上。</p>}
      </div>
      <footer className="rs-actions">
        <button className="primary rs-back" ref={backButton} onClick={onBack}>返回公会</button>
        {win && onAgain && <button className="rs-again" onClick={onAgain}>再次出征 · {dungeonName}</button>}
        <small>Esc 返回公会</small>
      </footer>
    </div>
    {detail && <div className="rs-detail-backdrop"><section className="rs-detail" ref={detailPanel} role="dialog" aria-modal="true" aria-label={detail.title}>
      <header><h2>{detail.title}</h2><button onClick={() => setDetail(null)}>关闭 · Esc</button></header>
      <div className="rs-detail-body" tabIndex={0}>{detail.body}</div>
    </section></div>}
  </section>
}
