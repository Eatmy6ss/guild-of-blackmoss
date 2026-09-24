// 试玩版单文件打包配置:产出独立 HTML,微信群直接分发,接收者浏览器打开即玩(file://)
// 用法:npx vite build --config vite.config.playtest.ts
// 正常构建仍用 vite.config.ts,互不影响
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// 构建日期注入(本地时区):页面显示版本,「是不是最新版」一眼可见
const d = new Date()
const pad = (n: number) => String(n).padStart(2, '0')
const buildDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  define: { __BUILD_DATE__: JSON.stringify(buildDate) },
  build: {
    outDir: 'dist-playtest',
    // 字体等资产全部内联为 data URI,消除一切外部请求
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
  },
})
