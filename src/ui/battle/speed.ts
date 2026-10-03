// 战斗实时倍速(A16→R1.5):1×/2×/3× 循环,3× = TICK_MS/3。单场战斗时长数值不动(C4)。

export type BattleSpeed = 1 | 2 | 3

export function nextBattleSpeed(s: BattleSpeed): BattleSpeed {
  return (s === 1 ? 2 : s === 2 ? 3 : 1) as BattleSpeed
}

export function speedIntervalMs(s: BattleSpeed, tickMs: number): number {
  return tickMs / s
}

export function parseBattleSpeed(v: string | null): BattleSpeed {
  return v === '2' || v === '3' ? (Number(v) as BattleSpeed) : 1
}
