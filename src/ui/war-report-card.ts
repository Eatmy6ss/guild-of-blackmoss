// A11 战报卡 v0(ROADMAP §3.7 可选项):远征总结渲染成可保存的 PNG,随试玩包发。
// 目的(§3.7 原文):检验「玩家会不会主动发出来」。纯 canvas 绘制,不依赖 sim。
// v0 不追求美术,只保证信息可读+暗色金饰的家族观感;尺寸 1080×1350(4:5,社媒友好)。

export interface WarReportData {
  build: string
  day: number
  rankName: string
  kills: number
  towerBest: number
  /** 阵亡者(name · 死因) */
  fallen: { name: string; cause: string }[]
  /** 说书人条目(最新 1-2 条) */
  stories: string[]
}

const W = 1080
const H = 1350
const GOLD = '#d9b979'
const GOLD_DIM = '#9c7b45'
const INK = '#ddd6c4'
const INK_DIM = '#a49c88'
const DANGER = '#d86a5a'
const BG = '#0a0b0d'

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxWidth) {
      lines.push(line)
      line = ch
    } else line += ch
  }
  if (line) lines.push(line)
  return lines
}

export function renderWarReportCard(data: WarReportData): string {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const font = (size: number, bold = false): string => `${bold ? 'bold ' : ''}${size}px "Blackmoss Sans", "Microsoft YaHei", sans-serif`

  // 底色+边框
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = GOLD_DIM
  ctx.lineWidth = 4
  ctx.strokeRect(24, 24, W - 48, H - 48)
  ctx.strokeStyle = GOLD
  ctx.lineWidth = 1
  ctx.strokeRect(36, 36, W - 72, H - 72)

  let y = 110
  // 标题
  ctx.fillStyle = GOLD
  ctx.font = font(64, true)
  ctx.textAlign = 'center'
  ctx.fillText('🏰 黑苔公会', W / 2, y)
  y += 52
  ctx.fillStyle = INK_DIM
  ctx.font = font(22)
  ctx.fillText('英雄会死,故事不会。', W / 2, y)
  y += 90

  // 位阶徽记
  ctx.fillStyle = GOLD
  ctx.font = font(44, true)
  ctx.fillText(`🏅 公会位阶:${data.rankName}`, W / 2, y)
  y += 84

  // 统计行
  const stats: [string, string][] = [
    ['公会纪元', `第 ${data.day} 天`],
    ['首领首杀', `${data.kills} 头`],
    ['高塔纪录', `第 ${data.towerBest} 层`],
  ]
  ctx.font = font(30)
  for (const [k, v] of stats) {
    ctx.fillStyle = INK_DIM
    ctx.textAlign = 'right'
    ctx.fillText(k, W / 2 - 40, y)
    ctx.fillStyle = INK
    ctx.textAlign = 'left'
    ctx.fillText(v, W / 2 + 40, y)
    y += 54
  }
  y += 30

  // 阵亡者
  ctx.textAlign = 'left'
  ctx.fillStyle = DANGER
  ctx.font = font(30, true)
  ctx.fillText(`🕯 纪念堂(${data.fallen.length})`, 90, y)
  y += 48
  ctx.font = font(24)
  ctx.fillStyle = INK
  for (const f of data.fallen.slice(-6)) {
    for (const line of wrap(ctx, `† ${f.name} —— ${f.cause}`, W - 200)) {
      ctx.fillText(line, 110, y)
      y += 38
    }
  }
  if (data.fallen.length === 0) {
    ctx.fillStyle = INK_DIM
    ctx.fillText('至今无人倒下。(这份运气保持住)', 110, y)
    y += 38
  }
  y += 30

  // 说书人
  ctx.fillStyle = GOLD
  ctx.font = font(30, true)
  ctx.fillText('📖 公会编年', 90, y)
  y += 48
  ctx.font = font(24)
  for (const story of data.stories.slice(-2)) {
    for (const line of wrap(ctx, story, W - 200)) {
      ctx.fillStyle = INK
      ctx.fillText(line, 110, y)
      y += 38
    }
    y += 14
  }

  // 页脚
  ctx.fillStyle = INK_DIM
  ctx.font = font(20)
  ctx.textAlign = 'center'
  ctx.fillText(`黑苔公会 · 试玩版 ${data.build} —— 你的公会,会讲出什么故事?`, W / 2, H - 80)

  return canvas.toDataURL('image/png')
}

/** 下载辅助 */
export function downloadWarReportCard(dataUrl: string, build: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = `guild-war-report-${build}.png`
  a.click()
}
