import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 构建日期注入(本地时区):页面显示版本,「是不是最新版」一眼可见
const d = new Date()
const pad = (n: number) => String(n).padStart(2, '0')
const buildDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export default defineConfig({
  plugins: [react()],
  define: { __BUILD_DATE__: JSON.stringify(buildDate) },
})
