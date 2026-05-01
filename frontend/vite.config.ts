import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import path from "path"

export default defineConfig({
  base: '/kiwi8/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // API 요청은 백엔드로 전달
      '/kiwi8/api': {
        target: 'http://localhost:8003',
        changeOrigin: true,
      },
      // 로그인/로그아웃 처리는 백엔드로 전달
      // 단, GET 요청(페이지 접근)은 프록시에서 제외하여 Vite가 처리하게 함
      '/kiwi8/login': {
        target: 'http://localhost:8003',
        changeOrigin: true,
        bypass: (req) => {
          if (req.method === 'GET') return req.url;
        }
      },
      '/kiwi8/logout': {
        target: 'http://localhost:8003',
        changeOrigin: true,
      },
      '/kiwi8/health': {
        target: 'http://localhost:8003',
        changeOrigin: true,
      },
    },
  }
})