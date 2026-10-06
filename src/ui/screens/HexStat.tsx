import type { Member } from '../../sim/types'

// 六维雷达图(花名册改版,制作人 2026-10-06 反馈②):力量/敏捷/智力/体质/精神/幸运。
// 纯展示:数值取 member.attrs,封顶 max(12,成长满级口径,C4 占位)。

const ATTRS: { key: 'str' | 'agi' | 'int' | 'vit' | 'spr' | 'lck'; name: string }[] = [
  { key: 'str', name: '力量' },
  { key: 'agi', name: '敏捷' },
  { key: 'int', name: '智力' },
  { key: 'vit', name: '体质' },
  { key: 'spr', name: '精神' },
  { key: 'lck', name: '幸运' },
]

const CX = 92
const CY = 86
const R = 58

function point(i: number, ratio: number): [number, number] {
  const angle = (-90 + i * 60) * (Math.PI / 180)
  return [CX + Math.cos(angle) * R * ratio, CY + Math.sin(angle) * R * ratio]
}

export function HexStat({ member, max = 12 }: { member: Member; max?: number }) {
  const values = ATTRS.map((a) => Math.max(0, Math.min(max, member.attrs[a.key] ?? 0)))
  const poly = values.map((v, i) => point(i, v / max).join(',')).join(' ')
  return (
    <figure className="hexstat" aria-label={member.name + ' 的六维图'}>
      <svg viewBox="0 0 184 172" width={184} height={172} role="img">
        {[1 / 3, 2 / 3, 1].map((ring) => (
          <polygon key={ring} className="hexstat-grid" points={ATTRS.map((_, i) => point(i, ring).join(',')).join(' ')} />
        ))}
        {ATTRS.map((_, i) => {
          const [x, y] = point(i, 1)
          return <line key={i} className="hexstat-spoke" x1={CX} y1={CY} x2={x} y2={y} />
        })}
        <polygon className="hexstat-fill" points={poly} />
        {ATTRS.map((a, i) => {
          const [x, y] = point(i, 1.24)
          return (
            <text key={a.key} className="hexstat-label" x={x} y={y} textAnchor="middle" dominantBaseline="middle">
              {a.name}
              <tspan className="hexstat-num"> {member.attrs[a.key] ?? 0}</tspan>
            </text>
          )
        })}
      </svg>
    </figure>
  )
}
