import { describe, it, expect } from 'vitest'
import { encodeStateToURL, decodeURLToState } from '../urlState'

describe('#44 Municipality URL encoding/decoding', () => {
  it('自治体モードをエンコードする', () => {
    const state = {
      searchMode: 'simple',
      searchSource: 'municipality',
      selectedMunicipality: { code: '271021', name: '都島区', bbox: { south: 34.69, west: 135.51, north: 34.73, east: 135.54 } },
      municipalitySearch: { category: 'cafe', keyword: 'コーヒー' },
      simpleSearch: { category: 'restaurant', keyword: '', location: '' },
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
      municipalitySearch: { category: 'cafe', keyword: 'コーヒー' },
      simpleSearch: { category: 'cafe', keyword: '', location: '' },
      advancedSearch: { tags: [], keyword: '', useAnd: true },
      bbox: { south: 34.69, west: 135.51, north: 34.73, east: 135.54 }
    }
    const qs = encodeStateToURL(state)
    expect(qs).not.toContain('src=')
    expect(qs).not.toContain('mun=')
    // (#47) 自治体モード用の条件は地図モードURLに漏れない
    expect(qs).not.toContain('k=')
  })

  it('自治体モードURLをデコードする', () => {
    const qs = 'src=m&mun=271021&c=cafe&k=%E3%82%B3%E3%83%BC%E3%83%92%E3%83%BC&b=34.690000,135.510000,34.730000,135.540000'
    const state = decodeURLToState('?' + qs)
    expect(state.searchSource).toBe('municipality')
    expect(state.selectedMunicipality.code).toBe('271021')
    expect(state.selectedMunicipality.bbox).toEqual({
      south: 34.69, west: 135.51, north: 34.73, east: 135.54
    })
    expect(state.municipalitySearch.category).toBe('cafe')
    expect(state.municipalitySearch.keyword).toBe('コーヒー')
  })

  it('round-trip: encode → decode で状態が一致する', () => {
    const original = {
      searchMode: 'simple',
      searchSource: 'municipality',
      selectedMunicipality: { code: '131016', name: '千代田区', bbox: { south: 35.67, west: 139.74, north: 35.70, east: 139.78 } },
      municipalitySearch: { category: 'restaurant', keyword: '' },
      simpleSearch: { category: '', keyword: '', location: '' },
      advancedSearch: { tags: [], keyword: '', useAnd: true },
      bbox: { south: 35.67, west: 139.74, north: 35.70, east: 139.78 }
    }
    const qs = encodeStateToURL(original)
    const restored = decodeURLToState('?' + qs)
    expect(restored.searchSource).toBe('municipality')
    expect(restored.selectedMunicipality.code).toBe('131016')
    expect(restored.selectedMunicipality.bbox).toEqual(original.bbox)
    expect(restored.municipalitySearch.category).toBe('restaurant')
  })
})

describe('#54 cuisineフィルタのURL encode/decoding', () => {
  it('cuisineをcuパラメータでエンコードする（両モード）', () => {
    // 自治体モード
    const mState = {
      searchMode: 'simple',
      searchSource: 'municipality',
      selectedMunicipality: { code: '26100', name: '高槻市', bbox: { south: 34.78, west: 135.49, north: 34.81, east: 135.52 } },
      municipalitySearch: { category: 'restaurant', keyword: '', cuisine: 'ramen' },
      simpleSearch: { category: '', keyword: '', location: '', cuisine: '' },
      advancedSearch: { tags: [], keyword: '', useAnd: true },
      bbox: { south: 34.78, west: 135.49, north: 34.81, east: 135.52 }
    }
    expect(encodeStateToURL(mState)).toContain('cu=ramen')

    // 地図モード
    const mapState = {
      searchMode: 'simple',
      searchSource: 'map',
      selectedMunicipality: null,
      municipalitySearch: { category: '', keyword: '', cuisine: '' },
      simpleSearch: { category: 'food_drink', keyword: '', location: '', cuisine: 'sushi' },
      advancedSearch: { tags: [], keyword: '', useAnd: true },
      bbox: { south: 34.78, west: 135.49, north: 34.81, east: 135.52 }
    }
    const mapQs = encodeStateToURL(mapState)
    expect(mapQs).toContain('c=food_drink')
    expect(mapQs).toContain('cu=sushi')
  })

  it('cuisine付きURLをデコードして復元する（round-trip）', () => {
    const qs = 'c=restaurant&cu=udon&b=34.780000,135.490000,34.810000,135.520000'
    const state = decodeURLToState('?' + qs)
    expect(state.simpleSearch.category).toBe('restaurant')
    expect(state.simpleSearch.cuisine).toBe('udon')
  })

  it('旧共有URL c=ramen を「レストラン + cuisine=ramen」に自動マッピングする（地図モード）', () => {
    const state = decodeURLToState('?c=ramen')
    expect(state.simpleSearch.category).toBe('restaurant')
    expect(state.simpleSearch.cuisine).toBe('ramen')
  })

  it('旧共有URL c=ramen をマッピングする（自治体モード）', () => {
    const state = decodeURLToState('?src=m&mun=26100&c=ramen')
    expect(state.searchSource).toBe('municipality')
    expect(state.municipalitySearch.category).toBe('restaurant')
    expect(state.municipalitySearch.cuisine).toBe('ramen')
  })

  it('c=ramen + 明示cu指定の場合はcuを優先する', () => {
    const state = decodeURLToState('?c=ramen&cu=udon')
    expect(state.simpleSearch.category).toBe('restaurant')
    expect(state.simpleSearch.cuisine).toBe('udon')
  })

  it('未知のカテゴリIDは無視する（未指定として扱う）', () => {
    const state = decodeURLToState('?c=not_a_real_category&k=x')
    expect(state.simpleSearch.category).toBe('')
    // 旧cuisine値も一緒に無視される
    expect(state.simpleSearch.cuisine).toBe('')
  })
})
