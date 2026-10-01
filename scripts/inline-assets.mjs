// 单文件试玩包：保持稳定资源路径，以嵌入清单解析PNG/声音/许可。
// 分层人物和音效有动态路径，不能全局替换JS字符串中的资源ID。
import fs from 'node:fs'
import path from 'node:path'
const root = path.resolve(import.meta.dirname, '..')
const htmlPath = path.join(root, 'dist-playtest', 'index.html')
const types = { '.png': 'image/png', '.ogg': 'audio/ogg', '.txt': 'text/plain;charset=utf-8', '.json': 'application/json' }
const bundled = {}
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(file)
    else {
      const mime = types[path.extname(file)]
      if (!mime) continue
      const key = '/' + path.relative(path.join(root, 'public'), file).split(path.sep).join('/')
      bundled[key] = `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`
    }
  }
}
walk(path.join(root, 'public', 'assets'))
let html = fs.readFileSync(htmlPath, 'utf8')
html = html.replace(/<script id="blackmoss-bundled-assets" type="application\/json">[\s\S]*?<\/script>/, '')
const node = `<script id="blackmoss-bundled-assets" type="application/json">${JSON.stringify(bundled)}</script>`
if (!html.includes('<head>')) throw Error('试玩HTML缺少head，不能嵌入资源')
html = html.replace('<head>', '<head>' + node)
fs.writeFileSync(htmlPath, html)
// 检验实际输出，确保许可登记的每个文件与动态路径均可离线解析。
const embedded = JSON.parse(html.match(/<script id="blackmoss-bundled-assets" type="application\/json">([\s\S]*?)<\/script>/)[1])
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/assets/CREDITS.json'), 'utf8'))
for (const asset of manifest.assets) {
  if (!embedded[asset.path]) throw Error('试玩包缺少资源：' + asset.path)
  const data = Buffer.from(embedded[asset.path].split(',')[1], 'base64')
  if (!data.equals(fs.readFileSync(path.join(root, 'public', asset.path)))) throw Error('内嵌资源字节不一致：' + asset.path)
}
console.log(`✓ 内嵌${Object.keys(embedded).length}项资源/许可，${manifest.assets.length}项实际资源逐字节核对，试玩HTML ${Math.round(fs.statSync(htmlPath).size / 1024)} KB`)
