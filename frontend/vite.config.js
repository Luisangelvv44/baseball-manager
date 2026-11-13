import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Acceso por el proxy local (tools/dev-proxy.js): http://baseball.localhost
    allowedHosts: ['baseball.localhost'],
  },
});
