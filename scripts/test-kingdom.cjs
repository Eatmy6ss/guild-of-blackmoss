const { build } = require('esbuild')
// Bundle to memory: no generated scripts, temporary saves or extra runtime required.
build({ entryPoints: ['scripts/kingdom.test.ts'], bundle: true, platform: 'node', format: 'esm', write: false })
  .then(({ outputFiles }) => import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64')))
  .catch((error) => { console.error(error); process.exitCode = 1 })
