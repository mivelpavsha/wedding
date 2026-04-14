import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// GitHub Pages (project site): задайте VITE_BASE_PATH=/имя-репоз/ в CI; локально по умолчанию /
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: [
      'dayjs',
      'dayjs/plugin/utc',
      'dayjs/plugin/timezone',
      'react-confetti',
      'swiper',
      'swiper/react',
      'swiper/modules',
    ],
  },
})
