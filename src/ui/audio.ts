import { MUSIC, type MusicMood } from './art/catalog'
import { assetUrl } from './art/assetLoader'
// CC0场景音乐/关键SFX接入；已有合成声保留为其余反馈与失败降级。
// 总线:Master ← { Music, SFX };音量线性值仅用于合成级小规模,静音持久化到 localStorage。

let ctx: AudioContext | null = null
let master: GainNode | null = null
let musicBus: GainNode | null = null
let sfxBus: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
let muted = false
try { muted = localStorage.getItem('gg-muted') === '1' } catch { /* 无存储仍可播放。 */ }
/** A16:主音量 0-1(持久化;静音开关独立于此) */
let volume = 0.5
try { const raw = localStorage.getItem('gg-volume'); if (raw !== null) { const v = Number(raw); if (Number.isFinite(v) && v >= 0 && v <= 1) volume = v } } catch { /* 默认音量。 */ }
let bgmTimer: number | null = null
let bgmStep = 0
let lastHitAt = 0

export function initAudio(): void {
  if (ctx) {
    void ctx.resume()
    resumeMusic()
    return
  }
  ctx = new AudioContext()
  master = ctx.createGain()
  master.gain.value = muted ? 0 : volume
  master.connect(ctx.destination)
  musicBus = ctx.createGain()
  musicBus.gain.value = 0.4
  musicBus.connect(master)
  sfxBus = ctx.createGain()
  sfxBus.gain.value = 0.62
  sfxBus.connect(master)
  // 噪声缓冲(SFX 共用)
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate)
  const data = noiseBuf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() /* presentation-only */ * 2 - 1
  // 用户解锁声音时预取六个短音效，避免首个命中等网络返回后才响。
  for (const name of SFX_NAMES) void loadSample(name)
  resumeMusic()
}

export function toggleMute(): boolean {
  muted = !muted
  try { localStorage.setItem('gg-muted', muted ? '1' : '0') } catch { /* 存储不可用不影响声音按钮。 */ }
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.02)
  if (muted) { musicElement?.pause(); stopFallback() } else resumeMusic()
  return muted
}

export function setVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v))
  try { localStorage.setItem('gg-volume', String(volume)) } catch { /* 存储不可用不影响本次会话。 */ }
  if (master && ctx && !muted) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02)
}

export function getVolume(): number {
  return volume
}

export function isMuted(): boolean {
  return muted
}

// ---- 合成基元 ----

function blip(freq0: number, freq1: number, dur: number, type: OscillatorType, gain: number, when = 0): void {
  if (!ctx || !sfxBus) return
  const t0 = ctx.currentTime + when
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq0, t0)
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq1), t0 + dur)
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  osc.connect(g).connect(sfxBus)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

function noise(dur: number, gain: number, hp = 800): void {
  if (!ctx || !sfxBus || !noiseBuf) return
  const t0 = ctx.currentTime
  const src = ctx.createBufferSource()
  src.buffer = noiseBuf
  const g = ctx.createGain()
  const filter = ctx.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = hp
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  src.connect(filter).connect(g).connect(sfxBus)
  src.start(t0)
  src.stop(t0 + dur + 0.02)
}

// ---- SFX(audio-design:SFX 变奏 ±6% 音高;高频打击节流)----

function wob(base: number): number {
  return base * (0.94 + Math.random() /* presentation-only */ * 0.12)
}

function synthHit(): void {
  noise(0.05, 0.16, 1200)
  blip(wob(190), wob(120), 0.07, 'square', 0.1)
}

function synthCrit(): void {
  noise(0.09, 0.22, 900)
  blip(wob(330), wob(170), 0.12, 'square', 0.16)
}

export function sfxDeath(): void {
  blip(wob(220), 55, 0.28, 'sawtooth', 0.18)
  noise(0.12, 0.12, 500)
}

function synthCoin(): void {
  blip(880, 880, 0.06, 'square', 0.1)
  blip(1318, 1318, 0.09, 'square', 0.1, 0.06)
}

export function sfxTick(): void {
  blip(660, 640, 0.03, 'square', 0.05)
}

