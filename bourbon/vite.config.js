import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/bourbon/',
  plugins: [react()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('lucide-react')) return 'vendor-icons'
            if (id.includes('react')) return 'vendor-react'
          }
        },
      },
    },
  },
  server: {
    port: 5176,
  },
})
