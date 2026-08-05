import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  base: '/outpost/',
  plugins: [react(), cloudflare()],
  server: {
    port: 3001,
    open: true
  }
});
