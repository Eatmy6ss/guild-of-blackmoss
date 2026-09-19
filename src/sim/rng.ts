// 确定性 RNG（mulberry32）：同种子同序列。
// 战斗与生成全部走这里——未来爬塔种子挑战直接复用。

export type Rng = () => number

export function createRng(seed: number): Rng {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function int(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}

/** 按权重挑 key */
export function weighted<K extends string>(rng: Rng, weights: Record<K, number>): K {
  const entries = Object.entries(weights) as [K, number][]
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let roll = rng() * total
  for (const [k, w] of entries) {
    roll -= w
    if (roll <= 0) return k
  }
  return entries[entries.length - 1][0]
}

export function chance(rng: Rng, p: number): boolean {
  return rng() < p
}
