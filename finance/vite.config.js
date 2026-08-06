import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  base: '/finance/',
  plugins: [react(), cloudflare()],
  server: {
    port: 3000,
    open: true
  }
});