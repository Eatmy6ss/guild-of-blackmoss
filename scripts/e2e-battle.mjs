// 战斗 E2E(演出层集成验证):注入满配存档 → 真实点击开一场 5 人团本战斗 →
// 断言场上单位数 + 截图目检布局。
// 前置:npx vite preview --port 4188 --strictPort 已启动
// 运行:node scripts/e2e-battle.mjs
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9224
const URL_BASE = 'http://localhost:4188'
const profile = mkdtempSync(join(tmpdir(), 'cdp-battle-'))

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--no-first-run', 'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const page = (await res.json()).find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch { /* 未就绪 */ }
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
const clickBtn = (text) => evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(text)}))?.click() ?? 'MISS'`)
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
await send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1000, deviceScaleFactor: 1, mobile: false })
await send('Runtime.enable')
await send('Page.navigate', { url: URL_BASE })
await sleep(2500)

// 注入满配存档(v8):直接写 localStorage 键(与 loadGuildSave 同键)
const saveJson = readFileSync(new URL('../docs/dev-save.txt', import.meta.url), 'utf8').trim()
const saveObj = JSON.parse(Buffer.from(saveJson, 'base64').toString('utf8'))
saveObj.manual = ['grush', 'talma', 'delveanchor', 'moldreke', 'velhola', 'malsau']
await evalJs(`localStorage.setItem('guild-game-save-v1', ${JSON.stringify(JSON.stringify(saveObj))}); 'ok'`)
await send('Page.reload')
await sleep(2000)

check('读档标题(继续旅程)', await waitText('继续旅程'))
await clickBtn('继续旅程')
await sleep(400)
check('大厅渲染', await waitText('公会大厅'))
check('满编 6 人', (await evalJs(`document.body.textContent.match(/👥 6\\/6/)`)) !== null)

// 选 5 人团本并出击
check('团本按钮(5 人徽标)', await waitText('5 人团本'))
await clickBtn('荆棘要塞')
await sleep(200)
await clickBtn('正门强攻')
await sleep(800)
check('战斗开启', await waitText('战斗开始'))

// 等 2 秒真实战斗(满配队 ~6s 清第一波,必须中途截)
await sleep(2000)
const unitCount = await evalJs(`window.__br ? window.__br.units.size : -1`)
console.log('  [diag] 场上渲染单位:', unitCount)
check('渲染单位 ≥ 8(5 我方+敌人,路线生成器首场敌数可变)', unitCount >= 8)
const guildSprites = await evalJs(`[...window.__br.units.values()].filter(u => u.container.visible !== false).length`)
console.log('  [diag] body:', await evalJs("document.body.textContent.replace(/s+/g, ' ').slice(0, 260)"))
console.log('  [diag] 活跃精灵:', guildSprites)

// 截图目检
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(new URL('../docs/art-samples/e2e-thornhold-battle.png', import.meta.url), Buffer.from(shot.result.data, 'base64'))
console.log('  [diag] 截图:docs/art-samples/e2e-thornhold-battle.png')

// 挂机自动推进验证:开挂机,等这一场打完,应自动进入休整并继续(500ms 自动下一步)
await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('挂机'))?.click() ?? 'MISS'`)
await sleep(12000)
const autoAdvanced = await evalJs(`document.body.textContent.includes('继续深入') || document.body.textContent.includes('战斗开始')`)
check('挂机自动推进(打完自动继续)', autoAdvanced === true)
check('战斗零控制台错误', consoleErrors.length === 0)
if (consoleErrors.length) console.log('  errors:', consoleErrors.slice(0, 3).join(' | '))

ws.close()
chrome.kill()
try { rmSync(profile, { recursive: true, force: true, maxRetries: 5 }) } catch { /* 句柄残留 */ }
process.exit(results.some((r) => !r.ok) ? 1 : 0)
