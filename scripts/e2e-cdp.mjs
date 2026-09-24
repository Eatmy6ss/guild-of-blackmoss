// 最小 CDP E2E(自检 P0-1):真实浏览器点击验证训练场/花名册/招募卡渲染。
// 前置:npx vite preview --port 4188 已启动(隔离 origin,不碰真实存档)
// 运行:node scripts/e2e-cdp.mjs
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9223
const URL_BASE = 'http://localhost:4188'
const profile = mkdtempSync(join(tmpdir(), 'cdp-e2e-'))

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
const consoleErrors = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params?.exceptionDetails?.text ?? 'exception')
  if (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error') {
    consoleErrors.push(m.params.args?.map((a) => a.value ?? a.description ?? '').join(' '))
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
  if (r.result?.exceptionDetails) consoleErrors.push(r.result.exceptionDetails.text)
  return r.result?.result?.value
}
const clickBtn = (text) => evalJs(`
  [...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(text)}))?.click() ?? 'MISS'`)
const waitText = async (text, tries = 20) => {
  for (let i = 0; i < tries; i++) {
    if (await evalJs(`document.body.textContent.includes(${JSON.stringify(text)})`)) return true
    await sleep(150)
  }
  return false
}

const results = []
const check = (name, ok) => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}`) }

await send('Page.enable')
await send('Runtime.enable')
await send('Page.navigate', { url: URL_BASE })
await sleep(2500)

check('标题屏渲染', await waitText('黑苔公会'))
check('开始按钮存在', (await evalJs(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('开始新公会') || b.textContent.includes('继续旅程'))`)) === true)
await clickBtn('开始新公会')
await clickBtn('继续旅程')
await sleep(500)
check('大厅渲染', await waitText('公会大厅'))
await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('花名册'))?.click()`)
await sleep(300)
const jobTextCache = await evalJs(`document.querySelector('.member-card .job')?.textContent ?? 'NONE'`)
console.log('  [diag] job text:', jobTextCache)
check('花名册含种族与专精', jobTextCache.includes('·') && jobTextCache.includes('('))
await evalJs(`document.querySelector('.member-card .mc-head')?.click()`)
await sleep(200)
check('透明面板逐层明细', await waitText('基础盘') && await waitText('种族·'))
await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('花名册'))?.click()`)
await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('基地'))?.click()`)
await sleep(300)
await evalJs(`[...document.querySelectorAll('.screen-panel button, .screen-panel .dock-btn')].find(b => b.textContent.includes('公会基地'))?.click()`)
await sleep(300)
check('基地屏打开', await waitText('公会基地'))
check('训练场面板渲染', await waitText('训练场'))
const vocBtns = await evalJs(`[...document.querySelectorAll('.voc-btns button')].length`)
console.log('  [diag] voc buttons:', vocBtns)
check('训练场混合职阶回归(v3.2,🔒=未解锁)', vocBtns >= 5)
check('通用战技按钮渲染', await evalJs(`[...document.querySelectorAll('.voc-row2 button')].some(b => b.textContent.includes('体魄'))`) === true)

console.log(consoleErrors.length ? `✗ 控制台错误 ${consoleErrors.length} 条: ${consoleErrors.slice(0, 3).join(' | ')}` : '✓ 控制台零错误')
results.push({ name: '控制台零错误', ok: consoleErrors.length === 0 })

ws.close()
chrome.kill()
try { rmSync(profile, { recursive: true, force: true, maxRetries: 5 }) } catch { /* chrome 句柄残留 */ }
const bad = results.filter((r) => !r.ok)
process.exit(bad.length ? 1 : 0)
