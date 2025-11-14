import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    include: ['buffer']
  },
  resolve: {
    alias: {
      buffer: 'buffer'
    }
  }
});





