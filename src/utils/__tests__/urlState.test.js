/**
 * URL状態エンコード/デコードの回帰テスト（Issue #22）
 * - コロンを含むキー（addr:street）が正しく復元される
 * - JSON形式のタグエンコード
 * - BBOXバリデーション
 */
import { describe, it, expect } from 'vitest'
import { encodeStateToURL, decodeURLToState } from '../urlState'

describe('encodeStateToURL / decodeURLToState', () => {
  it('コロンを含むタグキー（addr:street）が正しく復元される', () => {
    const state = {
      searchMode: 'advanced',
      advancedSearch: {
        tags: [
          { key: 'addr:street', value: '', mode: 'exists' },
          { key: 'amenity', value: 'cafe', mode: 'equals' }
        ],
        keyword: '',
        useAnd: true
      }
    }
    const qs = encodeStateToURL(state)
    const decoded = decodeURLToState('?' + qs)

    expect(decoded.searchMode).toBe('advanced')
    expect(decoded.advancedSearch.tags).toHaveLength(2)
    
    // addr:street がコロンを保持して復元される
    const streetTag = decoded.advancedSearch.tags.find(t => t.key === 'addr:street')
    expect(streetTag).toBeDefined()
    expect(streetTag.mode).toBe('exists')
    
    // amenity=cafe も正常
    const amenityTag = decoded.advancedSearch.tags.find(t => t.key === 'amenity')
    expect(amenityTag.value).toBe('cafe')
    expect(amenityTag.mode).toBe('equals')
  })

  it('複数タグのANDが正しく復元される', () => {
    const state = {
      searchMode: 'advanced',
      advancedSearch: {
        tags: [
          { key: 'amenity', value: 'restaurant', mode: 'equals' },
          { key: 'cuisine', value: 'ramen', mode: 'equals' },
          { key: 'name:ja', value: '', mode: 'exists' }
        ],
        keyword: '',
        useAnd: true
      }
    }
    const qs = encodeStateToURL(state)
    const decoded = decodeURLToState('?' + qs)

    expect(decoded.advancedSearch.tags).toHaveLength(3)
    expect(decoded.advancedSearch.tags[0]).toEqual({ key: 'amenity', value: 'restaurant', mode: 'equals' })
    expect(decoded.advancedSearch.tags[1]).toEqual({ key: 'cuisine', value: 'ramen', mode: 'equals' })
    expect(decoded.advancedSearch.tags[2]).toEqual({ key: 'name:ja', value: '', mode: 'exists' })
    expect(decoded.advancedSearch.useAnd).toBe(true)
  })

  it('name:ja のようなコロン含むキーが正しく復元される', () => {
    const state = {
      searchMode: 'advanced',
      advancedSearch: {
        tags: [{ key: 'name:ja', value: 'テストカフェ', mode: 'equals' }],
        keyword: '',
        useAnd: true
      }
    }
    const qs = encodeStateToURL(state)
    const decoded = decodeURLToState('?' + qs)

    expect(decoded.advancedSearch.tags[0].key).toBe('name:ja')
    expect(decoded.advancedSearch.tags[0].value).toBe('テストカフェ')
  })

  it('BBOXが正しく復元される', () => {
    const state = {
      searchMode: 'simple',
      simpleSearch: { category: 'cafe', keyword: '', location: '' },
      bbox: { south: 35.676, west: 139.748, north: 35.678, east: 139.750 }
    }
    const qs = encodeStateToURL(state)
    const decoded = decodeURLToState('?' + qs)

    expect(decoded.bbox).toBeDefined()
    expect(decoded.bbox.south).toBeCloseTo(35.676, 5)
    expect(decoded.bbox.west).toBeCloseTo(139.748, 5)
    expect(decoded.bbox.north).toBeCloseTo(35.678, 5)
    expect(decoded.bbox.east).toBeCloseTo(139.750, 5)
  })

  it('無効なBBOX（south >= north）は復元されない', () => {
    const params = new URLSearchParams()
    params.set('b', '35.7,139.7,35.6,139.8')  // south > north
    const decoded = decodeURLToState('?' + params.toString())
    expect(decoded?.bbox).toBeUndefined()
  })

  it('範囲外のBBOX（lat > 90）は復元されない', () => {
    const params = new URLSearchParams()
    params.set('b', '95.0,139.7,96.0,139.8')  // lat > 90
    const decoded = decodeURLToState('?' + params.toString())
    expect(decoded?.bbox).toBeUndefined()
  })

  it('空パラメータはnullを返す', () => {
    expect(decodeURLToState('')).toBeNull()
    expect(decodeURLToState('?')).toBeNull()
  })

  it('目的スコープ（p）がURLにエンコードされ復元される (#44)', () => {
    const state = {
      searchSource: 'map',
      searchMode: 'simple',
      simpleSearch: { category: '', keyword: '', location: '', cuisine: '', purpose: '遊ぶ' },
      advancedSearch: { tags: [], keyword: '', useAnd: true },
      municipalitySearch: { category: '', keyword: '', cuisine: '', purpose: '' },
      selectedMunicipality: null,
      bbox: { south: 34.7, west: 135.5, north: 34.72, east: 135.52 }
    }
    const qs = encodeStateToURL(state)
    expect(qs).toContain('p=' + encodeURIComponent('遊ぶ'))
    const decoded = decodeURLToState('?' + qs)
    expect(decoded.simpleSearch.purpose).toBe('遊ぶ')
  })

  it('自治体モードの目的スコープも復元される (#44)', () => {
    const state = {
      searchSource: 'municipality',
      searchMode: 'simple',
      simpleSearch: { category: '', keyword: '', location: '', cuisine: '', purpose: '' },
      advancedSearch: { tags: [], keyword: '', useAnd: true },
      municipalitySearch: { category: '', keyword: '', cuisine: '', purpose: '暮らす' },
      selectedMunicipality: { code: '272078', name: '高槻市', bbox: { south: 34.7, west: 135.5, north: 34.72, east: 135.52 } },
      bbox: null
    }
    const qs = encodeStateToURL(state)
    expect(qs).toContain('p=' + encodeURIComponent('暮らす'))
    const decoded = decodeURLToState('?' + qs)
    expect(decoded.municipalitySearch.purpose).toBe('暮らす')
  })
})
