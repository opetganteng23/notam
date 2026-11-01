import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// UI (web/) dibuild ke public/ dan disajikan NestJS dalam satu proses.
export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../public', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
