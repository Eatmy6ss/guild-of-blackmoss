import type { ComponentProps } from 'react'

/** 同一状态条服务关系、冷却和生命；数值由调用方提供，组件不推导玩法。 */
export function Meter({ tone = 'progress', className = '', ...props }: ComponentProps<'progress'> & {
  tone?: 'progress' | 'health' | 'stamina' | 'enemy' | 'cast'
}) {
  return <progress {...props} className={`meter ${className}`} data-tone={tone} />
}
