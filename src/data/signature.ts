// A3 #1.1 招牌技能(玩家可点名释放的主动技,每专精一个)。
// 设计约束(实施计划 #1.1):每个招牌技必须是 effect 层新动词或新目标形状,禁止与基础技同 effect 只改 CD;
// 即时打断不经累计 taken 阈值——但实现上走同一条 stepCastWindow 打断管线(置 rt.taken=阈值,≤1 tick 生效),
// 保证打断日志/演出/rt.next 语义单一路径;rt.brokenBy 让编年史与战报区分"集火奏效"与"招牌拍碎"。

export type SignatureEffect =
  | 'interrupt-shield'   // 打断 + 自身护盾
  | 'interrupt-bind'     // 打断 + 束缚目标
  | 'interrupt-curse'    // 打断 + 目标易伤

export interface SignatureSkill {
  id: string
  specId: string
  name: string
  cdTicks: number
  effect: SignatureEffect
  targeting: 'enemy'
  desc: string
}

/** 键 = 专精 id(src/data/jobs.ts 现读);未登记专精暂无招牌技(第二批补 9 个) */
export const SIGNATURE_SKILLS: Record<string, SignatureSkill> = {
  'guard-ironwall': {
    id: 'sig-ironwall-break',
    specId: 'guard-ironwall',
    name: '破咒盾击',
    cdTicks: 60,
    effect: 'interrupt-shield',
    targeting: 'enemy',
    desc: '盾面拍碎咒文:立即打断目标的咏唱,并举盾格挡接下来的几下攻击。',
  },
  'warrior-charge': {
    id: 'sig-charge-lock',
    specId: 'warrior-charge',
    name: '锁足冲锋',
    cdTicks: 60,
    effect: 'interrupt-bind',
    targeting: 'enemy',
    desc: '冲进读条里一记锁足:立即打断目标咏唱,并将其钉在原地数息。',
  },
  'priest-discipline': {
    id: 'sig-disc-silence',
    specId: 'priest-discipline',
    name: '诫命沉默',
    cdTicks: 60,
    effect: 'interrupt-curse',
    targeting: 'enemy',
    desc: '以诫命压灭咒文:立即打断目标咏唱,并使其在短时间内受创加深。',
  },
}
