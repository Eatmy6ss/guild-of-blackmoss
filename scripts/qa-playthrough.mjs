// 新档全流程 QA 实测:真实新玩家路径(开始新公会→黑苔全程→各屏检查→高塔),问题收集模式
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9253
const URL_BASE = 'http://localhost:5173'
const profile = mkdtempSync(join(tmpdir(), 'cdp-qa-'))
const issues = []
const consoleErrors = []
let shotN = 0

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--no-first-run', 'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const list = await res.json()
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch { /* chrome 未就绪 */ }
    await sleep(250)
  }
  throw new Error('CDP 端口未就绪')
}

const ws = new WebSocket(await getWsUrl())
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let msgId = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') consoleErrors.push('EXC: ' + (m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '').slice(0, 200))
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    consoleErrors.push(m.params.args?.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200))
  }
}
function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++msgId
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
}
async function evalJs(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) consoleErrors.push('EVAL: ' + (r.result.exceptionDetails.text ?? ''))
  return r.result?.result?.value
}
const waitText = async (text, tries = 30) => {
  for (let i = 0; i < tries; i++) {
    if (await evalJs(`document.body.textContent.includes(${JSON.stringify(text)})`)) return true
    await sleep(300)
  }
  return false
}
const clickBtn = (text) => evalJs(`
  [...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(text)}))?.click() ?? 'MISS'`)
const shot = async (tag) => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  shotN++
  writeFileSync(new URL(`../docs/art-samples/qa-${String(shotN).padStart(2, '0')}-${tag}.png`, import.meta.url), Buffer.from(s.result.data, 'base64'))
  console.log('  [shot]', `${shotN}-${tag}`)
}
const issue = (msg) => { issues.push(msg); console.log('  ⚠ 问题:', msg) }

await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 980, deviceScaleFactor: 1, mobile: false })
await send('Runtime.enable')
await send('Page.navigate', { url: URL_BASE })
await sleep(3500)

// ---- 1. 全新档(清空任何存档,走真实"开始新公会"路径)----
await evalJs(`localStorage.clear(); 'ok'`)
await send('Page.reload')
await sleep(2500)
if (!(await waitText('开始新公会'))) { issue('标题画面没有「开始新公会」入口'); process.exit(1) }
await clickBtn('开始新公会')
if (!(await waitText('公会大厅'))) { issue('开新公会后未进入公会大厅'); process.exit(1) }
console.log('  [ok] 新公会创建')
await shot('newgame-hall')

// 检查:开局资源可见性
const startInfo = await evalJs(`document.body.textContent.match(/第 \\d+ 日|\\d+\\/\\d+|💰|🕯/g)?.join('|') ?? ''`)
console.log('  [info] 顶栏:', startInfo.slice(0, 80))

// ---- 2. 各浮层屏逐个打开检查 ----
const screens = [
  ['花名册', '花名册'],
  ['酒馆', '酒馆'],
  ['仓库', '仓库'],
  ['基地', '基地'],
  ['大事记', '大事记'],
  ['名人堂', '名人堂'],
  ['手册', '手册'],
]
for (const [btn, label] of screens) {
  await clickBtn(label)
  const opened = await evalJs(`!!document.querySelector('.screen-panel')`)
  if (!opened) issue(`浮层「${label}」打不开`)
  await shot(`screen-${btn}`)
  // Esc 关闭
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
  await sleep(250)
  const still = await evalJs(`!!document.querySelector('.screen-panel')`)
  if (still) { await clickBtn('Esc'); await sleep(200) }
  console.log(`  [ok] ${label} 屏检查完成`)
}

// ---- 3. 出击黑苔沼泽·稳路(新玩家友好)----
await clickBtn('黑苔沼泽')
await sleep(200)
await clickBtn('枯木栈道')
if (!(await waitText('战斗开始', 25))) issue('出击后未进入战斗(稳路)')
await shot('battle-1')
console.log('  [ok] 首场战斗开始')

// 挂机代打+快进全程,每隔一段截图与检查
await clickBtn('挂机')
let battleCount = 1
let ended = false
let lastBattle = ''
let eventShot = false
for (let round = 0; round < 60; round++) {
  for (let i = 0; i < 14; i++) await clickBtn('×10 tick')
  await sleep(400)
  const m = await evalJs(`(document.body.textContent.match(/第 (\\d+) \\/ (\\d+) 场/)||[]).slice(1).join('/')`)
  const m2 = await evalJs(`(document.body.textContent.match(/(\\d+)\\/(\\d+) 场/)||[]).slice(1).join('-of-')`)
  const cur = m || m2
  if (cur && cur !== lastBattle) {
    lastBattle = cur
    battleCount++
    console.log('  [progress] 战斗', cur)
    await shot(`battle-${cur.replace('/', '-')}`)
  }
  const ev = await evalJs(`!!document.querySelector('.event-overlay') || !!document.querySelector('.event-modal')`)
  if (ev && !eventShot) { eventShot = true; await shot('event-modal'); console.log('  [ok] 事件弹层出现') }
  if (await evalJs(`document.body.textContent.includes('远征结束') || document.body.textContent.includes('大获全胜')`)) {
    ended = true
    break
  }
}
if (!ended) issue('稳路远征未能自然结束(60 轮快进内)')
await shot('settle')
console.log('  [ok] 远征结束,结算截图')

// 撤离回城
await clickBtn('返回公会')
await sleep(600)

// ---- 4. 高塔进 1 层 ----
await clickBtn('进入高塔')
await sleep(1000)
const towerIn = await evalJs(`document.body.textContent.includes('守塔') || document.body.textContent.includes('高塔')`)
await shot('tower')

// ---- 5. 汇总 ----
console.log('\n===== QA 汇总 =====')
console.log('截图数:', shotN)
console.log('控制台错误:', consoleErrors.length)
for (const e of consoleErrors.slice(0, 10)) console.log('  [console]', e)
console.log('问题清单:', issues.length ? '' : '无(脚本层)')
for (const i2 of issues) console.log('  -', i2)

writeFileSync(new URL('../docs/qa-last-run.json', import.meta.url), JSON.stringify({ issues, consoleErrors, shotN }, null, 2))
chrome.kill()
await sleep(300)
try { rmSync(profile, { recursive: true, force: true, maxRetries: 3 }) } catch { /* 忽略 */ }
process.exit(0)
