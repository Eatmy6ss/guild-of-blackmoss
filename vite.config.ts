import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 构建日期注入:页面显示版本,「是不是最新版」一眼可见
  define: { __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)) },
})
