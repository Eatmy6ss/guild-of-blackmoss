import { useState } from 'react'
import { JOBS } from '../../data/jobs'
import { RACES } from '../../data/races'
import { ITEM_BASES } from '../../data/items'
import type { JobId, Slot } from '../../sim/types'
import { SPEC_OUTFITS } from './catalog'
import { HeroPortrait } from './ArtCanvas'
import { ItemArt, ItemLore } from './ItemArt'

const SLOT_NAMES = { weapon: '武器', armor: '护甲', trinket: '饰品' }
export function CharacterWardrobe() {
  const [jobId, setJob] = useState<JobId>('guard')
  const [specId, setSpec] = useState('guard-ironwall')
  const [race, setRace] = useState('human')
  const [gear, setGear] = useState({ weapon: '', armor: '', trinket: '' })
  const [slot, setSlot] = useState<Slot>('weapon')
  const [quality, setQuality] = useState<'white' | 'green' | 'purple'>('white')
  const job = JOBS[jobId], spec = job.specs[specId]
  const equipment = Object.fromEntries(Object.entries(gear).filter(([, baseId]) => baseId).map(([key, baseId]) => [key, { id: 'preview-' + key, baseId, rolls: [] }]))
  const choose = (nextJob: JobId, nextSpec: string) => {
    setJob(nextJob); setSpec(nextSpec)
    if (!RACES[race].allowedLines.includes(nextJob)) setRace('human')
  }
  return <>
    <div className="wardrobe-heading"><div><small>黑苔远征者</small><h2>六条道路，十二种身影</h2></div><p>选择一位专精，往下试穿装备。</p></div>
    <div className="identity-gallery">{Object.values(JOBS).map(line => <article key={line.id}>
      <h3>{line.name}<small>{line.position === 'front' ? '前排' : '后排'}</small></h3>
      <div>{Object.values(line.specs).map(identity => <button key={identity.id} aria-pressed={specId === identity.id} onClick={() => choose(line.id, identity.id)}>
        <HeroPortrait member={{ job: line.id, spec: identity.id, race: 'human', name: identity.name }} size={96} />
        <strong>{identity.name}</strong><small>{SPEC_OUTFITS[identity.id].motif}</small>
      </button>)}</div>
    </article>)}</div>
    <section className="wardrobe-fitting" aria-label="单人试装">
      <div className="fitting-figure"><HeroPortrait member={{ job: jobId, spec: specId, race, equipment, name: spec.name }} size={128} /><h2>{spec.name}</h2><p>{RACES[race].name} · {job.name}</p></div>
      <div className="fitting-controls">
        <h3>远征行装</h3><p className="library-note">{SPEC_OUTFITS[specId].motif}。试装只改变左侧人物，上方保留各专精的原有装束。</p>
        <div className="library-controls">
          <label>试装种族<select value={race} onChange={e => setRace(e.target.value)}>{Object.values(RACES).filter(r => r.allowedLines.includes(jobId)).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <label>品质纹饰<select value={quality} onChange={e => setQuality(e.target.value as typeof quality)}><option value="white">普通 ·</option><option value="green">精良 ▰</option><option value="purple">史诗 ◆</option></select></label>
        </div>
        <div className="fitting-slots">{(['weapon', 'armor', 'trinket'] as const).map(key => <label key={key}>
          <ItemArt item={gear[key] ? { baseId: gear[key], quality } : undefined} slot={key} size={48} />
          <span>{SLOT_NAMES[key]}<select aria-label={SLOT_NAMES[key]} value={gear[key]} onChange={e => setGear({ ...gear, [key]: e.target.value })}>
            <option value="">{key === 'trinket' ? '未佩戴' : '专精默认装束'}</option>
            {Object.values(ITEM_BASES).filter(item => item.slot === key).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></span>
        </label>)}</div>
        {gear.weapon && <div className="fitting-lore" aria-live="polite"><strong>{ITEM_BASES[gear.weapon].name}</strong><ItemLore baseId={gear.weapon} /></div>}
        <button onClick={() => setGear({ weapon: '', armor: '', trinket: '' })}>恢复专精装束</button>
        <small className="library-note">饰品以独立图标展示，不覆盖人物轮廓。试装不创建人物、不写入公会存档。</small>
      </div>
    </section>
    <div className="wardrobe-heading"><h2>公会军械陈列</h2><div className="library-tabs" aria-label="装备种类">{(['weapon', 'armor', 'trinket'] as const).map(key => <button key={key} aria-pressed={slot === key} onClick={() => setSlot(key)}>{SLOT_NAMES[key]}</button>)}</div></div>
    <div className="equipment-gallery">{Object.values(ITEM_BASES).filter(item => item.slot === slot).map(item => <button key={item.id} aria-pressed={gear[slot] === item.id} onClick={() => setGear({ ...gear, [slot]: item.id })}>
      <ItemArt item={{ baseId: item.id, quality }} slot={slot} size={64} /><strong>{item.name}</strong><small>{['', '戍卒器械', '远征遗物', '灰冠珍藏'][item.tier]} · 点击试装</small><ItemLore baseId={item.id} />
    </button>)}</div>
  </>
}
