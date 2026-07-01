import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',          // IPv4 고정 (IPv6 ::1 미사용)
    port: Number(process.env.PORT) || 5173,
    strictPort: false,
  },
})
