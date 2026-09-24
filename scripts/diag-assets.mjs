// 资源加载诊断:检查浏览器实际请求的 /assets/mon/* 资源
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9249
const URL_BASE = 'http://localhost:5173'
const profile = mkdtempSync(join(tmpdir(), 'cdp-res-'))

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
  return r.result?.result?.value
}

await send('Page.enable')
await send('Runtime.enable')
await send('Page.navigate', { url: URL_BASE })
await sleep(5000)

const probe = await evalJs(`
  (async () => {
    const out = {}
    const results = performance.getEntriesByType('resource').filter(r => r.name.includes('/assets/'))
    out.requested = results.map(r => r.name.split('/').slice(-2).join('/') + ' [' + r.transferSize + 'B]')
    // Image decode 独立验证
    try {
      const img = new Image()
      img.src = '/assets/mon/occultist.png'
      await img.decode()
      out.decode = img.width + 'x' + img.height
    } catch (e) { out.decode = 'FAIL: ' + e.message }
    return JSON.stringify(out, null, 1)
  })()
`)
console.log(probe)

chrome.kill()
rmSync(profile, { recursive: true, force: true, maxRetries: 3 })
process.exit(0)
