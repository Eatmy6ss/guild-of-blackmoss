const { buildSync } = require('esbuild')
const Module = require('node:module')
const path = require('node:path')
const result = buildSync({ entryPoints: ['scripts/emberpass-measure.ts'], bundle: true, platform: 'node', format: 'cjs', write: false })
const filename = path.resolve('scripts/emberpass-measure.cjs')
const measurement = new Module(filename, module)
measurement.filename = filename
measurement.paths = Module._nodeModulePaths(path.dirname(filename))
measurement._compile(result.outputFiles[0].text, filename)
