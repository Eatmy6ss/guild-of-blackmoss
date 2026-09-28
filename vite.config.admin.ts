import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Separate application, origin and output. Never added to the game's production entry.
export default defineConfig({
  root: fileURLToPath(new URL('./tools/admin', import.meta.url)),
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5180, strictPort: true },
  build: { outDir: '../../dist-admin', emptyOutDir: false },
})
