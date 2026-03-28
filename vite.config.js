import { defineConfig } from 'vite'

export default defineConfig({
  base: '/Three-geo-play-demo-website/',
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist'
  }
})