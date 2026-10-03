import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The game server runs on :8787 in development; Vite forwards API and WebSocket traffic to it.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8787',
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
})
