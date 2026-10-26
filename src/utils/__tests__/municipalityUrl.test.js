import { describe, it, expect } from 'vitest'
import { encodeStateToURL, decodeURLToState } from '../urlState'

describe('#44 Municipality URL encoding/decoding', () => {
  it('自治体モードをエンコードする', () => {
    const state = {
      searchMode: 'simple',
      searchSource: 'municipality',
      selectedMunicipality: { code: '271021', name: '都島区', bbox: { south: 34.69, west: 135.51, north: 34.73, east: 135.54 } },
      simpleSearch: { category: 'cafe', keyword: 'コーヒー', location: '' },
      advancedSearch: { tags: [], keyword: '', useAnd: true },
      bbox: { south: 34.69, west: 135.51, north: 34.73, east: 135.54 }
    }
    const qs = encodeStateToURL(state)
    expect(qs).toContain('src=m')
    expect(qs).toContain('mun=271021')
    expect(qs).toContain('c=cafe')
    expect(qs).toContain('k=')
  })

  it('地図モード（デフォルト）をエンコードする', () => {
    const state = {
      searchMode: 'simple',
      searchSource: 'map',
      selectedMunicipality: null,
      simpleSearch: { category: 'cafe', keyword: '', location: '' },
      advancedSearch: { tags: [], keyword: '', useAnd: true },
      bbox: { south: 34.69, west: 135.51, north: 34.73, east: 135.54 }
    }
    const qs = encodeStateToURL(state)
    expect(qs).not.toContain('src=')
    expect(qs).not.toContain('mun=')
  })

  it('自治体モードURLをデコードする', () => {
    const qs = 'src=m&mun=271021&c=cafe&k=%E3%82%B3%E3%83%BC%E3%83%92%E3%83%BC&b=34.690000,135.510000,34.730000,135.540000'
    const state = decodeURLToState('?' + qs)
    expect(state.searchSource).toBe('municipality')
    expect(state.selectedMunicipality.code).toBe('271021')
    expect(state.selectedMunicipality.bbox).toEqual({
      south: 34.69, west: 135.51, north: 34.73, east: 135.54
    })
    expect(state.simpleSearch.category).toBe('cafe')
    expect(state.simpleSearch.keyword).toBe('コーヒー')
  })

  it('round-trip: encode → decode で状態が一致する', () => {
    const original = {
      searchMode: 'simple',
      searchSource: 'municipality',
      selectedMunicipality: { code: '131016', name: '千代田区', bbox: { south: 35.67, west: 139.74, north: 35.70, east: 139.78 } },
      simpleSearch: { category: 'restaurant', keyword: '', location: '' },
      advancedSearch: { tags: [], keyword: '', useAnd: true },
      bbox: { south: 35.67, west: 139.74, north: 35.70, east: 139.78 }
    }
    const qs = encodeStateToURL(original)
    const restored = decodeURLToState('?' + qs)
    expect(restored.searchSource).toBe('municipality')
    expect(restored.selectedMunicipality.code).toBe('131016')
    expect(restored.selectedMunicipality.bbox).toEqual(original.bbox)
    expect(restored.simpleSearch.category).toBe('restaurant')
  })
})
