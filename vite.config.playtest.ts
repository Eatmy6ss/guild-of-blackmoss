// 试玩版单文件打包配置:产出独立 HTML,微信群直接分发,接收者浏览器打开即玩(file://)
// 用法:npx vite build --config vite.config.playtest.ts
// 正常构建仍用 vite.config.ts,互不影响
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  // 构建日期注入(2026-09-25):页面显示版本,「是不是最新版」一眼可见
  define: { __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)) },
  build: {
    outDir: 'dist-playtest',
    // 字体等资产全部内联为 data URI,消除一切外部请求
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
  },
})
