import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // publicado no GitHub Pages em https://<usuario>.github.io/maniadepipa/
  base: '/maniadepipa/',
  plugins: [react(), tailwindcss()],
})
