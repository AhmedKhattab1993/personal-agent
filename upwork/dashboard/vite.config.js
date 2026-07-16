import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  server: {
    allowedHosts: ['studio.tailcc4c77.ts.net'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
