// 试玩包全流程实机回归(G2 发包前的验收脚本):打开 file:// 单文件试玩包,按阶段跑真实玩家路径并断言已知问题。
//
// 用法:
//   node scripts/e2e-playtest-full.mjs [--build] [--phase=all|build|fresh|ending|region2] [--expeditions=8]
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

/** 一步状态机:每次只做一个动作,返回动作名(null=无事可做)。顺序=提示→事件→战斗→战后→回城→大厅。 */
const STEP = (prio) => `(()=>{${BTN_HELPER}
  const body=document.body.innerText; const r={acted:null,hints:document.querySelectorAll('.battle-hint').length,ending:body.includes('试玩版到此结束')};
  if(r.ending) return r;
  r.acted = hit((t)=>t==='▶ 继续旅程') || hit((t)=>t==='知道了') || hit((t)=>t==='确认'||t==='确定');
  if(!r.acted){const c=[...document.querySelectorAll('.event-choices button')].find((x)=>!x.disabled);if(c){c.click();r.acted='EVENT:'+c.textContent.trim().slice(0,30)}}
  if(!r.acted && btns().some((x)=>x.textContent.includes('跑到结束'))){
    if(!find((t)=>t.includes('跑到结束'))) hit((t)=>t.includes('⏸ 暂停'));
    if(!body.includes('挂机中')) hit((t)=>t.startsWith('🤖 挂机'));
    r.acted = hit((t)=>t.includes('跑到结束')) || 'battle-wait';
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
    for (const cmd of [['npx', ['vite', 'build', '--config', 'vite.config.playtest.ts']], ['node', ['scripts/inline-assets.mjs']]]) {
      const r = spawnSync(cmd[0], cmd[1], { cwd: ROOT, stdio: 'inherit' })
      if (r.status !== 0) throw new Error(cmd.join(' ') + ' 失败')
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

    // U27①/R1.3 断言:新档(熟练度 0)的地图——不选路不能前进;U33③④ 修订:相邻层见地形、更远层全盲、暗道零渲染
    {
      await clickText(b, '黑苔沼泽'); await sleep(300)
      const depart = await clickText(b, '出发'); await sleep(800)
      if (depart) {
        const probe = await b.evalJs(`(()=>{
          const body=document.body.innerText
          const cells=[...document.querySelectorAll('.dungeon-graph .dg-node')].map(x=>({t:x.textContent.trim(), n:x.querySelector('.dg-name')?.textContent.trim() ?? ''}))
          const icons=[...document.querySelectorAll('.dungeon-graph .dg-node:not(.walked):not(.current) .dg-icon')].map(x=>x.textContent.trim())
          const TERRAINS=['水域','林野','道路','营地','地下','废墟','墓地','圣所','熔岩']
          const leak=cells.filter(c=>/精英|宝箱|暗道|休整|事件/.test(c.t)).map(c=>c.t)
            .concat(icons.filter(ic=>/⚔|☠|🎁|⛺|🕳|👑/.test(ic)))
          const terrainShown=cells.filter(c=>TERRAINS.includes(c.n)).length
          const masked=cells.filter(c=>c.n==='未知岔路').length
          const allKnown=cells.every(c=>TERRAINS.includes(c.n)||c.n==='未知岔路')
          const flavor=cells.filter(c=>/洼地|猎场|栈道|棚屋|林地/.test(c.n)).map(c=>c.n)
          return { inMap: cells.length>0, hasDeep: body.includes('继续深入'), terrainShown, masked, allKnown, leak, flavor } })()`)
        check('M1', '地图:不选路不能前进(无「继续深入」)', probe.inMap && !probe.hasDeep ? 'PASS' : 'FAIL', `节点数=${probe.terrainShown + probe.masked}`)
        check('M2', 'U33③④ 迷雾起点:相邻层见地形、更远层全盲、类型/风味名零泄露、暗道零渲染',
          probe.inMap && probe.leak.length === 0 && probe.allKnown && probe.terrainShown > 0 && probe.masked > 0 && probe.flavor.length === 0 ? 'PASS' : 'FAIL',
          `地形名 ${probe.terrainShown} / 全盲 ${probe.masked}${probe.leak.length ? ';泄露:' + probe.leak.join('|') : ''}${probe.flavor.length ? ';风味名:' + probe.flavor.join('|') : ''}`)
        await clickText(b, '🏳 撤退回城'); await sleep(500)
        await clickText(b, '返回公会'); await sleep(300)
      } else {
        check('M1', '地图:不选路不能前进(无「继续深入」)', 'SKIP', '出发不可点(编制/锁定)')
        check('M2', 'U33③④ 迷雾起点断言', 'SKIP', '同上')
      }
    }

    let maxHints = 0; let storyReturns = 0; const b3 = []; const b5 = []; const s8 = []
    await drive(b, {
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
    const home = save.members.find((x) => x.job && HOME_WEAPON[x.job])
    if (home) homeMember = { name: inject(home, HOME_WEAPON[home.job]), job: home.job }
    const pole = save.members.find((x) => x.job && x.job !== 'guard')
    if (pole) poleMember = { name: inject(pole, 'wpn-t2-tidebreak'), job: pole.job }
    console.log(`  R3 注入:本命族=${homeMember ? homeMember.name + '(' + homeMember.job + ')' : '无'} 长柄=${poleMember ? poleMember.name + '(' + poleMember.job + ')' : '无'}`)
  }
  const b = await openBrowser('ending')
  try {
    await b.send('Page.navigate', { url: pathToFileURL(HTML).href }); await sleep(2500)
    await importSave(b, encode(save))
    // R3A:基地·武器专修区渲染五族
    await clickText(b, '基地'); await sleep(600)
    const fam = await b.evalJs(`(()=>{const g=document.querySelector('[aria-label="武器专修"]');if(!g)return null;return [...g.querySelectorAll('button')].map(x=>x.textContent.trim()).join('|')})()`)
    check('R3A', '训练场·武器专修区渲染五族', fam && fam.split('|').length === 5 ? 'PASS' : 'FAIL', fam ?? '未找到 aria-label=武器专修')
    await pressEscape(b); await sleep(300)
    // R3B/R3C:花名册开档案——本命族成员 ✔ 熟练;长柄成员 ⚠ 非熟练·长柄
    await clickText(b, '花名册'); await sleep(500)
    const openProfile = async (name) => {
      // 自导航:名册不在场才点「花名册」——功能坞按钮是开关式,名册开着时再点=关闭
      const hasRoster = await b.evalJs(`!!document.querySelector('.member-card')`)
      if (!hasRoster) { await clickText(b, '花名册'); await sleep(400) }
      await b.evalJs(`(()=>{const cards=[...document.querySelectorAll('.member-card')];const t=cards.find((c)=>c.textContent.includes(${JSON.stringify(name)}));t?.querySelector('.mc-head')?.click()})()`)
      await sleep(400)
      const text = await b.evalJs(`document.querySelector('[data-testid="weapon-proficiency"]')?.textContent ?? null`)
      await pressEscape(b); await sleep(250)
      return text
    }
    if (homeMember) {
      const prof = await openProfile(homeMember.name)
      check('R3B', '本命族武器档案页示「✔ 熟练」', !!prof && prof.includes('熟练') && !prof.includes('非熟练') ? 'PASS' : 'FAIL', (prof ?? '元素缺失').slice(0, 60))
    }
    if (poleMember) {
      const prof = await openProfile(poleMember.name)
      check('R3C', '长柄注入后档案页示「非熟练·长柄」', !!prof && prof.includes('非熟练') && prof.includes('长柄') ? 'PASS' : 'FAIL', (prof ?? '元素缺失').slice(0, 60))
    }
    await pressEscape(b); await sleep(200)
    const t0 = Date.now()
    const r = await drive(b, { prio: ['荆棘要塞'], timeoutMs: 150_000 })
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

// ================= 主流程 =================
const phases = { build: phaseBuild, fresh: phaseFresh, ending: phaseEnding, region2: phaseRegion2 }
const order = PHASE === 'all' ? ['build', 'fresh', 'ending', 'region2'] : PHASE.split(',')
let crashed = null
try {
  for (const p of order) {
    if (!phases[p]) throw new Error('未知阶段:' + p)
    const ok = await phases[p]()
    if (p === 'build' && ok === false) break
  }
} catch (e) { crashed = String(e?.message ?? e); console.error('\n✗ 脚本中断:', crashed) }

check('CONSOLE', '全程无控制台错误', observations.consoleErrors.length === 0 ? 'PASS' : 'FAIL', observations.consoleErrors.slice(0, 3).join(' | '))
const report = { at: new Date().toISOString(), phases: order, checks, crashed, ...observations }
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2))
const fails = checks.filter((c) => c.status === 'FAIL').length
console.log(`\n结果:${checks.filter((c) => c.status === 'PASS').length} 通过 / ${fails} 失败 / ${checks.filter((c) => c.status === 'SKIP').length} 跳过;远征 ${observations.expeditions} 趟,故事 ${observations.stories.length} 条`)
console.log('产物:' + OUT)
process.exit(fails > 0 || crashed ? 1 : 0)
