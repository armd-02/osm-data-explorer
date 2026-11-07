/**
 * セルフアップデート機構の契約テスト (#47続報)
 *
 * GitHub Pages は _headers をサポートしていないため（実測で確認済）、
 * index.html はデフォルトで max-age=600 にキャッシュされる。
 * デプロイ直後の通常リロードでブラウザがキャッシュの古い HTML+JS を取り出し、
 * 旧コードが最長10分間動き続ける問題を、以下の機構で回避する:
 *
 * - index.html: <meta name="app-version"> 占位符 + セルフアップデートスクリプト
 *   （no-store フェッチで最新HTMLを取得し、バージョン違いなら appv 付きURLへ自動リロード）
 * - vite.config.js: appVersionPlugin がビルド時に __APP_VERSION__ を git 短ハッシュに置換
 * - urlState.js: 未知パラメータ（appv）は無視するため URL 状態復元と干渉しない
 *
 * 機構がファイル3つにまたがるため、静的契約チェックで回帰を防止する。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { decodeURLToState, encodeStateToURL } from '../utils/urlState'

const root = process.cwd()
const html = readFileSync(`${root}/index.html`, 'utf8')
const viteConfig = readFileSync(`${root}/vite.config.js`, 'utf8')

describe('セルフアップデート機構 (#47続報)', () => {
  it('index.html に app-version meta のプレースホルダがある', () => {
    expect(html).toContain('<meta name="app-version" content="__APP_VERSION__"')
  })

  it('index.html にセルフアップデートスクリプトがある（no-store フェッチ→バージョン比較→location.replace）', () => {
    expect(html).toContain("cache: 'no-store'")
    expect(html).toContain('app-version')
    expect(html).toContain('location.replace')
    // キャッシュ回避用の appv パラメータ
    expect(html).toContain('appv=')
    // 既存のURL状態（location.search）とハッシュは再読み込み時に保持される
    expect(html).toContain('location.search')
    expect(html).toContain('location.hash')
  })

  it('vite.config.js がビルド時に __APP_VERSION__ を git ハッシュに置換する', () => {
    expect(viteConfig).toContain('appVersionPlugin')
    expect(viteConfig).toContain('__APP_VERSION__')
    expect(viteConfig).toContain('rev-parse --short HEAD')
  })

  it('appv パラメータは URL 状態復元と干渉しない（無視される）', () => {
    // appv のみのURL → 復元される状態データはない
    expect(decodeURLToState('?appv=abc1234')).toBeNull()
    // appv が混入しても既知パラメータの復元は正常
    const state = decodeURLToState('?b=35.0,139.0,35.1,139.1&appv=abc1234')
    expect(state.bbox).toEqual({ south: 35, west: 139, north: 35.1, east: 139.1 })
  })

  it('共有URL生成に appv が含まれない', () => {
    expect(encodeStateToURL({})).toBe('')
  })
})
