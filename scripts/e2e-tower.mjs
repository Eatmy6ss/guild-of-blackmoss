import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const profile = mkdtempSync(join(tmpdir(), 'dbg-tower-'))
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--remote-debugging-port=9226',`--user-data-dir=${profile}`,'--no-first-run','about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function wsUrl() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch('http://127.0.0.1:9226/json/list'); const p = (await r.json()).find(t => t.type === 'page'); if (p?.webSocketDebuggerUrl) return p.webSocketDebuggerUrl } catch {}
    await sleep(250)
  }
  throw new Error('no cdp')
}
const ws = new WebSocket(await wsUrl())
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let id = 0; const pend = new Map(); const errs = []
ws.onmessage = (ev) => { const m = JSON.parse(ev.data)
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params?.exceptionDetails).slice(0, 300))
  if (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error') errs.push(m.params.args?.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300))
}
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.exceptionDetails ? 'EXC:' + JSON.stringify(r.result.exceptionDetails).slice(0, 200) : r.result?.result?.value }
await send('Page.enable'); await send('Runtime.enable')
const save = readFileSync(new URL('../docs/dev-save.txt', import.meta.url), 'utf8').trim()
const saveObj = JSON.parse(Buffer.from(save, 'base64').toString('utf8'))
saveObj.manual = ['grush', 'talma', 'delveanchor', 'moldreke', 'velhola', 'malsau']
await send('Page.navigate', { url: 'http://localhost:4188' })
await sleep(2500)
await ev(`localStorage.setItem('guild-game-save-v1', ${JSON.stringify(JSON.stringify(saveObj))}); 'ok'`)
await send('Page.reload'); await sleep(2000)
await ev('window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16); window.__shim = true')
console.log('shim:', await ev('window.__shim ?? false'))
await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('继续旅程'))?.click()`)
await sleep(500)
console.log('btn disabled:', await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('进入高塔'))?.disabled`))
console.log('member cards:', await ev(`document.querySelectorAll('.member-card').length`))
console.log('all buttons:', await ev('JSON.stringify([...document.querySelectorAll(\"button\")].map(b => b.textContent.slice(0, 12)))'))
console.log('screen text head:', await ev('document.body.textContent.slice(0, 120)'))
console.log('node alive:', await ev('(function(){ const b=[...document.querySelectorAll("button")].find(x => x.textContent.includes("进入高塔")); return b ? document.contains(b) : "nofind" })()'))
console.log('bubbles click:', await ev('(function(){ const b=[...document.querySelectorAll("button")].find(x => x.textContent.includes("进入高塔")); if(!b) return "nofind"; b.dispatchEvent(new MouseEvent("click", {bubbles:true})); return "dispatched" })()'))
await sleep(2000)
console.log('tower panel:', await ev(`document.body.textContent.includes('黑苔高塔 · 第 1 层') || document.body.textContent.includes('第 {towerRun.floor} 层')`))
console.log('floor text:', await ev(`(document.body.textContent.match(/黑苔高塔[^\\n]{0,20}/) || [''])[0]`))
console.log('battle ui:', await ev(`document.body.textContent.includes('挂机')`))
console.log('state dump:', await ev(`JSON.stringify({ phase: window.__br ? 'br-alive' : 'no-br', units: window.__br?.units?.size ?? -1 })`))
console.log('probe:', await ev('JSON.stringify({t: window.__t, t2: window.__t2 ?? null})'))
await sleep(3000)
console.log('tick after 3s:', await ev('window.__br?.units?.size ? document.body.textContent.match(/tick (\\d+)/)?.[1] : -1'))
await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('×10 tick'))?.click()`)
await sleep(300)
console.log('tick after x10:', await ev('document.body.textContent.match(/tick (\\d+)/)?.[1]'))
console.log('retreat btn:', await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('撤退令'))?.textContent ?? 'MISS'`))
await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('撤退令'))?.click()`)
await sleep(1500)
console.log('after retreat:', await ev(`document.body.textContent.includes('带着奖励离开') || document.body.textContent.includes('公会大厅')`))
console.log('errors:', errs.length ? errs.slice(0, 3).join(' || ') : 'none')
ws.close(); chrome.kill()
try { rmSync(profile, { recursive: true, force: true, maxRetries: 5 }) } catch {}
