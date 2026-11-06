import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  server: { port: 5173 },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: { output: { manualChunks: { charts: ['recharts'], motion: ['framer-motion'], graph: ['d3-force'] } } },
  },
})
