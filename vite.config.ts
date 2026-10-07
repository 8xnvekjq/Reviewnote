import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // 빌드 시점의 앱 버전 (package.json에서 자동 읽음)
    __APP_VERSION__: JSON.stringify(pkg.version),
    // 빌드 시점의 UTC 타임스탬프 (배포할 때마다 자동 갱신)
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Phaser(약 1.2MB)는 새 Pixel World 베타를 열 때만 동적 import된다 — 공용 vendor 청크에
            // 섞이면 모든 학생이 첫 화면에서 내려받게 되므로 반드시 따로 뺀다.
            if (id.includes('/node_modules/phaser/')) {
              return 'vendor-phaser';
            }
            if (id.includes('katex')) {
              return 'vendor-katex';
            }
            if (id.includes('@supabase') || id.includes('supabase')) {
              return 'vendor-supabase';
            }
            return 'vendor';
          }
        }
      }
    }
  }
})
