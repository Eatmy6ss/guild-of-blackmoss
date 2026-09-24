// 单位渲染探针:开战后输出每个 Pixi 单位的坐标/缩放/纹理尺寸
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9251
const URL_BASE = 'http://localhost:5173'
const profile = mkdtempSync(join(tmpdir(), 'cdp-units-'))

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
const waitText = async (text, tries = 25) => {
  for (let i = 0; i < tries; i++) {
    if (await evalJs(`document.body.textContent.includes(${JSON.stringify(text)})`)) return true
    await sleep(300)
  }
  return false
}
const clickBtn = (text) => evalJs(`
  [...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(text)}))?.click() ?? 'MISS'`)

await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 980, deviceScaleFactor: 1, mobile: false })
await send('Runtime.enable')
await send('Page.navigate', { url: URL_BASE })
await sleep(3000)

const saveJson = readFileSync(new URL('../docs/dev-save.txt', import.meta.url), 'utf8').trim()
const saveObj = JSON.parse(Buffer.from(saveJson, 'base64').toString('utf8'))
await evalJs(`localStorage.setItem('guild-game-save-v1', ${JSON.stringify(JSON.stringify(saveObj))}); 'ok'`)
await send('Page.reload')
await sleep(2500)

if (!(await waitText('继续旅程'))) { console.log('✗ 标题未出现'); process.exit(1) }
await clickBtn('继续旅程')
if (!(await waitText('公会大厅'))) { console.log('✗ 大厅未出现'); process.exit(1) }
await clickBtn('烬石隘口')
await sleep(300)
await clickBtn('龙脊小径')
if (!(await waitText('战斗开始', 25))) { console.log('✗ 战斗未开启'); process.exit(1) }
await sleep(2000)

const probe = await evalJs(`
  (() => {
    const br = window.__br
    if (!br) return 'no __br'
    const out = { rootScale: br.root?.scale?.x, rootPos: [br.root?.x, br.root?.y], canvasW: br.app?.renderer?.width, canvasH: br.app?.renderer?.height, units: [] }
    for (const u of br.units.values()) {
      out.units.push({
        name: u.combatant.name,
        tex: u.body?.texture?.width + 'x' + u.body?.texture?.height,
        bodyScale: u.body?.scale?.x,
        worldX: Math.round(u.container.x), worldY: Math.round(u.container.y),
        contScale: u.container.scale.x,
        texKey: u.texKey,
        visible: u.container.visible,
      })
    }
    out.stageChildren = br.root?.children?.length
    return JSON.stringify(out, null, 1)
  })()
`)
console.log(probe)

chrome.kill()
rmSync(profile, { recursive: true, force: true, maxRetries: 3 })
process.exit(0)
