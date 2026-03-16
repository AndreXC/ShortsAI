import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/generate': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/cancel': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/status': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/voice': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        ws: true,
      },
      '/jobs': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/result': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/source': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/logs': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
      },
      '/health': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})