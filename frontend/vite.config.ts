import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    // Same-origin in dev, the way nginx will serve it in production: the
    // browser only ever talks to /api, so there is no CORS setup to get wrong.
    proxy: {
      '/api': {
        target: process.env.API_URL ?? 'http://localhost:3000',
        changeOrigin: true, // needed to point API_URL at an https host
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
