// 程序生成音频(audio-design:总线结构 + SFX 变奏,零资产免版权)
// 总线:Master ← { Music, SFX };音量线性值仅用于合成级小规模,静音持久化到 localStorage。

let ctx: AudioContext | null = null
let master: GainNode | null = null
let musicBus: GainNode | null = null
let sfxBus: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
let muted = localStorage.getItem('gg-muted') === '1'
let bgmTimer: number | null = null
let bgmStep = 0
let lastHitAt = 0

export function initAudio(): void {
  if (ctx) {
    void ctx.resume()
    startBgm()
    return
  }
  ctx = new AudioContext()
  master = ctx.createGain()
  master.gain.value = muted ? 0 : 0.5
  master.connect(ctx.destination)
  musicBus = ctx.createGain()
  musicBus.gain.value = 0.16
  musicBus.connect(master)
  sfxBus = ctx.createGain()
  sfxBus.gain.value = 0.62
  sfxBus.connect(master)
  // 噪声缓冲(SFX 共用)
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate)
  const data = noiseBuf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  startBgm()
}

export function toggleMute(): boolean {
  muted = !muted
  localStorage.setItem('gg-muted', muted ? '1' : '0')
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.02)
  return muted
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
  return base * (0.94 + Math.random() * 0.12)
}

export function sfxHit(): void {
  const now = performance.now()
  if (now - lastHitAt < 70) return // 高频打击节流:连击不变成机枪
  lastHitAt = now
  noise(0.05, 0.16, 1200)
  blip(wob(190), wob(120), 0.07, 'square', 0.1)
}

export function sfxCrit(): void {
  noise(0.09, 0.22, 900)
  blip(wob(330), wob(170), 0.12, 'square', 0.16)
}

export function sfxDeath(): void {
  blip(wob(220), 55, 0.28, 'sawtooth', 0.18)
  noise(0.12, 0.12, 500)
}

export function sfxCoin(): void {
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

export function sfxVisitor(): void {
  blip(523, 523, 0.09, 'triangle', 0.12)
  blip(659, 659, 0.12, 'triangle', 0.12, 0.09)
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
