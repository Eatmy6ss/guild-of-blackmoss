import { useEffect, useRef, useState } from 'react'
import { DUNGEONS } from '../../data/dungeons'
import { JOBS } from '../../data/jobs'
import { RACES } from '../../data/races'
import { ITEM_BASES } from '../../data/items'
import type { JobId, Slot } from '../../sim/types'
import { credits, MUSIC, SCENE_ART, SPRITE_PATHS } from './catalog'
import { assetUrl, loadArt } from './assetLoader'
import { HeroPortrait, ArtCanvas } from './ArtCanvas'
import { ItemArt } from './ItemArt'
import { BOSS_ART } from './enemyArt'
import { paintScene } from './scene'
import { CreditsContent } from './Credits'
function MapPreview({ id }: { id: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let disposed = false
    const draw = () => {
      if (disposed || !canvas.current) return
      const node = canvas.current
      node.width = Math.round(node.clientWidth); node.height = 300
      paintScene(node.getContext('2d')!, node.width, node.height, id)
    }
    const observer = new ResizeObserver(draw)
    if (canvas.current) observer.observe(canvas.current)
    Promise.all(SPRITE_PATHS.map(loadArt)).then(draw)
    return () => { disposed = true; observer.disconnect() }
  }, [id])
  return <canvas className="map-preview" ref={canvas} role="img" aria-label={SCENE_ART[id].name + '地区背景'} />
}
const TABS = { maps: '地域场景', heroes: '人物与装备', bosses: '首领与机制', sounds: '音乐与音效', credits: '素材与致谢' }
export function ResourceLibrary() {
  const [tab, setTab] = useState<keyof typeof TABS>('maps')
  const [map, setMap] = useState('blackmoss')
  const [race, setRace] = useState('human')
  const [gear, setGear] = useState({ weapon: '', armor: '' })
  const [quality, setQuality] = useState<'white' | 'green' | 'purple'>('white')
  const audio = useRef<HTMLAudioElement[]>([])
  useEffect(() => {
    const pause = () => { if (document.hidden) audio.current.forEach(element => element.pause()) }
    document.addEventListener('visibilitychange', pause)
    return () => { document.removeEventListener('visibilitychange', pause); audio.current.forEach(element => element.pause()) }
  }, [])
  return <main className="game-shell resource-library">
    <header className="library-header"><a href={assetUrl('index.html')}>← 黑苔公会</a><h1>公会素材图鉴</h1><p>沿用同一片像素世界，逐件积累人物、地域与声音。</p></header>
    <nav className="library-tabs" aria-label="素材类别">{Object.entries(TABS).map(([id, label]) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id as keyof typeof TABS)}>{label}</button>)}</nav>
    {tab === 'maps' && <section className="panel">
      <div className="map-list">{[...DUNGEONS.map(d => ({ id: d.id, name: d.name })), { id: 'tower', name: '黑苔高塔' }].map(d => <button key={d.id} aria-pressed={map === d.id} onClick={() => setMap(d.id)}>{d.name}</button>)}</div>
      <MapPreview id={map} />
      <div className="scene-caption"><strong>{SCENE_ART[map].name}</strong><span>同源32px地景 · 地形、远景与装饰按地区绑定</span></div>
    </section>}
    {tab === 'heroes' && <section className="panel">
      <div className="library-controls"><label>种族<select value={race} onChange={e => setRace(e.target.value)}>{Object.values(RACES).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        {(['weapon', 'armor'] as Slot[]).map(slot => <label key={slot}>{slot === 'weapon' ? '武器' : '护甲'}<select value={gear[slot as 'weapon' | 'armor']} onChange={e => setGear({ ...gear, [slot]: e.target.value })}><option value="">职业默认装束</option>{Object.values(ITEM_BASES).filter(i => i.slot === slot).map(i => <option value={i.id} key={i.id}>{i.name}</option>)}</select></label>)}
      </div>
      <div className="gear-preview"><label>品质纹饰<select value={quality} onChange={e => setQuality(e.target.value as typeof quality)}><option value="white">普通 ·</option><option value="green">精良 ▰</option><option value="purple">史诗 ◆</option></select></label>{(['weapon', 'armor'] as const).map(slot => <div className="preview-equipment" key={slot}>
        <ItemArt item={gear[slot] ? { baseId: gear[slot], quality } : undefined} slot={slot} size={64} />
        <span>{gear[slot] ? ITEM_BASES[gear[slot]].name : `${slot === 'weapon' ? '武器' : '护甲'} · 职业默认`}</span>
      </div>)}<span>挑选武器与护甲，查看队员的装束。默认装束按各自职业展示。</span></div>
      <div className="hero-gallery">{Object.values(JOBS).map(job => {
        const equipment = Object.fromEntries(Object.entries(gear).filter(([, baseId]) => baseId).map(([slot, baseId]) => [slot, { id: 'preview-' + slot, baseId, rolls: [] }]))
        const member = { job: job.id as JobId, race, equipment }
        return <div key={job.id}><HeroPortrait member={member} size={96} /><h2>{job.name}</h2><p>{RACES[race].name} · {job.position === 'front' ? '前排' : '后排'}</p><small>{gear.weapon ? ITEM_BASES[gear.weapon].name : '职业装束'}</small></div>
      })}</div>
      <p className="library-note">这里仅预览素材，不创建人物，不写公会存档。混合职业沿基础职业与当前装备显示；专精独有轮廓和角色动画留待后续打磨。</p>
    </section>}
    {tab === 'bosses' && <section className="panel">
      <p className="library-note">14位首领分别绑定不同轮廓；新增12张同源原图，另外2张复用已入库素材。以下名称和机制来自当前游戏定义，不写测试存档。</p>
      <div className="boss-gallery">{DUNGEONS.flatMap(d => Object.values(d.bosses).map(b => <article key={b.id}>
        <ArtCanvas paths={[BOSS_ART[b.id]]} label={b.name} size={96} />
        <div><small>{d.name}</small><h2>{b.name}</h2><p>{b.mechanics?.map(m => m.name).join(' · ')}</p></div>
      </article>))}</div>
    </section>}
    {tab === 'sounds' && <section className="panel">
      <p className="library-note">点击播放试听，每次仅播放一项；正式游戏在开始旅程或点击声音按钮后启用音乐。</p>
      {credits.assets.filter(a => a.kind === 'music' || a.kind === 'sfx').map((a, index) => <div className="sound-row" key={a.id}>
        <div><strong>{a.kind === 'music' ? ({ hub: '公会 / 旅途', battle: '普通战斗', boss: '首领战斗', cavern: '地下 / 休整', mourning: '纪念堂 / 陨落' } as Record<string, string>)[a.id.slice(6)] : ({ knifeSlice: '普通命中', chop: '暴击', handleCoins: '金币', metalPot1: '防护', metalClick: '打断', bookOpen: '来访' } as Record<string, string>)[a.id.slice(4)]}</strong><p>{a.kind === 'music' ? MUSIC[a.id.slice(6) as keyof typeof MUSIC].title : a.sourceFile} · {a.author}</p></div>
        <audio controls preload="none" src={assetUrl(a.path)} aria-label={a.id + '试听'} ref={element => { if (element) { audio.current[index] = element; element.volume = .45 } }} onPlay={e => audio.current.forEach(element => { if (element !== e.currentTarget) element.pause() })} />
      </div>)}
    </section>}
    {tab === 'credits' && <section className="panel">
      <h2>感谢让这些世界成为可能的创作者</h2>
      <CreditsContent />
      <div className="asset-grid">{credits.assets.filter(a => a.kind === 'sprite').map(a => <div key={a.id}><ArtCanvas paths={[a.path]} label={a.id} /><small>{a.id}</small></div>)}</div>
    </section>}
  </main>
}