export function sfxVictory(): void {
  const notes = [440, 523, 659, 880]
  notes.forEach((f, i) => blip(f, f, 0.1, 'square', 0.12, i * 0.09))
}

export function sfxDefeat(): void {
  const notes = [330, 262, 220, 165]
  notes.forEach((f, i) => blip(f, f, 0.14, 'triangle', 0.14, i * 0.12))
}

function synthVisitor(): void {
  blip(523, 523, 0.09, 'triangle', 0.12)
  blip(659, 659, 0.12, 'triangle', 0.12, 0.09)
}

// ---- 指挥有感 SFX:boss 前摇预警与指令 payoff(game-feel:指令也要有反馈分层)----

export function sfxTelegraph(): void {
  // 蓄力开始:低鸣号角感,音高下坠 = 危险逼近
  blip(220, 110, 0.22, 'triangle', 0.16)
  noise(0.12, 0.06, 300)
}

function synthInterrupt(): void {
  // 打断:金属铿锵 + 高频噪声,指挥高光时刻,给 large 级音量
  blip(wob(1180), wob(2350), 0.09, 'square', 0.2)
  noise(0.1, 0.18, 1600)
}

function synthGuard(): void {
  // 减伤成功:厚盾闷响
  blip(150, 85, 0.12, 'triangle', 0.18)
  noise(0.06, 0.09, 420)
}

export function sfxSlam(): void {
  // 震地命中全队:低频重锤
  blip(95, 32, 0.26, 'sawtooth', 0.22)
  noise(0.16, 0.18, 220)
}

export function sfxEnrage(): void {
  // 狂暴:下坠低吼
  blip(110, 62, 0.32, 'sawtooth', 0.18)
  noise(0.2, 0.07, 260)
}

export function sfxCmd(): void {
  // 指令确认:短促上扬,与金币音区分(金币是双音高叠)
  blip(520, 780, 0.06, 'square', 0.08)
}

// ---- BGM:A 小调五声,chiptune 双声部,32 步循环(audio-design:别单曲平铺,先用 A/A' 两段)----

const MELODY: (number | 0)[] = [
  // A 段(8 小节 8 分音符步进,0 = 休止)
  220, 0, 262, 0, 330, 0, 294, 262, 220, 0, 196, 0, 165, 0, 196, 0,
  220, 0, 262, 0, 330, 0, 392, 0, 440, 0, 392, 330, 294, 0, 262, 0,
]
const BASS: (number | 0)[] = [
  110, 0, 0, 110, 0, 0, 98, 0, 82, 0, 0, 82, 0, 0, 98, 0,
  110, 0, 0, 110, 0, 0, 130, 0, 87, 0, 0, 87, 98, 0, 0, 0,
]

function startBgm(): void {
  if (bgmTimer !== null || !ctx || !musicBus) return
  const stepDur = 60 / 112 / 2 // 112 BPM 的 8 分音符
  let nextTime = ctx.currentTime + 0.1
  bgmStep = 0
  bgmTimer = window.setInterval(() => {
    if (!ctx || !musicBus) return
    // lookahead 调度:每次排进 0.3s 的音符(audio-design:按音频时钟排,不按帧)
    while (nextTime < ctx.currentTime + 0.3) {
      // 掉队钳制:标签页节流/挂起后直接跳到当前,不追帧(追帧 = 积压音符齐响,像两首 BGM 叠放)
      if (nextTime < ctx.currentTime - 0.02) nextTime = ctx.currentTime + 0.02
      const m = MELODY[bgmStep % MELODY.length]
      const b = BASS[bgmStep % BASS.length]
      if (m) {
        const osc = ctx.createOscillator()
        const g = ctx.createGain()
        osc.type = 'square'
        osc.frequency.value = m
        g.gain.setValueAtTime(0.035, nextTime)
        g.gain.exponentialRampToValueAtTime(0.001, nextTime + stepDur * 0.9)
        osc.connect(g).connect(musicBus)
        osc.start(nextTime)
        osc.stop(nextTime + stepDur)
      }
      if (b) {
        const osc = ctx.createOscillator()
        const g = ctx.createGain()
        osc.type = 'triangle'
        osc.frequency.value = b
        g.gain.setValueAtTime(0.06, nextTime)
        g.gain.exponentialRampToValueAtTime(0.001, nextTime + stepDur * 1.8)
        osc.connect(g).connect(musicBus)
        osc.start(nextTime)
        osc.stop(nextTime + stepDur * 2)
      }
      nextTime += stepDur
      bgmStep++
    }
  }, 120)
}

