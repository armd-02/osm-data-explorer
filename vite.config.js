import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  // GitHub Pages用: 本番ビルド時はリポジトリ名を含むbase path
  base: mode === 'production' ? '/osm-data-explorer/' : '/',
  server: {
    port: 5173,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // maplibre-gl 単体で 800kB 超になるため、既定の 500kB 閾値では常に警告が出る。
    // ライブラリ本体のサイズは仕様なので、閾値を上げて警告を抑制する。
    chunkSizeWarningLimit: 900,
    // maplibre-gl は本体が大きく（raw ~700kB / gzip ~177kB）、
    // 単一チャンクにすると主バンドルが肥大し chunkSize 警告が出る。
    // vendor として分割し、主バンドルを軽く・maplibre をキャッシュ可能にする。
    rollupOptions: {
      output: {
        manualChunks: {
          'maplibre-gl': ['maplibre-gl']
        }
      }
    }
  }
}))
