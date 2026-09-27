import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// LezzFlow Seller — dev server on port 5173
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 5173,
  },
})
