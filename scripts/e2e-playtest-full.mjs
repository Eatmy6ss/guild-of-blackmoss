// 试玩包全流程实机回归(G2 发包前的验收脚本):打开 file:// 单文件试玩包,按阶段跑真实玩家路径并断言已知问题。
//
// 用法:
//   node scripts/e2e-playtest-full.mjs [--build] [--phase=all|build|fresh|ending|region2|hud] [--expeditions=8]
//   --build        先跑两步打包(vite build --config vite.config.playtest.ts && node scripts/inline-assets.mjs)
//   --phase        只跑某一段(默认 all;每段都是全新浏览器配置,互不串档)
//   --expeditions  fresh 段的远征趟数(默认 8)
//   环境变量 CHROME=可执行文件路径(默认 Mac Chrome;Linux 下自动加 --no-sandbox)
//
// 安全边界:每段用 mkdtemp 的一次性 user-data-dir,file:// 与正式 origin 隔离——绝不写用户真实 localStorage。
// 下载不落盘:页面内钩住 URL.createObjectURL / a.click 截获导出内容,脚本只读不写仓库。
// 产物:截图与 report.json 写在系统临时目录(结尾打印路径);任一检查 FAIL 则退出码 1。
//
// 检查项与 docs/development/verify-2026-10-02-claude.md 的编号对应(B=阻断,S=建议)。
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dirname, '..')
const HTML = join(ROOT, 'dist-playtest', 'index.html')
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=')
  return [k, v ?? true]
}))
const PHASE = String(args.phase ?? 'all')
const EXPEDITIONS = Number(args.expeditions ?? 8)
const OUT = mkdtempSync(join(tmpdir(), 'guild-e2e-'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- 结果登记 ----------
const checks = []
const check = (id, title, status, detail = '') => {
  checks.push({ id, title, status, detail })
  const mark = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '–'
  console.log(`  ${mark} [${id}] ${title}${detail ? ' — ' + detail : ''}`)
}
const observations = { stories: [], notices: [], consoleErrors: [], expeditions: 0 }

// ---------- 浏览器(CDP,与仓库其他 e2e 同构) ----------
async function openBrowser(tag) {
  const profile = mkdtempSync(join(tmpdir(), `cdp-pt-${tag}-`))
  const port = 9300 + Math.floor(Math.random() * 600)
  const flags = ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--window-size=1440,900', 'about:blank']
  if (process.platform === 'linux') flags.unshift('--no-sandbox')
  const proc = spawn(CHROME, flags, { stdio: 'ignore' })
  let wsUrl
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl
    } catch { /* 未就绪 */ }
    if (!wsUrl) await sleep(250)
  }
  if (!wsUrl) throw new Error('CDP 端口未就绪:检查 CHROME 路径')
  const ws = new WebSocket(wsUrl)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  let id = 0
  const pending = new Map()
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
    if (m.method === 'Runtime.exceptionThrown') observations.consoleErrors.push(`[${tag}] EXC ` + (m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '').slice(0, 300))
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') observations.consoleErrors.push(`[${tag}] ` + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300))
  }
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.result?.exceptionDetails) throw new Error('页面求值失败:' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text))
    return r.result?.result?.value
  }
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  // 每次导航前注入:截获下载(不落盘)
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    // 仅独立测试 profile 加速长程模拟；正常输入/暂停检查不启用。
    // 正式界面不再保留“跑到结束”调试按钮，仍由真实定时器推进、真实结算。
    window.__e2eFastClock = false;
    const interval = window.setInterval.bind(window);
    window.setInterval = (fn, ms, ...args) => interval(() => {
      const battle = window.__br?.battle;
      const count = window.__e2eFastClock && battle?.status === 'running' && typeof fn === 'function' ? 40 : 1;
      for (let i=0; i<count; i++) {
        if (typeof fn === 'function') fn(...args);
        if (battle && battle.status !== 'running') break;
      }
    }, ms);
    window.__dl = [];
    const blobs = new Map(); const oc = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b) => { const u = oc(b); blobs.set(u, b); return u };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (!this.download) return click.call(this);
      const rec = { name: this.download, kind: this.href.slice(0, 5), size: 0, text: null };
      window.__dl.push(rec);
      const b = blobs.get(this.href);
      if (b) { rec.size = b.size; b.text().then((t) => { rec.text = t }) } else rec.size = this.href.length;
    };` })
  const shot = async (name) => {
    const s = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(OUT, `${tag}-${name}.png`), Buffer.from(s.result.data, 'base64'))
  }
  const close = () => { try { ws.close() } catch { /* */ } proc.kill('SIGKILL'); setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500) }
  return { send, evalJs, shot, close }
}

// ---------- 页面操作 ----------
const BTN_HELPER = `const vis=(b)=>!!(b.offsetWidth||b.offsetHeight);const btns=()=>[...document.querySelectorAll('button')].filter(vis);
const find=(p)=>btns().find((b)=>!b.disabled&&p(b.textContent.trim()));const hit=(p)=>{const b=find(p);if(b){b.click();return b.textContent.trim().slice(0,40)}return null};`
const clickText = (b, text, last = false) => b.evalJs(`(()=>{${BTN_HELPER}const l=btns().filter((x)=>!x.disabled&&x.textContent.includes(${JSON.stringify(text)}));const x=${last ? 'l.pop()' : 'l[0]'};if(x){x.click();return x.textContent.trim().slice(0,40)}return null})()`)
const bodyText = (b) => b.evalJs('document.body.innerText')
const pressEscape = async (b) => {
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
}


async function desktopBattleChecks(b) {
  const probe = () => b.evalJs(`(()=>{
    const br=window.__br, r=br.app.canvas.getBoundingClientRect();
    const units=[...br.units.values()].filter(u=>u.combatant.alive).map(u=>{
      const p=u.container.toGlobal({x:0,y:-16*u.bodyScale});
      return {id:u.combatant.id,memberId:u.combatant.memberId,name:u.combatant.name,team:u.combatant.team,
        x:r.left+p.x,y:r.top+p.y,footX:r.left+u.container.x,footY:r.top+u.container.y,pos:u.combatant.pos,size:32*u.bodyScale};
    });
    const stage=document.querySelector('.game-stage').getBoundingClientRect();
    return {units,rect:{x:r.left,y:r.top,w:r.width,h:r.height},pixels:br.bodyScale*devicePixelRatio,
      nearest:[...br.units.values()].every(u=>u.bodySprites.every(s=>s.texture.source.scaleMode==='nearest')),
      resolution:br.app.renderer.resolution,dpr:devicePixelRatio,
      overflow:document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth,
      fitted:stage.left>=-.5&&stage.top>=-.5&&stage.right<=innerWidth+.5&&stage.bottom<=innerHeight+.5,
      paused:!!document.querySelector('.pause-overlay')};
  })()`)
  const mouse = async (p, button='left', modifiers=0) => {
    await b.send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button,clickCount:1,modifiers})
    await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button,clickCount:1,modifiers})
    await sleep(120)
  }
  const selected = () => b.evalJs(`[...document.querySelectorAll('.squad-strip button.active')].map(x=>x.textContent)`)
  for (const [width,height,dpr] of [[1920,1080,1],[2560,1440,1],[1536,960,1.25]]) {
    const tag=width+'x'+height
    await b.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:dpr,mobile:false})
    await sleep(450)
    const frame=await probe(), allies=frame.units.filter(u=>u.team==='guild'), a=allies[0], second=allies[1]
    check('D1-frame-'+tag,'画幅完整/页面无滚动/像素整数倍率/高清画布', frame.fitted&&!frame.overflow&&Number.isInteger(frame.pixels)&&frame.nearest&&frame.resolution===dpr&&frame.paused?'PASS':'FAIL',JSON.stringify({...frame,units:undefined}))
    // D2: native keyboard focus opens the shared tip without invoking its action.
    await b.evalJs(`document.querySelector('.speed-pick button:not(:disabled)').focus()`)
    await sleep(100)
    const tip = await b.evalJs(`(()=>{const t=document.querySelector('.game-tooltip'),s=document.querySelector('.game-stage').getBoundingClientRect(),r=t?.getBoundingClientRect();return {text:t?.textContent,described:document.activeElement.getAttribute('aria-describedby')===t?.id,inside:!!r&&r.left>=s.left&&r.right<=s.right&&r.top>=s.top&&r.bottom<=s.bottom}})()`)
    check('D2-tip-'+tag,'键盘可读说明，缩放后悬停框保持在画幅内',tip.text?.includes('实时推进速度')&&tip.described&&tip.inside?'PASS':'FAIL',JSON.stringify(tip))
    if(width===1920) await b.shot('d2-tooltip')
    await pressEscape(b)
    const dismissed = await b.evalJs(`!document.querySelector('.game-tooltip')&&document.activeElement.matches('.speed-pick button')&&!!document.querySelector('.pause-overlay')`)
    check('D2-dismiss-'+tag,'Esc 只收起说明，保留焦点与战斗暂停',dismissed?'PASS':'FAIL')
    await b.evalJs(`document.activeElement.blur()`)
    if (width===1920) {
      const start = await b.evalJs(`(()=>{const r=document.querySelector('.speed-pick button').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`)
      await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',...start}); await sleep(100)
      const end = await b.evalJs(`(()=>{const r=document.querySelector('.game-tooltip')?.getBoundingClientRect();return r?{x:r.left+20,y:r.top+12}:null})()`)
      if (end) for(let i=1;i<=6;i++) {
        await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:start.x+(end.x-start.x)*i/6,y:start.y+(end.y-start.y)*i/6})
        await sleep(20)
      }
      const hovered = await b.evalJs(`!!document.querySelector('.game-tooltip')`)
      check('D2-hover','鼠标移入悬停说明后保持可读',!!end&&hovered?'PASS':'FAIL')
      await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:5,y:5})
      await sleep(200) // 等上一说明的鼠标离开宽限结束；焦点说明按 aria-describedby 精确查找。
      await b.evalJs(`document.querySelector('.sig-btn:disabled')?.parentElement.focus({preventScroll:true})`); await sleep(100)
      const lockedTip = await b.evalJs(`(()=>{const a=document.activeElement,t=document.getElementById(a.getAttribute('aria-describedby'));return !!t&&a.classList.contains('tooltip-anchor')&&a.querySelector('button')?.disabled&&t.textContent.includes('破咒盾击')})()`)
      check('D2-disabled-tip','不可用的招牌技仍可用键盘查看说明',lockedTip?'PASS':'FAIL')
      await pressEscape(b); await b.evalJs(`document.activeElement.blur()`)
    }
    await mouse(a)
    const one=await selected()
    await mouse(second,'left',8)
    const two=await selected()
    check('D1-pick-'+tag,'画面点选保持选择，Shift 加选第二人',one.length===1&&one[0].includes(a.name)&&two.length===2?'PASS':'FAIL',JSON.stringify({one,two}))
    const lo={x:Math.min(...allies.map(u=>u.footX-u.size/2))-4,y:Math.min(...allies.map(u=>u.footY-u.size))-4}
    const hi={x:Math.max(...allies.map(u=>u.footX+u.size/2))+4,y:Math.max(...allies.map(u=>u.footY))+10}
    await b.send('Input.dispatchMouseEvent',{type:'mousePressed',...lo,button:'left',clickCount:1})
    await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',...hi,button:'left',buttons:1})
    await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',...hi,button:'left',clickCount:1})
    await sleep(150)
    const boxed=await selected()
    check('D1-box-'+tag,'实际画面拖框选中整支队伍',boxed.length===allies.length?'PASS':'FAIL',JSON.stringify(boxed))
    await mouse(a)
    // 从两个已绘制角色的真实位置推导投影，独立于实现中的边距和比例公式。
    const dx=allies.find(u=>u.pos.x!==a.pos.x), dy=allies.find(u=>u.pos.y!==a.pos.y)
    const point={x:a.footX+(320-a.pos.x)*(dx.footX-a.footX)/(dx.pos.x-a.pos.x), y:a.footY+(320-a.pos.y)*(dy.footY-a.footY)/(dy.pos.y-a.pos.y)}
    await mouse(point,'right')
    const moved=await b.evalJs(`window.__br.battle.combatants.find(c=>c.id===${JSON.stringify(a.id)}).moveTarget`)
    // 既有小队散开规则为首人 (-36,-40)，此单不改玩法。
    check('D1-move-'+tag,'右键地面坐标不随界面倍率漂移',moved&&Math.abs(moved.x-284)<1&&Math.abs(moved.y-280)<1?'PASS':'FAIL',JSON.stringify(moved))
    const enemy=frame.units.find(u=>u.team==='enemy')
    await mouse(enemy,'right')
    const attack=await b.evalJs(`window.__br.battle.combatants.find(c=>c.id===${JSON.stringify(a.id)}).attackTargetId`)
    const after=await selected()
    check('D1-right-'+tag,'右键敌人下攻击指令且不被地面移动覆盖',attack===enemy.id&&after.length===1&&after[0].includes(a.name)?'PASS':'FAIL',JSON.stringify({attack,after}))
    if (dpr===1) await b.shot('desktop-battle-'+tag)
  }
  await b.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false})
  await sleep(350)
}

/** 一步状态机:每次只做一个动作,返回动作名(null=无事可做)。顺序=提示→事件→战斗→战后→回城→大厅。 */
const STEP = (prio) => `(()=>{${BTN_HELPER}
  const body=document.body.innerText; const r={acted:null,hints:document.querySelectorAll('.battle-hint').length,ending:body.includes('试玩版到此结束')};
  if(r.ending) return r;
  r.acted = hit((t)=>t==='▶ 继续旅程') || hit((t)=>t==='知道了') || hit((t)=>t==='确认'||t==='确定');
  if(!r.acted){const c=[...document.querySelectorAll('.event-choices button')].find((x)=>!x.disabled);if(c){c.click();r.acted='EVENT:'+c.textContent.trim().slice(0,30)}}
  if(!r.acted && document.querySelector('.battle-dock')){
    window.__e2eFastClock=true;
    for(const x of document.querySelectorAll('.auto-pause-menu button[aria-pressed="true"]')) x.click();
    if(window.__br?.battle) window.__br.battle.commands.autoMode=true;
    const pause=document.querySelector('.pause-button');
    if(pause?.textContent.includes('继续')) pause.click();
    r.acted='battle-wait';
  }
  // U27① R1.1+U29 节点图:点可走的地图节点(不选路不能前进,没有「继续深入」)
  if(!r.acted){const c=[...document.querySelectorAll('.dungeon-graph .dg-node.available')][0];if(c){c.click();r.acted='NODE:'+c.textContent.trim().slice(0,20)}}
  if(!r.acted){const c=[...document.querySelectorAll('button')].find((x)=>!x.disabled&&x.textContent.includes('👑 连战'));if(c){c.click();r.acted='BOSS-CHAIN'}}
  if(!r.acted){const x=hit((t)=>t.endsWith('返回公会')); if(x) r.acted='RETURN'}
  if(!r.acted && document.querySelector('.screen-panel')) r.acted='ESC';
  if(!r.acted){
    const maps=btns().filter((x)=>x.textContent.trim().startsWith('🗺')&&!x.textContent.includes('🔒'));
    for(const name of ${JSON.stringify(prio)}){const m=maps.find((x)=>x.textContent.includes(name));
      if(m){ if(window.__lastMap!==name){m.click();window.__lastMap=name;r.acted='MAP:'+name} break }}
  }
  if(!r.acted && body.includes('编制不足')) r.acted='RECRUIT';
  if(!r.acted){const x=hit((t)=>t.startsWith('⚔')&&t.includes('出发')); if(x) r.acted='DEPART'}
  return r })()`

async function recruit(b) {
  await clickText(b, '酒馆'); await sleep(300)
  const r = (await clickText(b, '免费签下')) ?? (await clickText(b, '招募入职')) ?? (await clickText(b, '在酒馆等一晚'))
  await pressEscape(b); await sleep(200)
  return r
}

/** 循环推进直到 until() 为真 / 达到 maxReturns 趟 / 超时。onReturn 在每次回城后调用(此时结算横幅已渲染)。 */
async function drive(b, { prio, maxReturns = Infinity, timeoutMs = 160_000, onReturn, onTick }) {
  const t0 = Date.now()
  let lastProgress = Date.now(); let returns = 0
  while (Date.now() - t0 < timeoutMs) {
    const r = await b.evalJs(STEP(prio))
    if (onTick) await onTick(r)
    if (r.ending) return { ending: true, returns }
    if (r.acted === 'ESC') await pressEscape(b)
    if (r.acted === 'RECRUIT') await recruit(b)
    if (r.acted === 'RETURN') {
      returns++; observations.expeditions++
      await sleep(500)
      if (onReturn) await onReturn()
      if (returns >= maxReturns) return { ending: false, returns }
    }
    if (r.acted && r.acted !== 'ESC' && r.acted !== 'battle-wait') lastProgress = Date.now()
    if (Date.now() - lastProgress > 60_000) {
      const visible = await b.evalJs(`[...document.querySelectorAll('button')].filter(x=>x.offsetWidth&&!x.disabled).map(x=>x.textContent.trim().slice(0,24))`)
      await b.shot('stall')
      throw new Error('60 秒无进展,可见按钮:' + JSON.stringify(visible.slice(0, 30)))
    }
    await sleep(r.acted ? 150 : 400)
  }
  return { ending: false, returns, timeout: true }
}

async function importSave(b, code) {
  await clickText(b, '导入存档'); await sleep(400)
  await b.evalJs(`(()=>{const t=document.querySelector('#save-code');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(t,${JSON.stringify(code)});t.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  await clickText(b, '检查存档'); await sleep(300)
  const ok = await clickText(b, '确认导入'); await sleep(1500)
  if (!ok) throw new Error('导入失败:未出现「确认导入」(存档码被拒?)')
  await clickText(b, '继续旅程'); await sleep(800)
}

// ---------- 存档码:复用 scripts/dev-save.ts(打包到临时目录,不碰仓库里的 docs/dev-save.txt) ----------
let baseSave
async function devSave(level = 12) {
  if (baseSave) return structuredClone(baseSave)
  const { build } = await import('esbuild')
  const work = mkdtempSync(join(tmpdir(), 'devsave-'))
  mkdirSync(join(work, 'bin')); mkdirSync(join(work, 'docs'))
  const outfile = join(work, 'bin', 'dev-save.mjs')
  await build({ entryPoints: [join(ROOT, 'scripts/dev-save.ts')], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent' })
  const r = spawnSync(process.execPath, [outfile, String(level)], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error('dev-save 失败:' + r.stderr)
  baseSave = JSON.parse(Buffer.from(readFileSync(join(work, 'docs', 'dev-save.txt'), 'utf8').trim(), 'base64').toString('utf8'))
  rmSync(work, { recursive: true, force: true })
  return structuredClone(baseSave)
}
const encode = (s) => Buffer.from(JSON.stringify(s), 'utf8').toString('base64')
const REGION1_BOSSES = ['grush', 'talma', 'delveanchor', 'moldreke', 'velhola', 'malsau'] // 荆棘要塞(victor)之前
const REGION1_COMMISSIONS = ['crown-road', 'crown-training', 'crown-grush', 'crown-talma', 'crown-mine', 'crown-ash', 'crown-frost', 'crown-altar', 'crown-thorn']
const MAP_PRIO = ['荆棘要塞', '渊底祭坛', '白霜墓园', '灰烬旧战场', '锈坑矿道', '黑苔沼泽']

// ================= 阶段 =================
async function phaseBuild() {
  console.log('\n▶ build:试玩包产物')
  if (args.build) {
    // 直接复用当前 Node，避免 Windows 下 spawnSync('npx') 找不到 .cmd 包装器。
    for (const cmd of [['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.config.playtest.ts'], ['scripts/inline-assets.mjs']]) {
      const r = spawnSync(process.execPath, cmd, { cwd: ROOT, stdio: 'inherit' })
      if (r.status !== 0) throw new Error(cmd.join(' ') + ' 失败: ' + (r.error?.message ?? r.status))
    }
  }
  if (!existsSync(HTML)) { check('B1', '试玩包存在', 'FAIL', 'dist-playtest/index.html 不存在,加 --build'); return false }
  const html = readFileSync(HTML, 'utf8')
  const mb = statSync(HTML).size / 1e6
  const embedded = html.includes('id="blackmoss-bundled-assets"') && html.includes('data:image/png')
  check('B1', '试玩包已内嵌素材(inline-assets 已执行)', embedded && mb > 10 ? 'PASS' : 'FAIL', `${mb.toFixed(1)}MB,内嵌清单${embedded ? '存在' : '缺失'}`)
  return true
}

async function phaseFresh() {
  console.log(`\n▶ fresh:新档 ${EXPEDITIONS} 趟远征`)
  const b = await openBrowser('fresh')
  try {
    await b.send('Page.navigate', { url: pathToFileURL(HTML).href }); await sleep(2500)
    const volume = await b.evalJs(`document.querySelector('.tb-volume-slider, .mini-volume')?.value ?? null`)
    check('B2', '新玩家默认音量 > 0', volume !== null && Number(volume) > 0 ? 'PASS' : 'FAIL', `滑块值=${volume}`)
    if (!(await clickText(b, '开始新公会'))) throw new Error('标题画面没有「开始新公会」')
    await sleep(1200)
    const exportBeforeEnding = await b.evalJs(`[...document.querySelectorAll('button')].some(x=>x.offsetWidth&&(x.textContent.includes('导出试玩记录')||x.title?.includes('导出试玩记录')))`)
    check('S1', '结束画面之前也能导出试玩记录(流失玩家能回传)', exportBeforeEnding ? 'PASS' : 'FAIL', exportBeforeEnding ? '' : '大厅无导出入口')

    // 2026-10-07 修订:低熟练度当前可选/后续路线均未知，已知路线靠熟练度与情报逐步揭示。
    {
      await clickText(b, '黑苔沼泽'); await sleep(300)
      const depart = await clickText(b, '出发'); await sleep(800)
      if (depart) {
        // Windows 无头窗口可能没有焦点，先模拟前台页，才能触发真实 focus 事件与 React 提示。
        await b.send('Emulation.setFocusEmulationEnabled', { enabled: true })
        await b.evalJs(`document.querySelector('.dungeon-graph .dg-node.available')?.focus()`); await sleep(150)
        const probe = await b.evalJs(`(()=>{
          const body=document.body.innerText
          const cells=[...document.querySelectorAll('.dungeon-graph .dg-node')].map(x=>({t:x.textContent.trim(), n:x.querySelector('.dg-name')?.textContent.trim() ?? '',title:x.title,boss:x.classList.contains('boss')}))
          const icons=[...document.querySelectorAll('.dungeon-graph .dg-node:not(.walked):not(.current) .dg-icon')].map(x=>x.textContent.trim())
          const TERRAINS=['水域','林野','道路','营地','地下','废墟','墓地','圣所','熔岩']
          const leak=cells.filter(c=>/精英|宝箱|暗道|休整|事件/.test(c.t)).map(c=>c.t)
            .concat(icons.filter(ic=>/⚔|☠|🎁|⛺|🕳|👑/.test(ic)))
          const terrainShown=cells.filter(c=>TERRAINS.includes(c.n)).length
          const masked=cells.filter(c=>c.n==='未知岔路').length
          const allMasked=cells.every(c=>c.n==='未知岔路'&&c.title.startsWith('未知岔路')&&!c.boss)
          const flavor=cells.filter(c=>/洼地|猎场|栈道|棚屋|林地/.test(c.n)).map(c=>c.n)
          const tooltip=document.querySelector('.dg-intel')?.textContent??''
          return { inMap: cells.length>0, hasDeep: body.includes('继续深入'), terrainShown, masked, allMasked, leak, flavor,tooltip, focused: document.hasFocus(), active: document.activeElement?.className } })()`)
        check('M1', '地图:不选路不能前进(无「继续深入」)', probe.inMap && !probe.hasDeep ? 'PASS' : 'FAIL', `节点数=${probe.terrainShown + probe.masked}`)
        check('M2', '陌生地图:当前可选与后续全为问号，名称/样式/焦点提示不泄露遭遇',
          probe.inMap && probe.leak.length === 0 && probe.allMasked && probe.terrainShown === 0 && probe.masked > 0 && probe.flavor.length === 0 && probe.tooltip.startsWith('未知岔路') && !/这里能给|走这里可能/.test(probe.tooltip) ? 'PASS' : 'FAIL',
          JSON.stringify(probe))
        await b.shot('fog-entry')
        await clickText(b, '🏳 撤退回城'); await sleep(500)
        await clickText(b, '返回公会'); await sleep(300)
      } else {
        check('M1', '地图:不选路不能前进(无「继续深入」)', 'SKIP', '出发不可点(编制/锁定)')
        check('M2', '陌生地图全盲断言', 'SKIP', '同上')
      }
    }

    let maxHints = 0; let storyReturns = 0; const b3 = []; const b5 = []; const s8 = []
    const journey = await drive(b, {
      prio: MAP_PRIO, maxReturns: EXPEDITIONS, timeoutMs: Number(args.timeout ?? 900_000),
      onTick: (r) => { maxHints = Math.max(maxHints, r.hints) },
      onReturn: async () => {
        const notices = await b.evalJs(`[...document.querySelectorAll('.enc-notices [role=status] p')].map(p=>p.textContent)`)
        observations.notices.push(notices)
        const stories = notices.filter((n) => n.startsWith('📖'))
        if (stories.length === 0) return
        storyReturns++
        observations.stories.push(...stories)
        if (notices.length === stories.length) b3.push(stories[0].slice(0, 60))
        for (const s of stories) {
          if (s.includes('未知之地')) b5.push(s.slice(0, 60))
          if (/[a-z]+-[a-z]+/.test(s)) s8.push(s.slice(0, 60))
        }
      },
    })
    check('FRESH', '新档实际完成目标远征趟数或到达试玩终局',
      journey.returns >= EXPEDITIONS || journey.ending ? 'PASS' : 'FAIL',
      `实际 ${journey.returns} / 目标 ${EXPEDITIONS}${journey.timeout ? '，已超时' : ''}${journey.ending ? '，到达终局' : ''}`)
    await b.shot('end')
    check('S10', '首场战斗引导提示一次只弹一条', maxHints <= 1 ? 'PASS' : 'FAIL', `同屏最多 ${maxHints} 条`)
    const keys = await b.evalJs('Object.keys(localStorage)')
    const stray = keys.filter((k) => !k.startsWith('guild-game-playtest-v1') && !k.startsWith('gg-'))
    check('ISO', '试玩包只写自己的存档键', stray.length === 0 && keys.some((k) => k.startsWith('guild-game-playtest-v1')) ? 'PASS' : 'FAIL', keys.join(','))
  } finally { b.close() }
}

async function phaseEnding() {
  console.log('\n▶ ending:Lv12 满编档打荆棘要塞 → 结束画面 → 导出')
  const save = await devSave(12)
  save.manual = [...REGION1_BOSSES]; save.day = 12
  save.dungeonMastery = { ...save.dungeonMastery, blackmoss: 0 }
  // R3/W5:①给一名成员注入其本命族线装(档案应示「✔ 熟练」);②给一名非守卫成员注入长柄
  // (对非守卫族不熟练,档案应示「⚠ 非熟练·长柄」),并以长柄站位打完整场 Boss 战。
  // 断言放本段而非 fresh:新档功能坞渐进解锁(A10),点不开基地/花名册。
  const HOME_WEAPON = { guard: 'wpn-line-guard', warrior: 'wpn-line-warrior', ranger: 'wpn-line-ranger', priest: 'wpn-line-priest', mage: 'wpn-line-mage', warlock: 'wpn-line-warlock' }
  let homeMember = null; let poleMember = null
  const inject = (m, baseId) => {
    const uid = 'it_' + (Number.isSafeInteger(save.itemSeq) ? save.itemSeq + 1 : 9001)
    save.items = save.items ?? {}
    save.items[uid] = { id: uid, baseId, rolls: [] }
    save.itemSeq = (save.itemSeq ?? 0) + 1
    m.equipment.weapon = uid
    return m.name
  }
  {
    // R5.3a 后武器族绑定生效:dev-save 随机 T2 武器会让持弓牧师整场放不出治疗(设计后果)。
    // 先给全员换本命族线装,保证 ending 用正常满配队;R3B 记录第一个被换装者。
    for (const m of save.members) {
      const home = m.job && HOME_WEAPON[m.job]
      if (!home) continue
      const first = homeMember === null
      inject(m, home)
      if (first) homeMember = { name: m.name, job: m.job }
    }
    // R5.3a 后牧师拿长柄放不出治疗,会让 ending 团灭——注入目标避开守卫(长柄熟练)与牧师(治疗需杖/刃)
    const pole = save.members.find((x) => x.job && x.job !== 'guard' && x.job !== 'priest')
    if (pole) poleMember = { name: inject(pole, 'wpn-t2-tidebreak'), job: pole.job }
    console.log(`  R3 注入:全员本命族线装;长柄(断言后替补)=${poleMember ? poleMember.name + '(' + poleMember.job + ')' : '无'}`)
  }
  // R4.1 生平(U34):给队长注入两条传记(渲染验证;写入路径由 vitest/gameplay 回归覆盖)
  const bioCap = homeMember && save.members.find((m) => m.name === homeMember.name)
  if (bioCap) {
    bioCap.bio = [
      { day: 1, kind: 'joined', text: '经由酒馆传闻加入了公会。', permanent: true },
      { day: 9, kind: 'level-up', text: '成长到了 Lv9,在靶场上待到深夜。' },
    ]
    console.log(`  R4.1 注入:${bioCap.name} 传记 2 条`)
  }
  const b = await openBrowser('ending')
  try {
    await b.send('Page.navigate', { url: pathToFileURL(HTML).href }); await sleep(2500)
    await importSave(b, encode(save))
    await b.send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
    await sleep(300)
    await b.evalJs(`document.fonts.ready.then(()=>true)`)
    const design = await b.evalJs(`(()=>{
      const body=getComputedStyle(document.body),h=getComputedStyle(document.querySelector('.hub-panel h2'));
      const buttons=[...document.querySelectorAll('button')].filter(e=>e.offsetWidth);
      const p=buttons.find(e=>e.classList.contains('primary'));
      return {fonts:[...document.fonts].filter(f=>f.family.includes('Blackmoss')).map(f=>({family:f.family,status:f.status})),body:body.fontFamily,title:h.fontFamily,bodySize:body.fontSize,
        primary:p&&getComputedStyle(p).backgroundImage,straight:buttons.every(e=>getComputedStyle(e).borderTopLeftRadius==='0px'),border:getComputedStyle(document.querySelector('.hub-panel')).borderTopWidth,
        overflow:document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth};
    })()`)
    check('D2-fonts','离线字体实际加载，宋体标题与黑体正文分工',design.fonts.length===3&&design.fonts.every(f=>f.status==='loaded')&&design.body.includes('Blackmoss Sans')&&design.title.includes('Blackmoss Serif')&&design.bodySize==='15px'?'PASS':'FAIL',JSON.stringify(design))
    check('D2-controls','直角细边组件、暗红主行动与无页面溢出',design.straight&&design.border==='1px'&&design.primary?.includes('106, 43, 32')&&!design.overflow?'PASS':'FAIL')
    await b.shot('desktop-hall')
    await b.evalJs(`document.querySelector('.royal-hub-link').click()`); await sleep(300)
    const meter = await b.evalJs(`(()=>{const p=document.querySelector('.royal-rank-progress progress');return {label:p?.getAttribute('aria-label'),max:p?.max,value:p?.value,height:p?.getBoundingClientRect().height}})()`)
    check('D2-meter','王国关系条使用同一组件，保留真实数值与可读标签',meter.label==='王国关系进度'&&meter.max>0&&meter.value>=0&&meter.height===7?'PASS':'FAIL',JSON.stringify(meter))
    await b.shot('d2-royal'); await pressEscape(b); await sleep(200)
    // R3B/R3C:花名册开档案——本命族成员 ✔ 熟练;长柄成员 ⚠ 非熟练·长柄
    await clickText(b, '花名册'); await sleep(600)
    // R3A(U35):武器专修迁入花名册档案页——切换条旁五族按钮渲染
    const fam = await b.evalJs(`(()=>{const g=document.querySelector('[aria-label="武器专修"]');if(!g)return null;return [...g.querySelectorAll('button')].map(x=>x.textContent.trim()).join('|')})()`)
    check('R3A', '花名册·武器专修区渲染五族(U35 迁入)', fam && fam.split('|').length === 5 ? 'PASS' : 'FAIL', fam ?? '未找到 aria-label=武器专修')
    // U35 新增:花名册直开档案+右下略缩图+六维雷达
    const v2 = await b.evalJs(`(()=>({tabs:document.querySelectorAll('.roster-tab').length,side:!!document.querySelector('.roster-side .member-card'),hex:!!document.querySelector('.hexstat svg'),closeBtn:!!document.querySelector('.roster-detail .mini-btn')}))()`)
    check('R4B', '花名册v2:切换条+右下略缩图+六维雷达+嵌入无关闭钮', v2 && v2.tabs >= 3 && v2.side && v2.hex && !v2.closeBtn ? 'PASS' : 'FAIL', JSON.stringify(v2))
    await pressEscape(b); await sleep(300)
    // U36 R4C:情报 v2——买官署密报(恒真),买完立刻看到文本+入清单
    await clickText(b, '酒馆'); await sleep(500)
    await b.evalJs(`(()=>{const d=document.querySelector('[aria-label="情报副本"]');d.value='blackmoss';d.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await b.evalJs(`(()=>{const sels=[...document.querySelectorAll('.potion-supply select')];const tier=sels.find(x=>x.getAttribute('aria-label')==='情报档位');if(tier){tier.value='royal';tier.dispatchEvent(new Event('change',{bubbles:true}))}})()`)
    await b.evalJs(`[...document.querySelectorAll('.potion-supply button')].find(x=>x.textContent.includes('买情报'))?.click()`); await sleep(500)
    const intel = await b.evalJs(`(()=>({fresh:document.querySelector('.intel-fresh')?.textContent??null,items:[...document.querySelectorAll('.intel-list .intel-item')].map(li=>li.textContent),stock:document.querySelector('.potion-supply .hint')?.textContent.includes('货架上有')}))()`)
    check('R4C', '情报v2:官署密报买完即见文本+入清单(未验证)', intel && intel.fresh && intel.fresh.length > 8 && intel.items.length === 1 && intel.items[0].includes('未验证') ? 'PASS' : 'FAIL', JSON.stringify(intel).slice(0, 120))
    await pressEscape(b); await sleep(300)
    // 真正购买、出发、刷新：零熟练度也能凭情报看清部分路线，不能全图透视。
    await clickText(b, '黑苔沼泽'); await sleep(200)
    await clickText(b, '出发'); await sleep(600)
    const scoutProbe = `(()=>{const names=[...document.querySelectorAll('.dg-name')].map(x=>x.textContent);return {known:names.filter(n=>n!=='未知岔路').length,masked:names.filter(n=>n==='未知岔路').length,hint:document.querySelector('.route-choice>.hint')?.textContent??'',intel:document.querySelector('.intel-list')?.textContent??''}})()`
    const scout = await b.evalJs(scoutProbe)
    check('M3', '情报侦察:零熟练度提前看清部分路线，并保留怪物资料',
      scout.known > 0 && scout.masked > 0 && scout.hint.includes('熟练度 0') && scout.hint.includes('本趟提前揭示一档') && scout.intel.includes('未验证') ? 'PASS' : 'FAIL', JSON.stringify(scout).slice(0, 200))
    const nodesFit = await b.evalJs(`(()=>{const g=document.querySelector('.dungeon-graph').getBoundingClientRect();const nodes=[...document.querySelectorAll('.dg-node')].map(n=>n.getBoundingClientRect());return {count:nodes.length,inside:nodes.every(r=>r.top>=g.top&&r.bottom<=g.bottom&&r.left>=g.left&&r.right<=g.right),separate:nodes.every((r,i)=>nodes.slice(i+1).every(s=>r.right<=s.left||s.right<=r.left||r.bottom<=s.top||s.bottom<=r.top))}})()`)
    check('D2-map','节点标题放大后首尾不裁切、相邻层不重叠',nodesFit.count>0&&nodesFit.inside&&nodesFit.separate?'PASS':'FAIL',JSON.stringify(nodesFit))
    await b.shot('scouted-map')
    await b.send('Page.reload'); await sleep(1500)
    await clickText(b, '继续旅程'); await sleep(500)
    const resumed = await b.evalJs(scoutProbe)
    check('M4', '刷新后情报揭示与未知路线保持，永久熟练度不变',
      scout.known > 0 && JSON.stringify(resumed) === JSON.stringify(scout) ? 'PASS' : 'FAIL', JSON.stringify(resumed).slice(0, 200))
    // 此样本只检查地图；恢复原终局夹具再继续既有武器/通关检查。
    await b.send('Page.reload'); await sleep(1200)
    await importSave(b, encode(save))
    const openProfile = async (name) => {
      // 自导航:名册不在场才点「花名册」——功能坞按钮是开关式,名册开着时再点=关闭
      const hasRoster = await b.evalJs(`!!document.querySelector('.member-card')`)
      if (!hasRoster) { await clickText(b, '花名册'); await sleep(400) }
      // U35:花名册 v2 右栏只显示当前选中者的卡——切人走顶部切换条
      await b.evalJs(`[...document.querySelectorAll('.roster-tab')].find(t=>t.textContent.includes(${JSON.stringify(name)}))?.click()`)
      await sleep(400)
      const text = await b.evalJs(`document.querySelector('[data-testid="weapon-proficiency"]')?.textContent ?? null`)
      // R4.1(U34):同一趟顺带读生平栏(条数/永久徽标/倒序首条)
      const bio = await b.evalJs(`(()=>{const l=document.querySelector('.bio-list');if(!l)return null;return {n:l.children.length,flag:l.textContent.includes('⚑'),first:l.textContent.includes('D9')}})()`)
      const art = await b.evalJs(`(()=>{const nodes=[...document.querySelectorAll('.member-sheet .hero-portrait canvas,.member-sheet .item-art canvas')];return {count:nodes.length,painted:nodes.every(c=>c.getContext('2d').getImageData(0,0,32,32).data.some((v,i)=>i%4===3&&v>0))}})()`)
      const label = name === poleMember?.name ? 'polearm' : 'home'
      check('ART-' + label, '人物档案和装备画布有实际像素', art.count > 1 && art.painted ? 'PASS' : 'FAIL', JSON.stringify(art))
      const gear = await b.evalJs(`Array.from(document.querySelectorAll('.member-panel select.slot-select'),s=>({value:s.value,text:s.selectedOptions[0]?.textContent??''}))`)
      check('GEAR-' + label, '换装下拉正确显示当前穿戴，不误报空槽', gear.length === 3 && gear.every(s=>s.value && !s.text.endsWith('·空')) ? 'PASS' : 'FAIL', JSON.stringify(gear).slice(0, 200))
      const controlsFit = await b.evalJs(`(()=>{const s=[...document.querySelectorAll('.member-card .slot-select')],icons=[...document.querySelectorAll('.member-card .gear-control>.item-art')];return {metrics:s.map(e=>({space:getComputedStyle(e).whiteSpace,lineHeight:getComputedStyle(e).lineHeight,font:getComputedStyle(e).fontSize,height:e.clientHeight})),singleLine:s.length===3&&s.every(e=>{const c=getComputedStyle(e);return c.whiteSpace==='nowrap'&&e.clientHeight>=parseFloat(c.fontSize)+parseFloat(c.paddingTop)+parseFloat(c.paddingBottom)}),icons:icons.length===3&&icons.every(e=>e.clientWidth<=40)}})()`)
      check('D2-gear-'+label,'长装备名保持单行、图标框不拉伸',controlsFit.singleLine&&controlsFit.icons?'PASS':'FAIL',JSON.stringify(controlsFit))
      await b.evalJs(`document.querySelector('.roster-v2').parentElement.scrollTop=0`)
      const overlayFrame = await b.evalJs(`(()=>{const r=document.querySelector('.roster-v2').parentElement.getBoundingClientRect(),stage=document.querySelector('.game-stage').getBoundingClientRect();return {width:r.width,height:r.height,stageWidth:stage.width,stageHeight:stage.height,sheetWidth:document.querySelector('.member-sheet').clientWidth}})()`)
      check('D1-profile-'+label,'花名册占满舞台且档案不被大厅侧栏裁剪',Math.abs(overlayFrame.width-overlayFrame.stageWidth)<1&&Math.abs(overlayFrame.height-overlayFrame.stageHeight)<1&&overlayFrame.sheetWidth>=700?'PASS':'FAIL',JSON.stringify(overlayFrame))
      await b.shot('profile-' + label)
      if (label === 'home') {
        const logicalWidth = await b.evalJs(`document.querySelector('.member-sheet').clientWidth`)
        await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false })
        await sleep(250)
        const narrow = await b.evalJs(`(()=>{const sheet=document.querySelector('.member-sheet');const panel=document.querySelector('.member-panel');const tabs=document.querySelector('.roster-tabs');const overlay=document.querySelector('.roster-v2').parentElement;const r=sheet.getBoundingClientRect();return {logicalWidth:sheet.clientWidth,stageWidth:document.querySelector('.game-stage').clientWidth,width:r.width,overflow:Math.max(sheet.scrollWidth-sheet.clientWidth,overlay.scrollWidth-overlay.clientWidth),embedded:!panel.classList.contains('screen-overlay'),belowTabs:r.top>=tabs.getBoundingClientRect().bottom,slots:panel.querySelectorAll('select.slot-select').length}})()`)
        check('ART-narrow', 'U38 桌面画幅在窄窗完整缩放，档案/换装未溢出或遮挡', narrow.logicalWidth === logicalWidth && logicalWidth >= 700 && narrow.stageWidth === 1920 && narrow.overflow <= 1 && narrow.embedded && narrow.belowTabs && narrow.slots === 3 ? 'PASS' : 'FAIL', JSON.stringify(narrow))
        await b.shot('profile-narrow')
        await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
      }
      await pressEscape(b); await sleep(250)
      return { text, bio }
    }
    if (homeMember) {
      const { text: prof, bio } = await openProfile(homeMember.name)
      check('R3B', '本命族武器档案页示「✔ 熟练」', !!prof && prof.includes('熟练') && !prof.includes('非熟练') ? 'PASS' : 'FAIL', (prof ?? '元素缺失').slice(0, 60))
      check('R4A', '档案页生平栏:条目渲染+⚑永久徽标+倒序(D9 在 D1 前)', bio && bio.n >= 2 && bio.flag && bio.first ? 'PASS' : 'FAIL', JSON.stringify(bio))
    }
    if (poleMember) {
      const { text: prof } = await openProfile(poleMember.name)
      check('R3C', '长柄注入后档案页示「非熟练·长柄」', !!prof && prof.includes('非熟练') && prof.includes('长柄') ? 'PASS' : 'FAIL', (prof ?? '元素缺失').slice(0, 60))
      // 断言完成后把残装成员换下(替补):非熟练长柄会让 ending 团灭,断言目的只在 UI 提示
      const hasRoster2 = await b.evalJs(`!!document.querySelector('.member-card')`)
      if (!hasRoster2) { await clickText(b, '花名册'); await sleep(400) }
      await b.evalJs(`(()=>{const cards=[...document.querySelectorAll('.member-card')];const t=cards.find((c)=>c.textContent.includes(${JSON.stringify(poleMember.name)}));const btn=[...(t?.querySelectorAll('button')??[])].find((x)=>x.textContent.includes('替补'));btn?.click()})()`)
      await sleep(300)
      console.log(`  R3C 收尾:已把 ${poleMember.name} 替补下场`)
      // R5.3e(U33⑥):装备下拉展示武器族+「换上后失去」(在名册成员卡上直接验)
      {
        const hasRoster3 = await b.evalJs(`!!document.querySelector('.member-card')`)
        if (!hasRoster3) { await clickText(b, '花名册'); await sleep(400) }
        await b.evalJs(`[...document.querySelectorAll('.roster-tab')].find(t=>t.textContent.includes(${JSON.stringify(homeMember.name)}))?.click()`); await sleep(400)
        const drop = await b.evalJs(`(()=>{
          const cards=[...document.querySelectorAll('.member-card')]
          const t=cards.find((c)=>c.textContent.includes(${JSON.stringify(homeMember.name)}))
          const sel=t?.querySelector('.slot-select')
          if(!sel) return null
          const opts=[...sel.querySelectorAll('option')].map((o)=>o.textContent)
          return { hasFamily: opts.some((o)=>o.includes('刃')&&o.includes('✔熟练')), hasLose: opts.some((o)=>o.includes('换上后失去')) }
        })()`)
        check('R3D', '装备下拉:武器族+熟练标记+「换上后失去」', drop && drop.hasFamily && drop.hasLose ? 'PASS' : 'FAIL', JSON.stringify(drop))
      }
    }
    await pressEscape(b); await sleep(200)
    // U42 #9.2:挂机中技能面板仍可点+右键切换自动施法(接管语义)——黑苔打一场,暂停后验面板
    {
      await b.evalJs(`localStorage.setItem('gg-autopause', JSON.stringify({bossCast:true,lowHp:true,allyDown:true,battleStart:true}))`)
      await clickText(b, '黑苔沼泽'); await sleep(300)
      await clickText(b, '出发'); await sleep(700)
      for (let i = 0; i < 8; i++) {
        const inBattle = await b.evalJs(`!!document.querySelector('.battle-dock')`)
        if (inBattle) break
        await b.evalJs(`document.querySelector('.dungeon-graph .dg-node.available')?.click()`); await sleep(700)
      }
      // U42 #9.4:自动暂停(战斗开始)——中央横幅原因可见+计时器停止;空格继续
      await sleep(500)
      const ap1 = await b.evalJs(`document.querySelector('.pause-overlay')?.textContent ?? null`)
      const t1 = await b.evalJs(`window.__br?.battle?.tick ?? null`)
      await sleep(700)
      const t2 = await b.evalJs(`window.__br?.battle?.tick ?? null`)
      check('AP1', '自动暂停(战斗开始):中央横幅原因可见+计时器停止', ap1 === '已暂停:战斗开始' && Number.isFinite(t1) && t1 === t2 ? 'PASS' : 'FAIL', `overlay=${ap1},tick ${t1}/${t2}`)
      await desktopBattleChecks(b)
      await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 })
      await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 })
      await sleep(400)
      const resumed = await b.evalJs(`!document.querySelector('.pause-overlay')`)
      check('AP2', '空格继续(横幅消失)', resumed ? 'PASS' : 'FAIL', `resumed=${resumed}`)
      await clickText(b, '暂停'); await sleep(300)
      await clickText(b, '挂机'); await sleep(300) // 开挂机:面板必须仍可点(U42 取消"挂机=禁手")
      // 暂停后冷却冻结:逐个成员找"非冷却技能"(自动施法在入场 1 秒内可能已把首技能打进冷却)
      const panel = await b.evalJs(`(async()=>{
        const strip=document.querySelector('.squad-strip')
        if(!strip) return { fail:'no-squad-strip' }
        const members=[...strip.querySelectorAll('button')]
        for (const mb of members) {
          mb.click()
          await new Promise(r=>setTimeout(r,120))
          const skills=[...document.querySelectorAll('.skill-strip button')].filter(x=>x.classList.contains('skill-button')&&!x.disabled)
          if(skills.length===0) continue
          skills[0].click()
          await new Promise(r=>setTimeout(r,80))
          const aimed=skills[0].className.includes('active')
          skills[0].dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))
          await new Promise(r=>setTimeout(r,120))
          const dimmed=skills[0].dataset.auto==='false'
          skills[0].dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))
          await new Promise(r=>setTimeout(r,120))
          const restored=skills[0].dataset.auto==='true'
          return { skills:skills.length, aimed, dimmed, restored }
        }
        return { fail:'all-members-cooling', members:members.length }
      })()`)
      check('AC1', '挂机中技能面板仍可点,右键切换自动施法(开→关→开)', panel && !panel.fail && panel.skills > 0 && panel.aimed && panel.dimmed && panel.restored ? 'PASS' : 'FAIL', JSON.stringify(panel))
      await b.shot('autopanel')
      // D3 队伍头像现在也能作为治疗目标；先退出上一项的瞄准，才开始选人测试。
      await pressEscape(b); await sleep(200)
      // U42 #9.3:Ctrl+1 编队 → Esc 清选 → 按 1 选回(RTS 编队键)
      {
        await b.evalJs(`[...document.querySelectorAll('.squad-strip button')][0]?.click()`); await sleep(150)
        await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: '1', code: 'Digit1', windowsVirtualKeyCode: 49, modifiers: 2 })
        await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: '1', code: 'Digit1', windowsVirtualKeyCode: 49, modifiers: 2 })
        await sleep(150)
        await pressEscape(b); await sleep(150)
        const cleared = await b.evalJs(`!document.querySelector('.squad-strip button.active')`)
        await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: '1', code: 'Digit1', windowsVirtualKeyCode: 49 })
        await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: '1', code: 'Digit1', windowsVirtualKeyCode: 49 })
        await sleep(150)
        const recalled = await b.evalJs(`!!document.querySelector('.squad-strip button.active')`)
        check('RTS1', 'Ctrl+1 编队→Esc 清选→按 1 选回', cleared && recalled ? 'PASS' : 'FAIL', `cleared=${cleared},recalled=${recalled}`)
      }
      // U42 #9.4:Q 进入瞄准→点目标→技能进入冷却(暂停中验证,冷却冻结=判定可靠)
      {
        const picked = await b.evalJs(`(async()=>{for(const mb of document.querySelectorAll('.squad-strip button')){mb.click();await new Promise(r=>setTimeout(r,120));const b1=[...document.querySelectorAll('.skill-strip button')].find(x=>x.textContent.includes('Q')&&!x.disabled);if(b1)return true}return false})()`)
        await sleep(150)
        await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'q', code: 'KeyQ', windowsVirtualKeyCode: 81 })
        await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'q', code: 'KeyQ', windowsVirtualKeyCode: 81 })
        await sleep(250)
        const target = await b.evalJs(`(()=>{
          const label=document.querySelector('.aim-targets button')?.textContent;
          const br=window.__br, u=[...br.units.values()].find(u=>u.combatant.alive&&u.combatant.name===label);
          if(!u)return null;
          const p=u.container.toGlobal({x:0,y:-16*u.bodyScale}),r=br.app.canvas.getBoundingClientRect();
          return {x:r.left+p.x,y:r.top+p.y};
        })()`)
        if(target){
          await b.send('Input.dispatchMouseEvent',{type:'mousePressed',...target,button:'left',clickCount:1})
          await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',...target,button:'left',clickCount:1})
          await sleep(200)
        }
        const cast=await b.evalJs(`(()=>{const btn=[...document.querySelectorAll('.skill-strip button')].find(x=>x.textContent.includes('Q'));return {cooled:!!btn&&btn.disabled,text:btn?.textContent??null}})()`)
        check('Q1', 'Q 瞄准→鼠标点战场目标→技能进入冷却', picked && cast && !cast.fail && cast.cooled ? 'PASS' : 'FAIL', JSON.stringify({ picked, ...cast }))
      }
      // U42 #9.6①:左键点地面=清选择(RTS 语义:左键只选,右键才下令)
      {
        await b.evalJs(`[...document.querySelectorAll('.squad-strip button')][0]?.click()`); await sleep(150)
        const before = await b.evalJs(`!!document.querySelector('.squad-strip button.active')`)
        const rect = await b.evalJs(`(()=>{const r=document.querySelector('.stage canvas').getBoundingClientRect();return {x:Math.round(r.left),y:Math.round(r.top)}})()`)
        await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x + 400, y: rect.y + 240, button: 'left', clickCount: 1 })
        await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x + 400, y: rect.y + 240, button: 'left', clickCount: 1 })
        await sleep(250)
        const after = await b.evalJs(`!!document.querySelector('.squad-strip button.active')`)
        check('LB1', '左键点地面=清选择', before && !after ? 'PASS' : 'FAIL', `before=${before},after=${after}`)
      }
      // 撤退离场(防胜利抢跑:先下撤退令再恢复实时;轮询归城,rest 相走地图撤退兜底)
      await clickText(b, '撤退令')
      await clickText(b, '继续')
      for (let i = 0; i < 40; i++) {
        await sleep(500)
        const st = await b.evalJs(`(()=>{
          const vis=[...document.querySelectorAll('button')].filter(x=>x.offsetWidth||x.offsetHeight)
          if(vis.find(x=>!x.disabled&&x.textContent.includes('返回公会'))) return 'back'
          if(vis.find(x=>!x.disabled&&x.textContent.includes('撤退回城'))) return 'map-retreat'
          if(vis.find(x=>x.textContent.includes('撤离中'))) return 'extracting'
          return 'battle'
        })()`)
        if (st === 'back') { await clickText(b, '返回公会'); await sleep(500); break }
        if (st === 'map-retreat') { await clickText(b, '🏳 撤退回城'); await sleep(800); continue }
      }
      const atHall = await b.evalJs(`[...document.querySelectorAll('button')].some(x=>x.offsetWidth&&x.textContent.includes('出发'))`)
      if (!atHall) { await clickText(b, '返回公会'); await sleep(500) }
    }
    const t0 = Date.now()
    const r = await drive(b, { prio: ['荆棘要塞'], timeoutMs: 240_000 })
    await b.shot('ending')
    check('END', '通关荆棘要塞后出现「试玩版到此结束」', r.ending ? 'PASS' : 'FAIL', `${Math.round((Date.now() - t0) / 1000)}s,${r.returns} 次回城`)
    if (!r.ending) return
    await clickText(b, '导出试玩记录'); await sleep(800)
    await clickText(b, '战报卡'); await sleep(1500)
    const dl = await b.evalJs('window.__dl')
    const rec = dl.find((d) => d.name.startsWith('playtest-report-'))
    let keys = []
    try { keys = Object.keys(JSON.parse(rec?.text ?? '{}')) } catch { /* 非 JSON */ }
    const need = ['build', 'day', 'manual', 'playMeta', 'memorial', 'stories', 'survey']
    check('EXP', '导出试玩记录为完整 JSON', need.every((k) => keys.includes(k)) ? 'PASS' : 'FAIL', rec ? `${rec.name} 字段:${keys.join(',')}` : '未截获下载')
    const card = dl.find((d) => d.name.startsWith('guild-war-report-'))
    check('CARD', '战报卡生成 PNG', card && card.kind === 'data:' && card.size > 10_000 ? 'PASS' : 'FAIL', card ? `${card.name} ${Math.round(card.size / 1024)}KB(dataURL)` : '未截获下载')
    if (rec?.text) writeFileSync(join(OUT, 'playtest-report.json'), rec.text)
  } finally { b.close() }
}

async function phaseRegion2() {
  console.log('\n▶ region2:试玩版能否经王国委托进入版图二')
  const save = await devSave(12)
  save.manual = [...REGION1_BOSSES, 'victor']; save.day = 20
  save.kingdom = { active: [], completed: REGION1_COMMISSIONS.map((id) => ({ id, choice: 'coin', day: 10 })) }
  const b = await openBrowser('region2')
  try {
    await b.send('Page.navigate', { url: pathToFileURL(HTML).href }); await sleep(2500)
    await importSave(b, encode(save))
    await clickText(b, '王国委托'); await sleep(600)
    const offered = (await bodyText(b)).includes('山口另一端的来信')
    await clickText(b, '接下委托', true); await sleep(500)
    await clickText(b, '前往作战板', true); await sleep(800)
    await clickText(b, '风险'); await sleep(2500)
    const body = await bodyText(b)
    const entered = body.includes('烬石隘口') && (body.includes('跑到结束') || body.includes('暂停'))
    await b.shot('region2')
    check('B6', '试玩版不能进入版图二(烬石隘口)', entered ? 'FAIL' : 'PASS', `委托${offered ? '可接' : '未出现'};${entered ? '已进入烬石隘口战斗' : '未进入'}`)
  } finally { b.close() }
}


// D3: 五人、读条和高塔用独立档与正常时钟，覆盖新 HUD 的两条真实入口。
async function phaseHud() {
  console.log('\n▶ hud:五人队、头像治疗、首领读条与高塔')
  const save=await devSave(12); save.manual=[...REGION1_BOSSES]; save.day=12
  // 与 ending 同样给测试队伍本命武器；随机跨族武器本来就可能禁用技能。
  for(const m of save.members) {
    const uid='it_'+(++save.itemSeq); save.items[uid]={id:uid,baseId:'wpn-line-'+m.job,rolls:[]};m.equipment.weapon=uid
  }
  const b=await openBrowser('hud')
  const key=async(k,code,vk)=>{await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:vk});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:vk});await sleep(120)}
  const bounds=async(label,expected)=>{
    await b.evalJs(`document.activeElement?.blur()`);await sleep(220)
    const fit=await b.evalJs(`(()=>{
      const stage=document.querySelector('.game-stage').getBoundingClientRect();
      const buttons=[...document.querySelectorAll('.battle-dock button,.battle-party button,.battle-tempo button')].filter(x=>x.offsetWidth);
      const bad=buttons.filter(x=>{const r=x.getBoundingClientRect();return r.left<stage.left||r.top<stage.top||r.right>stage.right||r.bottom>stage.bottom}).map(x=>x.textContent);
      const dock=document.querySelector('.battle-dock'),party=document.querySelector('.battle-party');
      const br=window.__br,canvas=br.app.canvas.getBoundingClientRect(),hud=[...document.querySelectorAll('.battle-dock,.battle-party,.battle-route,.battle-intel,.battle-journal')].map(x=>x.getBoundingClientRect());
      const obscured=[...br.units.values()].filter(u=>u.combatant.alive).filter(u=>{
        const p=u.container.toGlobal({x:0,y:0}),x=canvas.left+p.x,y=canvas.top+p.y,half=16*u.bodyScale;
        return hud.some(r=>x+half>r.left&&x-half<r.right&&y+8>r.top&&y-2*half<r.bottom);
      }).map(u=>u.combatant.name);
      return {party:party.querySelectorAll('.party-frame').length,signatures:document.querySelectorAll('.sig-btn').length,bad,obscured,scroll:dock.scrollWidth>dock.clientWidth+1,debug:/tick|跑到结束/.test(document.querySelector('.battle-panel').innerText)};
    })()`)
    check('D3-fit-'+label,'小队与常用指令同屏，角色不被 HUD 遮挡，无底栏溢出',fit.party===expected&&fit.signatures===expected&&!fit.bad.length&&!fit.obscured.length&&!fit.scroll&&!fit.debug?'PASS':'FAIL',JSON.stringify(fit))
  }
  try {
    await b.send('Page.navigate',{url:pathToFileURL(HTML).href});await sleep(2500)
    await b.evalJs(`localStorage.setItem('gg-autopause',JSON.stringify({bossCast:true,lowHp:false,allyDown:false,battleStart:true}))`)
    await importSave(b,encode(save))
    await clickText(b,'荆棘要塞');await sleep(300);await clickText(b,'出发');await sleep(500)
    await b.evalJs(`document.querySelector('.dg-node.available')?.click()`);await sleep(650)
    for(const [width,height,dpr] of [[1920,1080,1],[2560,1440,1],[1536,960,1.25]]) {
      await b.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:dpr,mobile:false});await sleep(350)
      await bounds('five-'+width,5)
      if(width!==1536) await b.shot('five-'+width)
    }
    // 暂停中圣疗经头像指定目标，推进后消耗冷却；不注入结果或绕过技能判定。
    await b.evalJs(`document.querySelector('.sig-btn[aria-label*="圣疗"]')?.click()`);await sleep(120)
    const heal=await b.evalJs(`(()=>{const br=window.__br,b=br.battle,priest=b.combatants.find(c=>c.specId==='priest-holy');const target=b.combatants.find(c=>c.team==='guild'&&c.memberId!==priest?.memberId);const btn=[...document.querySelectorAll('.party-frame')].find(x=>x.getAttribute('aria-label').startsWith(target?.name));btn?.click();return {caster:priest?.memberId,target:target?.memberId}})()`)
    await sleep(180)
    const queued=await b.evalJs(`window.__br.battle.commands.signatures?.[${JSON.stringify(heal.caster)}]`)
    check('D3-heal-target','圣疗点击队友头像后将真实目标加入指令',!!heal.caster&&queued?.targetId===heal.target?'PASS':'FAIL',JSON.stringify({heal,queued}))
    await key(' ','Space',32);await sleep(220);await key(' ','Space',32)
    const cool=await b.evalJs(`(window.__br.battle.signatureCd?.[${JSON.stringify(heal.caster)}]??0)>window.__br.battle.tick`)
    check('D3-heal-cooldown','暂停下达的圣疗推进后进入冷却',cool?'PASS':'FAIL')
    // G/P 快捷键复用按钮命令；全队药水在无单选时也可使用。
    const before=await b.evalJs(`({stance:window.__br.battle.commands.stance,protect:window.__br.battle.commands.protectRetreat,fury:window.__br.battle.commands.furyStock})`)
    await key('g','KeyG',71);await key('p','KeyP',80);await key('x','KeyX',88)
    const after=await b.evalJs(`({stance:window.__br.battle.commands.stance,protect:window.__br.battle.commands.protectRetreat,fury:window.__br.battle.commands.furyStock})`)
    check('D3-commands','阵型/保护/无单选药水快捷键作用于真实状态',before.stance!==after.stance&&before.protect!==after.protect&&before.fury-1===after.fury?'PASS':'FAIL',JSON.stringify({before,after}))
    // 构造只在此一次性浏览器中的机制窗口，用现有敌人模拟结构检查多读条与两种应对，不影响玩家档。
    await b.evalJs(`(()=>{const b=window.__br.battle,e=b.combatants.find(c=>c.team==='enemy');e.boss=true;e.bossMechanics=[{id:'hud-cast',kind:'cast-buff',name:'战意咏唱',params:{castTicks:50,breakDamage:100}},{id:'hud-aoe',kind:'telegraph-aoe',name:'震地',params:{telegraphTicks:50,radius:75}}];e.mech={'cast-buff':{until:b.tick+30,taken:12},'telegraph-aoe':{until:b.tick+40,slamCenter:{x:320,y:180}}};document.querySelector('.party-frame')?.click()})()`);await sleep(350)
    await b.send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});await sleep(250)
    const cast=await b.evalJs(`(()=>{const a=[...document.querySelectorAll('.mechanic-warning')];return {n:a.length,text:a.map(x=>x.textContent),disabled:document.querySelectorAll('.speed-opt')[2]?.disabled}})()`)
    check('D3-mechanics','多个机制窗口分别显示打断/应对，首领限制三倍速',cast.n===2&&cast.text.some(x=>x.includes('可打断'))&&cast.text.some(x=>x.includes('准备应对'))&&cast.disabled?'PASS':'FAIL',JSON.stringify(cast))
    await b.shot('boss-mechanics')
    // 高塔从公会入口重进，测试与正式远征隔离；不把 5 人夹具的机制状态带入。
    await b.send('Page.reload'); await sleep(1200)
    await importSave(b,encode(save))
    await clickText(b,'进入高塔');await sleep(750)
    const tower=await b.evalJs(`({title:document.querySelector('.battle-route h2')?.textContent,tick:window.__br?.battle?.tick,paused:!!document.querySelector('.pause-overlay'),party:document.querySelectorAll('.party-frame').length})`)
    await bounds('tower',3)
    await key(' ','Space',32);await sleep(230)
    const resumed=await b.evalJs(`({tick:window.__br?.battle?.tick,paused:!!document.querySelector('.pause-overlay')})`)
    await key(' ','Space',32);const stopped=await b.evalJs(`window.__br?.battle?.tick`);await sleep(250)
    const frozen=await b.evalJs(`window.__br?.battle?.tick`)
    check('D3-tower-pause','高塔空格恢复/暂停真实时钟',tower.title?.includes('黑苔高塔')&&tower.paused&&!resumed.paused&&resumed.tick>tower.tick&&stopped===frozen?'PASS':'FAIL',JSON.stringify({tower,resumed,stopped,frozen}))
    await b.shot('tower')
    await b.evalJs(`document.querySelector('.party-frame').click()`);await sleep(120)
    const towerBefore=await b.evalJs(`({fury:window.__br.battle.commands.furyStock,hold:!!window.__br.battle.combatants.find(c=>c.team==='guild').holdGround})`)
    await key('h','KeyH',72);await key('x','KeyX',88)
    const towerAfter=await b.evalJs(`({fury:window.__br.battle.commands.furyStock,hold:!!window.__br.battle.combatants.find(c=>c.team==='guild').holdGround})`)
    check('D3-tower-keys','高塔坚守与药水快捷键写入当前高塔战斗',towerBefore.hold!==towerAfter.hold&&towerBefore.fury-1===towerAfter.fury?'PASS':'FAIL',JSON.stringify({towerBefore,towerAfter}))
    const ground=await b.evalJs(`(()=>{const r=window.__br.app.canvas.getBoundingClientRect();return {x:r.left+r.width*.55,y:r.top+r.height*.62}})()`)
    await b.send('Input.dispatchMouseEvent',{type:'mousePressed',...ground,button:'right',clickCount:1})
    await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',...ground,button:'right',clickCount:1});await sleep(120)
    const moving=await b.evalJs(`!!window.__br.battle.combatants.find(c=>c.team==='guild').moveTarget`)
    await key('s','KeyS',83)
    const stoppedOrder=await b.evalJs(`!window.__br.battle.combatants.find(c=>c.team==='guild').moveTarget`)
    check('D3-tower-move','高塔真实右键移动与 S 停止使用同一战斗',moving&&stoppedOrder?'PASS':'FAIL')
    await key('r','KeyR',82);await sleep(150)
    const retreat=await b.evalJs(`({until:window.__br.battle.commands.extractingUntil,tick:window.__br.battle.tick,text:document.querySelector('.retreat-button')?.textContent})`)
    check('D3-tower-retreat','高塔撤退键进入既有撤离倒计时',retreat.until>retreat.tick&&retreat.text?.includes('撤离中')?'PASS':'FAIL',JSON.stringify(retreat))
  } finally {b.close()}
}

// ================= 主流程 =================
const phases = { build: phaseBuild, fresh: phaseFresh, ending: phaseEnding, region2: phaseRegion2, hud: phaseHud }
const order = PHASE === 'all' ? ['build', 'fresh', 'ending', 'region2', 'hud'] : PHASE.split(',')
let crashed = null
try {
  for (const p of order) {
    if (!phases[p]) throw new Error('未知阶段:' + p)
    const ok = await phases[p]()
    if (p === 'build' && ok === false) break
  }
} catch (e) {
  crashed = String(e?.message ?? e)
  check('FLOW', '试玩流程未中断', 'FAIL', crashed)
}

check('CONSOLE', '全程无控制台错误', observations.consoleErrors.length === 0 ? 'PASS' : 'FAIL', observations.consoleErrors.slice(0, 3).join(' | '))
const report = { at: new Date().toISOString(), phases: order, checks, crashed, ...observations }
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2))
const fails = checks.filter((c) => c.status === 'FAIL').length
console.log(`\n结果:${checks.filter((c) => c.status === 'PASS').length} 通过 / ${fails} 失败 / ${checks.filter((c) => c.status === 'SKIP').length} 跳过;远征 ${observations.expeditions} 趟,故事 ${observations.stories.length} 条`)
console.log('产物:' + OUT)
process.exit(fails > 0 || crashed ? 1 : 0)
