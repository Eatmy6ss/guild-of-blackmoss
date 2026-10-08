import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
const base = resolve('public'), manifest = JSON.parse(readFileSync(join(base, 'assets/CREDITS.json'), 'utf8'))
const paths = new Set(), ids = new Set()
for (const asset of manifest.assets) {
  if (paths.has(asset.path) || ids.has(asset.id)) throw Error(`重复资源：${asset.id}`)
  paths.add(asset.path); ids.add(asset.id)
  if (!['CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0'].includes(asset.license)) throw Error(`许可不在准入范围：${asset.id}`)
  for (const key of ['author', 'source', 'licenseUrl', 'sourceFile', 'download', 'sha256']) if (!asset[key]) throw Error(`来源字段缺失：${asset.id}.${key}`)
  const file = resolve(base, '.' + asset.path)
  if (!file.startsWith(base + '\\') && !file.startsWith(base + '/')) throw Error('越界资源路径')
  const data = readFileSync(file)
  if (createHash('sha256').update(data).digest('hex') !== asset.sha256) throw Error(`文件被改，需重新审核清单：${asset.path}`)
  if (asset.kind === 'sprite') {
    if (data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw Error(`不是PNG：${asset.path}`)
    const width = data.readUInt32BE(16), height = data.readUInt32BE(20)
    if (asset.dimensions?.[0] !== width || asset.dimensions?.[1] !== height) throw Error(`PNG尺寸记录不符：${asset.path}`)
    if (asset.sourceRect) {
      const [x, y, w, h] = asset.sourceRect
      if (asset.sourceRect.length !== 4 || !asset.sourceRect.every(Number.isInteger) || x < 0 || y < 0 || w < 1 || h < 1 || w > 32 || h > 32 || x + w > width || y + h > height) throw Error(`图集切片越界或大于32px：${asset.path}`)
    } else if (width !== 32 || height !== 32) throw Error(`不是32px PNG：${asset.path}`)
    if (!asset.archiveSha256) throw Error(`发布包指纹缺失：${asset.id}`)
  } else if (data.subarray(0, 4).toString() !== 'OggS') throw Error(`不是OGG音频：${asset.path}`)
}
function visit(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name)
    if (entry.isDirectory()) visit(file)
    else if (/\.(png|ogg)$/i.test(file) && !paths.has('/' + file.slice(base.length + 1).replaceAll('\\', '/'))) throw Error(`未登记的资源：${file}`)
  }
}
visit(join(base, 'assets'))
for (const file of ['CC0.txt', 'DCSS-README.txt', 'Kenney-RPG-Audio.txt', 'Fusion-Pixel-OFL.txt']) readFileSync(join(base, 'assets/licenses', file))
console.log(`资源验收：${paths.size}个文件，逐文件来源/许可/指纹、PNG尺寸和OGG格式通过。`)
