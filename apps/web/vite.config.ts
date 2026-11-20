import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A Vercel build is static only: online rooms need a room server (apps/server) reachable at
// VITE_ROOMS_URL. Without one, the online screen explains that rooms aren't available here yet.
const online = !!process.env.VITE_ROOMS_URL || !process.env.VERCEL;

export default defineConfig({
  plugins: [react()],
  define: { __ONLINE__: JSON.stringify(online) },
  server: {
    port: 5183,
    // Online rooms live in the Cloudflare worker (npm run dev -w @indra/server, port 8787).
    proxy: { '/api': { target: 'http://localhost:8787', ws: true } },
  },
});
