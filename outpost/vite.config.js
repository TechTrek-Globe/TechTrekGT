import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  base: '/outpost/',
  plugins: [react(), cloudflare()],
  server: {
    port: 3001,
    open: true
  },
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('react') || id.includes('scheduler')) return 'vendor-react';
            if (id.includes('xlsx')) return 'xlsx';
            if (id.includes('pdfjs-dist')) return 'pdfjs';
          }
        }
      }
    }
  }
});
