// F09 定向 E2E:挂机连刷闭环——victory 后自动回城+重刷(修复前被守卫静默拒绝)
// 驱动:「暂停→跑到结束」确定性快进每一场;挂机(autoMode)负责 rest 自动推进/事件代打/victory 重刷
// 场数匹配在 Node 端做(拉全文本地正则,避开 CDP 转义链)
// 前置:npx vite preview --port 4188 --strictPort 已启动
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9257
const URL_BASE = 'http://localhost:4188'
const profile = mkdtempSync(join(tmpdir(), 'cdp-f09-'))

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const page = (await res.json()).find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {}
    await sleep(250)
  }
  throw new Error('CDP 未就绪')
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
}
const send = (method, params = {}) => new Promise((res) => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })) })
const evalJs = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value
const clickBtn = (text) => evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(text)}))?.click() ?? 'MISS'`)
const waitText = async (text, tries = 25) => {
  for (let i = 0; i < tries; i++) {
    if ((await evalJs(`document.body.textContent.includes(${JSON.stringify(text)})`)) === true) return true
    await sleep(150)
  }
  return false
}
const bodyText = () => evalJs(`document.body.textContent`) ?? ''

await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1000, deviceScaleFactor: 1, mobile: false })
await send('Runtime.enable')
await send('Page.navigate', { url: URL_BASE })
await sleep(2500)

const saveJson = readFileSync(new URL('../docs/dev-save.txt', import.meta.url), 'utf8').trim()
const saveObj = JSON.parse(Buffer.from(saveJson, 'base64').toString('utf8'))
await evalJs(`localStorage.setItem('guild-game-save-v1', ${JSON.stringify(JSON.stringify(saveObj))}); 'ok'`)
await send('Page.reload')
await sleep(2000)

console.log('读档:', await waitText('继续旅程'))
await clickBtn('继续旅程')
await sleep(400)
await clickBtn('黑苔沼泽')
await sleep(250)
await clickBtn('枯木栈道')
console.log('进战斗:', await waitText('战斗开始'))
await clickBtn('挂机')
console.log('挂机已开(决策链:rest 自动推进/事件代打/victory 重刷)')

// Node 端场数匹配:兼容「第 1/11 场」「第 1 / 11 场」
const parseCount = (t) => {
  const m = t.match(/第 ?(\d+) ?\/ ?(\d+) ?场/)
  return m ? `${m[1]}/${m[2]}` : null
}

let lastCount = ''
const seenFirst = new Set()
let sawVictory = false
let restarted = false
const t0 = Date.now()
while (Date.now() - t0 < 240000) {
  const count = parseCount(await bodyText())
  if (count && count !== lastCount) {
    lastCount = count
    console.log('  [progress] 场数:', count)
    if (count === '1/11') {
      if (seenFirst.size > 1) { restarted = true; break }
      seenFirst.add(count)
    } else {
      seenFirst.add(count)
      if (count === '11/11') sawVictory = true
    }
  }
  const t = await bodyText()
  if (t.includes('知道了') && await evalJs(`!!document.querySelector('.event-result')`)) {
    await clickBtn('知道了')
    await sleep(250)
    continue
  }
  if (await evalJs(`!!document.querySelector('.event-choices button')`)) {
    await evalJs(`[...document.querySelectorAll('.event-choices button')][0]?.click()`)
    await sleep(250)
    continue
  }
  // 战斗运行中(headless rAF 冻结)→ 每轮:跑到结束(上轮暂停后已可用)→暂停(为下轮解锁)
  // 时序注记:点击暂停后 React 重渲染前 disabled 仍为 true,同轮连点跑到结束会被吞——
  // 拆到相邻两轮,由下一轮的"跑到结束"真正生效
  await clickBtn('⏭ 跑到结束')
  await clickBtn('⏸ 暂停')
  await sleep(300)
}

console.log('  [diag] 11/11 到达:', sawVictory, '| 重刷观测:', restarted)
console.log('  [diag] 控制台:', consoleErrors.length === 0 ? '零错误' : consoleErrors.slice(0, 3).join('|'))
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('/tmp/f09-loop.png', Buffer.from(shot.result.data, 'base64'))
chrome.kill()
console.log(restarted ? 'PASS: 挂机连刷闭环生效(victory→回城→重刷)' : 'FAIL: 未观测到重刷')
process.exit(0)
