import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173 },
  // three.js sendiri ±600 kB, jadi batas peringatan ukuran chunk dinaikkan
  build: { chunkSizeWarningLimit: 1000 },
});
