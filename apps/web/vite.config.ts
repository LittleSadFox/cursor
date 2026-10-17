import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // Docs and the API CORS allowlist use 127.0.0.1. Default Vite may bind only ::1
    // (Local: http://localhost:5173/), so http://127.0.0.1:5173/ refuses to connect.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      // The server only accepts a Host naming its own loopback port.
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
});
