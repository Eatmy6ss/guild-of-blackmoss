const { buildSync } = require('esbuild')
const Module = require('node:module')
const path = require('node:path')
const result = buildSync({entryPoints:['scripts/gameplay.test.ts'],bundle:true,platform:'node',format:'cjs',external:['typescript'],write:false})
const filename = path.resolve('scripts/gameplay.test.cjs')
const testModule = new Module(filename, module)
testModule.filename = filename
testModule.paths = Module._nodeModulePaths(path.dirname(filename))
testModule._compile(result.outputFiles[0].text, filename)
