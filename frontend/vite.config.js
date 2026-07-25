import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    open: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    }
  },
  optimizeDeps: {
    exclude: ['@ricky0123/vad-web', 'onnxruntime-web', '@sapphi-red/web-noise-suppressor']
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});

