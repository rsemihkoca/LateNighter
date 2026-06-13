import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Fixed port so Tauri's devUrl (http://localhost:5173) always matches.
  server: {
    port: 5173,
    strictPort: true,
  },
})
