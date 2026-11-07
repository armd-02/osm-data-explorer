/**
 * セルフヒーリングリダイレクトスクリプトの動作テスト (#47続報 / #56)
 *
 * 旧バンドルURLに置かれる代替ファイル（selfheal/redirect.js 及び
 * public/assets/ 配下の既知旧バンドル用ファイル）が、キャッシュの古いHTMLに
 * 読み込まれた際に最新版へ正しくリダイレクトし、かつ無限ループしないことを検証する。
 *
 * ループ防止は二重ガード:
 *  1. localStorage タイムスタンプ（直近10秒以内のリダイレクトはスキップ）
 *  2. URL の shn= カウ…localStorage 不可環境でも機能する最終ガード
 *
 * 重要ケース (#56): localStorage がブロックされており、かつURLに appv= が
 * 既に付いている（汚染されたキャッシュキー）場合、旧実装はリダイレクトを
 * 永遠にスキップしてタブを永久に旧版に固定していた。新実装は shn カウンタ
 * と新しいタイムスタンプ（新しいキャッシュキー）により脱出できる。
 *
 * スクリプトはIIFE形式のため、new Function で location/localStorage/console
 * をパラメータとして注入して実行する（jsdomのlocationはスタブ不可のため）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { decodeURLToState } from '../utils/urlState'

const root = process.cwd()
const TEMPLATE = `${root}/selfheal/redirect.js`
const PUBLIC_COPIES = [
  `${root}/public/assets/index-C04O-jfr.js`,
  `${root}/public/assets/index-BhQN9WW4.js`
]

function codePart(file) {
  const t = readFileSync(file, 'utf8')
  return t.slice(t.indexOf('(function () {'))
}

/**
 * リダイレクトスクリプトをサンドボックスで実行する
 * @returns {{ replaceCalls: string[], warns: string[] }}
 */
function runRedirect(code, {
  search = '',
  pathname = '/osm-data-explorer/index.html',
  hash = '',
  localStorageBroken = false,
  lastRedirectMsAgo = Infinity
} = {}) {
  const replaceCalls = []
  const warns = []
  const fakeLocation = {
    search, pathname, hash,
    replace: (url) => { replaceCalls.push(url) }
  }
  const store = {}
  if (lastRedirectMsAgo !== Infinity) {
    store['__sh_last_redirect'] = String(Date.now() - lastRedirectMsAgo)
  }
  const fakeLocalStorage = localStorageBroken
    ? {
        getItem: () => { throw new Error('SecurityError: blocked') },
        setItem: () => { throw new Error('SecurityError: blocked') }
      }
    : {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v) }
      }
  const fakeConsole = { warn: (m) => warns.push(m), log: () => {} }
  const runner = new Function('location', 'localStorage', 'console', code)
  runner(fakeLocation, fakeLocalStorage, fakeConsole)
  return { replaceCalls, warns }
}

function parseUrl(url) {
  // pathname?search#hash 形式のURLから search パース
  const q = url.split('?')[1] || ''
  return new URLSearchParams(q)
}

