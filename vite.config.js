import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: +process.env.PORT || 5173 },          // PORT dari launcher pratinjau bila diberikan
  // three.js sendiri ±600 kB, jadi batas peringatan ukuran chunk dinaikkan
  build: { chunkSizeWarningLimit: 1000 },
});
