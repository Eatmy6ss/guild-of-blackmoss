// 分发构建后处理:把 dist-playtest/index.html 中引用的 /assets/**.png 全部内联为 base64 data URI
// 使单文件在 GitHub Pages 子路径 / 本地 file:// / 任何环境下都自足(零外部请求)
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const htmlPath = path.join(root, 'dist-playtest', 'index.html')
let html = fs.readFileSync(htmlPath, 'utf8')

// 递归收集 public/assets 下所有 png
function walk(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(full))
    else if (e.name.endsWith('.png')) out.push(full)
  }
  return out
}

const files = walk(path.join(root, 'public', 'assets'))
const assetsDir = path.join(root, 'public', 'assets')
let inlined = 0
for (const file of files) {
  const rel = path.relative(assetsDir, file).split(path.sep).join('/')
  const literal = '"/assets/' + rel + '"' // 压缩后 JS 为双引号字符串
  if (!html.includes(literal)) continue
  const b64 = fs.readFileSync(file).toString('base64')
  const dataUri = '"data:image/png;base64,' + b64 + '"'
  html = html.split(literal).join(dataUri)
  inlined++
}
// 残留诊断:仍指向绝对路径的素材引用
const refs = html.match(/"\/assets\/[^"]+\.png"/g) ?? []
fs.writeFileSync(htmlPath, html)
const kb = Math.round(fs.statSync(htmlPath).size / 1024)
console.log(`✓ 内联 ${inlined} 张素材,残留 ${refs.length} 处,最终 ${kb} KB`)
if (refs.length > 0) {
  console.log(refs.slice(0, 3).join('\n'))
  process.exit(1)
}
