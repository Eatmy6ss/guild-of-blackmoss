#!/usr/bin/env node
// G2 反馈聚合:把多份试玩记录 JSON(playtest-report-*.json,导出自试玩包)汇总成一张表。
// 用法:node scripts/aggregate-playtest-reports.mjs <目录或文件...>(缺省扫描 ./playtest-feedback/)
// 输出:终端表格 + feedback-summary.json(供进一步分析)。

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const inputs = process.argv.slice(2)
const files = []
const scan = (p) => {
  const st = statSync(p)
  if (st.isDirectory()) for (const f of readdirSync(p)) scan(join(p, f))
  else if (p.endsWith('.json')) files.push(p)
}
if (inputs.length === 0) {
  const dir = './playtest-feedback'
  try { scan(dir) } catch { console.error(`用法:node scripts/aggregate-playtest-reports.mjs <目录或文件...>(缺省 ${dir};目录不存在或为空)`) ; process.exit(1) }
} else for (const p of inputs) scan(p)
if (files.length === 0) { console.error('没有找到任何 .json 试玩记录'); process.exit(1) }

const reports = []
for (const f of files) {
  try {
    const j = JSON.parse(readFileSync(f, 'utf8'))
    reports.push({ file: f.split('/').pop(), ...j })
  } catch (e) {
    console.warn(`⚠ 跳过无法解析的文件 ${f}:${e.message}`)
  }
}
if (reports.length === 0) { console.error('没有有效记录'); process.exit(1) }

const deaths = reports.flatMap((r) => (r.memorial ?? []).map((m) => ({ tester: r.file, name: m.name, cause: m.cause })))
const stories = reports.flatMap((r) => (r.stories ?? []).map((s) => ({ tester: r.file, day: s.day, text: s.text })))
const summary = {
  testers: reports.length,
  exportedAt: reports.map((r) => r.exportedAt),
  avgDay: avg(reports.map((r) => r.day)),
  maxDay: Math.max(...reports.map((r) => r.day)),
  avgSignatureUses: avg(reports.map((r) => r.playMeta?.signatureUses ?? 0)),
  avgRetreats: avg(reports.map((r) => r.playMeta?.retreats ?? 0)),
  avgExpeditions: avg(reports.map((r) => r.playMeta?.expeditions ?? 0)),
  totalDeaths: deaths.length,
  topKillers: topCount(deaths.map((d) => String(d.cause ?? '未知')).filter((c) => !c.includes('陨落于未知')), 5),
  storyCount: stories.length,
  deaths, stories,
}
function avg(arr) { const xs = arr.filter((n) => Number.isFinite(n)); return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0 }
function topCount(arr, n) {
  const m = new Map()
  for (const x of arr) m.set(x, (m.get(x) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ name: k, count: v }))
}

for (const r of reports) {
  console.log(`\n== ${r.file} ==`)
  console.log(`  天数 ${r.day} │ 金币 ${r.gold} │ 塔纪录 ${r.towerBest} │ 首杀 ${(r.manual ?? []).length} 头`)
  console.log(`  计数:远征 ${r.playMeta?.expeditions ?? 0} / 招牌技 ${r.playMeta?.signatureUses ?? 0} / 撤退 ${r.playMeta?.retreats ?? 0}`)
  console.log(`  阵亡 ${(r.memorial ?? []).length} 人${(r.memorial ?? []).length ? ':' + (r.memorial ?? []).map((m) => m.name).join('、') : ''}`)
  console.log(`  故事 ${(r.stories ?? []).length} 条`)
}
console.log('\n===== 汇总 =====')
console.log(`试玩者 ${summary.testers} 人 │ 平均天数 ${summary.avgDay} │ 最远第 ${summary.maxDay} 天`)
console.log(`平均:远征 ${summary.avgExpeditions} 趟 / 招牌技 ${summary.avgSignatureUses} 次 / 撤退 ${summary.avgRetreats} 次`)
console.log(`阵亡合计 ${summary.totalDeaths};最高频死因:${summary.topKillers.map((k) => `${k.name}×${k.count}`).join('、') || '无'}`)
console.log(`说书人条目合计 ${summary.storyCount} 条`)

mkdirSync('./playtest-feedback', { recursive: true })
writeFileSync('./playtest-feedback/feedback-summary.json', JSON.stringify(summary, null, 2))
console.log('\n已写 ./playtest-feedback/feedback-summary.json')
