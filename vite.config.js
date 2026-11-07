import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'node:child_process'

// (#47続報) index.html へのアプリバージョン注入。
// GitHub Pages は _headers に対応していないため index.html の Cache-Control を
// 指定できず（デフォルト max-age=600）、デプロイ直後の通常リロードで古いJSが
// 動き続ける。index.html のセルフアップデートスクリプトがこのバージョンを
// 比較して新デプロイを検知・自動リロードする。git短ハッシュを値に使う。
let cachedAppVersion
function getAppVersion() {
  if (cachedAppVersion) return cachedAppVersion
  try {
    cachedAppVersion = execSync('git rev-parse --short HEAD', { cwd: process.cwd() }).toString().trim()
  } catch {
    // git 利用不可（タグ作成時など）はビルド時刻にフォールバック
    cachedAppVersion = `t${Date.now()}`
  }
  return cachedAppVersion
}

function appVersionPlugin() {
  return {
    name: 'app-version',
    transformIndexHtml(html) {
      return html.replace('__APP_VERSION__', getAppVersion())
    }
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), appVersionPlugin()],
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