let mood: MusicMood = 'hub'
let currentMood: MusicMood | null = null
let musicElement: HTMLAudioElement | null = null
const samples = new Map<string, Promise<AudioBuffer | null>>()
const SFX_NAMES = ['knifeSlice', 'chop', 'handleCoins', 'metalPot1', 'metalClick', 'bookOpen']
function stopFallback() {
  if (bgmTimer !== null) { clearInterval(bgmTimer); bgmTimer = null }
}
export function setMusicMood(next: MusicMood): void {
  mood = next
  if (ctx && !muted && !document.hidden) resumeMusic()
}
function resumeMusic() {
  if (!ctx || !musicBus || muted || document.hidden) return
  if (!musicElement) {
    musicElement = new Audio()
    musicElement.hidden = true
    musicElement.dataset.audioRole = 'music'
    document.body.appendChild(musicElement)
    musicElement.preload = 'none'
    ctx.createMediaElementSource(musicElement).connect(musicBus)
    musicElement.onplaying = () => stopFallback()
    musicElement.onerror = () => {
      if (!muted && !document.hidden) { stopFallback(); startBgm() }
    }
  }
  if (currentMood !== mood) {
    stopFallback()
    musicElement.pause()
    musicElement.src = assetUrl(MUSIC[mood].path)
    musicElement.loop = MUSIC[mood].loop
    currentMood = mood
  }
  if (musicElement.paused && !musicElement.ended) {
    void musicElement.play().catch(error => {
      // 自动播放拒绝等待下一次用户点击；格式/网络失败才启动降级。
      if (error.name !== 'NotAllowedError' && error.name !== 'AbortError' && !muted && !document.hidden) startBgm()
    })
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { musicElement?.pause(); stopFallback() } else resumeMusic()
})
function loadSample(name: string): Promise<AudioBuffer | null> {
  if (!ctx) return Promise.resolve(null)
  let pending = samples.get(name)
  if (!pending) {
    pending = fetch(assetUrl('/assets/audio/sfx/' + name + '.ogg')).then(response => {
      if (!response.ok) throw Error('SFX unavailable')
      return response.arrayBuffer()
    }).then(data => ctx!.decodeAudioData(data)).catch(() => null)
    samples.set(name, pending)
  }
  return pending
}
function sample(name: string, fallback: () => void, volume = .45) {
  if (!ctx || !sfxBus || muted || document.hidden) return
  const requestedAt = performance.now()
  loadSample(name).then(buffer => {
    // 低速网络下丢弃过期演出，不能攒几十个旧命中音一起响。
    if (!ctx || !sfxBus || muted || document.hidden || performance.now() - requestedAt > 200) return
    if (!buffer) { fallback(); return }
    const source = ctx.createBufferSource(), gain = ctx.createGain()
    source.buffer = buffer; gain.gain.value = volume
    source.connect(gain).connect(sfxBus)
    source.onended = () => { source.disconnect(); gain.disconnect() }
    source.start()
  })
}
export function sfxHit(): void {
  const now = performance.now()
  if (now - lastHitAt < 70) return
  lastHitAt = now
  sample('knifeSlice', synthHit, .32)
}
export function sfxCrit(): void { sample('chop', synthCrit, .5) }
export function sfxCoin(): void { sample('handleCoins', synthCoin, .55) }
export function sfxGuard(): void { sample('metalPot1', synthGuard, .45) }
export function sfxInterrupt(): void { sample('metalClick', synthInterrupt, .6) }
export function sfxVisitor(): void { sample('bookOpen', synthVisitor, .6) }