describe('セルフヒーリングリダイレクトの動作', () => {
  const code = codePart(TEMPLATE)

  it('通常: appv（一意タイムスタンプ）+ shn=1 付きURLへリダイレクトする', () => {
    const before = Date.now()
    const { replaceCalls } = runRedirect(code, { search: '' })
    expect(replaceCalls).toHaveLength(1)
    const p = parseUrl(replaceCalls[0])
    expect(p.get('shn')).toBe('1')
    const appv = Number(p.get('appv'))
    expect(appv).toBeGreaterThanOrEqual(before)
    expect(appv).toBeLessThanOrEqual(Date.now())
    expect(replaceCalls[0]).toContain('/osm-data-explorer/index.html?')
  })

  it('既存のURL状態パラメータとハッシュを保持する', () => {
    const { replaceCalls } = runRedirect(code, {
      search: '?b=35.0,139.0,35.1,139.1&c=cafe',
      hash: '#share'
    })
    const p = parseUrl(replaceCalls[0])
    expect(p.get('b')).toBe('35.0,139.0,35.1,139.1')
    expect(p.get('c')).toBe('cafe')
    expect(p.get('shn')).toBe('1')
    expect(p.get('appv')).toBeTruthy()
    expect(replaceCalls[0].endsWith('#share')).toBe(true)
  })

  it('localStorageガード: 直近10秒以内にリダイレクト済みならスキップする', () => {
    const { replaceCalls, warns } = runRedirect(code, {
      search: '', lastRedirectMsAgo: 5000
    })
    expect(replaceCalls).toHaveLength(0)
    expect(warns).toHaveLength(0)
  })

  it('shn上限ガード: shn>=3 ならリダイレクトを停止し警告を出す', () => {
    const { replaceCalls, warns } = runRedirect(code, { search: '?shn=3' })
    expect(replaceCalls).toHaveLength(0)
    expect(warns.length).toBeGreaterThanOrEqual(1)
    expect(warns[0]).toContain('redirect limit reached')
  })

  it('壊れたshn値（数値でない）でもループしない', () => {
    const { replaceCalls } = runRedirect(code, { search: '?shn=abc' })
    expect(replaceCalls).toHaveLength(0)
  })

  it('shnをインクリメントし、appvに新しいタイムスタンプを設定する', () => {
    const before = Date.now()
    const { replaceCalls } = runRedirect(code, { search: '?shn=1&appv=111' })
    const p = parseUrl(replaceCalls[0])
    expect(p.get('shn')).toBe('2')
    expect(Number(p.get('appv'))).toBeGreaterThanOrEqual(before)
  })

  it('#56 重要ケース: localStorage不可+汚染されたappv付きURLからも脱出できる', () => {
    // 旧実装はこのケースで `appv=` 既出のため永遠にリダイレクトをスキップした
    const { replaceCalls } = runRedirect(code, {
      search: '?appv=111',
      localStorageBroken: true
    })
    expect(replaceCalls).toHaveLength(1)
    const p = parseUrl(replaceCalls[0])
    expect(p.get('shn')).toBe('1')
    // appv は旧値(111)ではなく新しいタイムスタンプ（＝新しいキャッシュキー）
    expect(p.get('appv')).not.toBe('111')
    expect(Number(p.get('appv'))).toBeGreaterThan(Date.now() - 60000)
  })

  it('#56 汚染脱出は最大3回で収束する（shnが3に達すると停止）', () => {
    // 1回目: shnなし → shn=1
    const r1 = runRedirect(code, { search: '?appv=111', localStorageBroken: true })
    // 2回目: shn=1 → shn=2
    const r2 = runRedirect(code, { search: '?shn=1&appv=222', localStorageBroken: true })
    expect(r2.replaceCalls).toHaveLength(1)
    expect(parseUrl(r2.replaceCalls[0]).get('shn')).toBe('2')
    // 3回目: shn=2 → shn=3
    const r3 = runRedirect(code, { search: '?shn=2&appv=333', localStorageBroken: true })
    expect(r3.replaceCalls).toHaveLength(1)
    expect(parseUrl(r3.replaceCalls[0]).get('shn')).toBe('3')
    // 4回目: shn=3 → 停止（無限ループにならない）
    const r4 = runRedirect(code, { search: '?shn=3&appv=444', localStorageBroken: true })
    expect(r4.replaceCalls).toHaveLength(0)
  })
})

describe('セルフヒーリングファイルの整合性', () => {
  it('テンプレートとpublic配下の既知旧バンドルファイルのコード部分が同一', () => {
    const tpl = codePart(TEMPLATE)
    for (const f of PUBLIC_COPIES) {
      expect(codePart(f), f).toBe(tpl)
    }
  })

  it('全ファイルがIIFE形式で、replace+appv+shnガードを含む', () => {
    const files = [TEMPLATE, ...PUBLIC_COPIES]
    for (const f of files) {
      const t = readFileSync(f, 'utf8')
      expect(t).toContain('(function () {')
      expect(t).toContain('location.replace')
      expect(t).toContain('appv')
      expect(t).toContain('shn')
    }
  })

  it('デプロイワークフローがテンプレートを自動配置するステップを持つ', () => {
    const wf = readFileSync(`${root}/.github/workflows/deploy.yml`, 'utf8')
    expect(wf).toContain('selfheal/redirect.js')
    expect(wf).toContain('selfheal/placeholder.css')
  })

  it('shn/appv パラメータはURL状態復元と干渉しない（無視される）', () => {
    // shn のみ → 状態データなし
    expect(decodeURLToState('?shn=2')).toBeNull()
    // 混入しても既知パラメータの復元は正常
    const state = decodeURLToState('?b=35.0,139.0,35.1,139.1&shn=2&appv=1730000000000')
    expect(state.bbox).toEqual({ south: 35, west: 139, north: 35.1, east: 139.1 })
  })
})
