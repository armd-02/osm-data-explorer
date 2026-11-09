// @vitest-environment jsdom
/**
 * (回帰) PCレイアウト「地図から探す」: ページを開いた直後の「検索する」ボタン
 *
 * ユーザー報告: 地図モードでページを開いた直後、地図は表示されているのに
 * 「検索する」ボタンが押せなく、横に「検索範囲が設定されていません。」と出る。
 *
 * 原因: SearchTabContent は毎レンダリングで makeCriteria() → getMapInstance()
 * を読むが、地図インスタンスは MapView のマウント後 effect で登録される。
 * 初回レンダリング時点ではまだ null であり、state.bbox も無い（初回開いた
 * ページ）ため criteria.ok=false になる。setMapInstance(map) はReact状態の
 * 変更を伴わないため、地図準備完了後も SearchTabContent は再レンダリングせず
 * 古い criteria（no_bbox）がそのまま残る → ボタンが無効化したままになる。
 *
 * 修正: 地図が load/move/zoom した時点で boundsVersion を bump して再レンダリング
 * し、criteria を地図表示範囲で再計算させる（モバイル版 boundsVersion と同一方式）。
 *
 * 検証（設計維持を含む）:
 * - 地図のロード完了時点で「検索する」が押せるようになる（no_bbox で無い）
 * - 押下すると「押下時点の地図表示範囲（getBounds）」で検索が実行される（#41方式）。
 *   初期表示範囲（モック既定 34.8,135.4,34.9,135.6）がクエリに反映される。
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import App from '../../App'
import { getMapInstance } from '../../hooks/useMapRef'

// MapLibre GLはWebGLが必要でjsdomでは初期化できないためモジュール全体をモックする。
const mockState = vi.hoisted(() => ({ api: null }))
vi.mock('maplibre-gl', async () => {
  const mod = await import('../../test/maplibreMock')
  mockState.api = mod.createMapLibreMock()
  return { default: mockState.api }
})

const overpassCalls = []

class MockResizeObserver { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => {
  overpassCalls.length = 0
  global.ResizeObserver = global.ResizeObserver || MockResizeObserver
  if (!window.matchMedia) {
    window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
  }
  if (mockState.api) mockState.api.resetState()
  window.history.replaceState(null, '', '/')

  global.fetch = vi.fn(async (url, options) => {
    const u = String(url)
    if (u.includes('interpreter')) {
      const body = options?.body || ''
      const query = String(body).replace(/^data=/, '').replace(/\+/g, ' ')
      overpassCalls.push(decodeURIComponent(query))
      return {
        ok: true,
        status: 200,
        headers: new Map(),
        json: async () => ({ version: 0.6, elements: [
          { type: 'node', id: 1, lat: 34.85, lon: 135.5, tags: { amenity: 'cafe', name: 'Test Cafe' } }
        ] })
      }
    }
    return { ok: true, json: async () => ({}) }
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

const IT_TIMEOUT = 15000

// モックの地図は getBounds() が常に既定範囲を返す
const INITIAL_BOUNDS = '34.800000,135.400000,34.900000,135.600000'

describe('(回帰) PC地図モード: ページ開いた直後の検索ボタン', () => {
  it('入力なし・地図がロード完了すると「検索する」が押せるようになる', async () => {
    render(<App />)

    // 地図インスタンスが登録される（MapViewのマウント後effect）
    await waitFor(() => {
      expect(getMapInstance()).toBeTruthy()
    }, { timeout: 5000 })

    // 地図のロード完了後にcriteriaが地図表示範囲で再計算され、
    // 「検索する」ボタンが有効化される（no_bboxのまま無効ではない）
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: 'この表示範囲で検索' })
      expect(btn.hasAttribute('disabled')).toBe(false)
    }, { timeout: 5000 })

    // 「検索範囲が設定されていません。」というヒントは出ない
    expect(screen.queryByText('検索範囲が設定されていません。')).toBeNull()
  }, IT_TIMEOUT)

  it('押下すると地図の初期表示範囲（getBounds）で検索が実行される（#41方式の維持）', async () => {
    render(<App />)

    // 地図のロード完了を待ち、ボタンが有効化される
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: 'この表示範囲で検索' })
      expect(btn.hasAttribute('disabled')).toBe(false)
    }, { timeout: 5000 })

    // 入力（カテゴリ・キーワード）なしで「検索する」を押す
    fireEvent.click(screen.getByRole('button', { name: 'この表示範囲で検索' }))

    // 検索が実行され、クエリに地図の初期表示範囲（getBounds）が反映される
    await waitFor(() => expect(overpassCalls.length).toBe(1), { timeout: 5000 })
    expect(overpassCalls[0]).toContain(INITIAL_BOUNDS)
  }, IT_TIMEOUT)

  it('地図を移動（moveend）した後の押下は、その時点の表示範囲で検索する（getBoundsの押下時点評価）', async () => {
    render(<App />)

    // ボタン有効化を待つ
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: 'この表示範囲で検索' })
      expect(btn.hasAttribute('disabled')).toBe(false)
    }, { timeout: 5000 })

    // 地図の表示範囲を変更（モックのboundsを別の範囲に書き換え）+ moveend発火
    const map = getMapInstance()
    const bounds = map.getBounds()
    bounds._southWest = { lat: 35.0, lng: 139.0 }
    bounds._northEast = { lat: 35.1, lng: 139.1 }
    await waitFor(() => {
      // moveend後の再レンダリングでcriteriaが新しい範囲で再計算される
      const btn = screen.getByRole('button', { name: 'この表示範囲で検索' })
      expect(btn.hasAttribute('disabled')).toBe(false)
    }, { timeout: 5000 })

    // 押下 → 変更後の表示範囲（35.0,139.0,35.1,139.1）で検索される
    fireEvent.click(screen.getByRole('button', { name: 'この表示範囲で検索' }))
    await waitFor(() => expect(overpassCalls.length).toBe(1), { timeout: 5000 })
    expect(overpassCalls[0]).toContain('35.000000,139.000000,35.100000,139.100000')
  }, IT_TIMEOUT)

  it('範囲が広すぎ（too_large）になると無効化され、縮小すると再有効化される（既存バリデーションがリアルタイムに機能）', async () => {
    render(<App />)

    // 地図インスタンスの登録を待つ
    await waitFor(() => {
      expect(getMapInstance()).toBeTruthy()
    }, { timeout: 5000 })

    // ボタン有効化を待つ（loadイベントでcriteriaが地図表示範囲で再計算される）
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: 'この表示範囲で検索' })
      expect(btn.hasAttribute('disabled')).toBe(false)
    }, { timeout: 5000 })

    const map = getMapInstance()
    const bounds = map.getBounds()

    // 範囲を広すぎる大きさに書き換え（area > 40000 km²）+ moveend発火
    bounds._southWest = { lat: 30.0, lng: 130.0 }
    bounds._northEast = { lat: 40.0, lng: 140.0 }
    map.fire('moveend')

    // ボタンが無効化され、「広すぎ」メッセージが出る（too_largeバリデーションが機能）
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: 'この表示範囲で検索' })
      expect(btn.hasAttribute('disabled')).toBe(true)
    }, { timeout: 5000 })
    // too_large失敗時にcheckBboxSizeのメッセージ（2500km²超の「広すぎ」段階）が表示される
    expect(screen.getByText(/検索範囲が広すぎます/)).toBeTruthy()

    // 範囲を縮小（area < 40000 km²）+ moveend発火
    bounds._southWest = { lat: 34.8, lng: 135.4 }
    bounds._northEast = { lat: 34.9, lng: 135.6 }
    map.fire('moveend')

    // ボタンが再有効化される（バリデーションがリアルタイムに反応）
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: 'この表示範囲で検索' })
      expect(btn.hasAttribute('disabled')).toBe(false)
    }, { timeout: 5000 })
  }, IT_TIMEOUT)
})
