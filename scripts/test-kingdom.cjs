const { buildSync } = require('esbuild')
const Module = require('node:module')
const path = require('node:path')
// 保持内存打包；失败位置用文件名，避免 data URI 把整份 bundle 写进错误日志。
const result = buildSync({ entryPoints: ['scripts/kingdom.test.ts'], bundle: true, platform: 'node', format: 'cjs', write: false })
const filename = path.resolve('scripts/kingdom.test.cjs')
const testModule = new Module(filename, module)
testModule.filename = filename
testModule.paths = Module._nodeModulePaths(path.dirname(filename))
testModule._compile(result.outputFiles[0].text, filename)
