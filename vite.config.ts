import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The game server runs on :8787 in development; Vite forwards API and WebSocket traffic to it.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Word lists and libraries change rarely; keeping them in their own files means an app
        // update doesn't make returning players re-download 200 KB of words.
        manualChunks(id: string) {
          // Easy-mode clues are fetched only when someone plays Easy.
          if (id.includes('/src/data/clues.generated')) return 'clues'
          if (id.includes('/src/data/')) return 'words'
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react'
          if (id.includes('node_modules/motion') || id.includes('node_modules/framer-motion') || id.includes('node_modules/motion-')) return 'motion'
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8787',
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
})
