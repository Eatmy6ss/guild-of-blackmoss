// 运行时错误诊断:打开页面,收集控制台错误与未捕获异常
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9239
const URL_BASE = process.argv[2] ?? 'http://localhost:5173'
const profile = mkdtempSync(join(tmpdir(), 'cdp-diag-'))

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
const errs = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails
    errs.push(`EXCEPTION: ${d.text} ${d.exception?.description ?? ''}`.slice(0, 400))
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errs.push(m.params.args?.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 400))
  }
}
function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++msgId
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

await send('Page.enable')
await send('Runtime.enable')
await send('Page.navigate', { url: URL_BASE })
await sleep(5000)

console.log(errs.length ? errs.join('\n') : '无错误')
chrome.kill()
rmSync(profile, { recursive: true, force: true, maxRetries: 3 })
process.exit(0)
