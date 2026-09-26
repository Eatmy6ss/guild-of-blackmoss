// 统一验证入口(自检流程问题修复):提交前必跑,任何一步失败即非零退出。
// 用法:npm run verify
// 覆盖:①smoke 全门禁(断言 EXIT=0 且 ✓ 计数不低于 28——防止门禁静默少跑)
//       ②玩法修复回归 ③王国委托回归 ④生产构建(含类型检查)
import { execSync, spawnSync } from 'node:child_process'

let failed = false
const step = (name, fn) => {
  try {
    const out = fn()
    console.log(`✓ ${name}`)
    return out
  } catch (e) {
    console.error(`✗ ${name}\n${e.stdout ?? e.message}`)
    failed = true
    return undefined
  }
}

const bundle = step('esbuild bundle', () =>
  execSync('npx esbuild scripts/smoke.ts --bundle --platform=node --format=esm --outfile=scripts/smoke.mjs', { encoding: 'utf8' }))

if (!failed) {
  const run = spawnSync('node', ['scripts/smoke.mjs'], { encoding: 'utf8' })
  const passes = (run.stdout.match(/^✓/gm) ?? []).length
  step(`smoke 全门禁(EXIT=${run.status},✓×${passes})`, () => {
    if (run.status !== 0) throw Object.assign(new Error('smoke 失败'), { stdout: run.stdout })
    if (passes < 28) throw new Error(`门禁计数 ${passes} < 28——有门禁静默少跑了,禁止提交`)
  })
}

step('玩法修复回归', () => execSync('node scripts/test-gameplay.cjs', { encoding: 'utf8' }))
step('王国委托回归', () => execSync('node scripts/test-kingdom.cjs', { encoding: 'utf8' }))

step('生产构建', () => execSync('npm run build', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))

process.exit(failed ? 1 : 0)
