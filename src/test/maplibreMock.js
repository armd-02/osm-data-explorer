/**
 * maplibre-gl 共通テストモック
 *
 * MapLibre GLはWebGLが必要でjsdomでは初期化できないため、テストでは
 * maplibre-glモジュール全体をこのモックで置き換える。
 *
 * 使用例（テストファイル内）:
 *   const mockState = vi.hoisted(() => ({ api: null }))
 *   vi.mock('maplibre-gl', async () => {
 *     const mod = await import('../../test/maplibreMock')
 *     mockState.api = mod.createMapLibreMock()
 *     return { default: mockState.api }
 *   })
 *   // テスト内:
 *   const map = mockState.api._state.maps[0]
 *   map.fire('load')            // style loadイベントを擬似発火
 *   map._calls                  // [{name:'fitBounds', args:[...]} ...]
 *   map._lastGeoJSON            // 最終setData {id, data}
 *   mockState.api._state.markers / .popups
 *
 * API対応（MapView/MapToolbar/BatchMatchMapが使用するもの）:
 * - Map: on/off/fire, addSource/getSource/addLayer/removeLayer/removeSource,
 *   querySourceFeatures, setView/fitBounds/panTo/easeTo/jumpTo,
 *   getBounds/getZoom/getCenter, getCanvas, addControl, resize, remove
 * - GeoJSONSource（addSourceで生成・getSourceで取得）: setData(data)
 *
 * 注: 実maplibre-glのMapにはsetGeoJSON()メソッドが存在しない（mapbox-gl由来のAPI）。
 * 本モックも実APIに合わせsetGeoJSONを実装しておらず、アプリ側が誤って
 * map.setGeoJSON()を呼んだ場合は本番と同様のTypeErrorでテストが失敗する
 * （Task 11: 検索時の「map.setGeoJSON is not a function」回帰防止）。
 * - Marker: setLngLat/addTo/remove/setPopup/getPopup
 * - Popup: setLngLat/setDOMElement/setText/addTo/open/close/remove
 * - NavigationControl: addTo/remove
 *
 * 注: vi.mockファクトリはファイル先頭にホイスされるため、共通モックへの
 * 参照はファクトリ内での動的import（await import(...)）で行うこと。
 */

export function createMapLibreMock(options = {}) {
  const state = {
    maps: [],    // 生成されたMapインスタンス（生成順）
    markers: [], // 生成されたMarkerインスタンス（生成順）
    popups: [],  // 生成されたPopupインスタンス（生成順）
  }

  const bbox = options.bbox || { south: 34.8, west: 135.4, north: 34.9, east: 135.6 }
  // 実MapLibreのmap.getBounds()と同じLngLatBounds形式
  // （{_southWest: {lat, lng}, _northEast: {lat, lng}}）
  const bounds = {
    pad: () => bounds,
    _southWest: { lat: bbox.south, lng: bbox.west },
    _northEast: { lat: bbox.north, lng: bbox.east },
  }

  function makeMap(mapOptions) {
    // MapLibreの map.on(type, target?, listener) に対応:
    // (type, cb) と (type, target, cb) の両方を composite key で管理する
    const handlerKey = (type, target, listener) =>
      (listener !== undefined) ? `${type}:${target}` : type

    const map = {
      _options: mapOptions || {},
      _handlers: {},
      _sources: new Map(),
      _layers: [],
      _markers: [],
      _calls: [],
      _lastGeoJSON: null,
      _removed: false,
      _queryFeaturesFn: options.querySourceFeatures || null,

      on(type, target, listener) {
        const cb = listener !== undefined ? listener : target
        if (typeof cb !== 'function') return this
        const key = handlerKey(type, target, listener)
        if (!this._handlers[key]) this._handlers[key] = []
        this._handlers[key].push(cb)
        return this
      },
      off(type, target, listener) {
        const cb = listener !== undefined ? listener : target
        if (!type) {
          this._handlers = {}
          return this
        }
        const key = handlerKey(type, target, listener)
        if (typeof cb === 'function') {
          this._handlers[key] = (this._handlers[key] || []).filter((f) => f !== cb)
        } else {
          delete this._handlers[key]
        }
        return this
      },
      // テストからイベントを擬似発火する（onと同様の引数形式）
      // 例: fire('load') / fire('click', 'point-circle', eventObj)
      fire(type, target, ...args) {
        const k = (typeof target === 'function' || target === undefined) ? type : `${type}:${target}`
        ;(this._handlers[k] || []).slice().forEach((cb) => cb(...args))
        return this
      },

      _record(name, args = []) {
        this._calls.push({ name, args })
        return this
      },
      // 実maplibre-glと同様、GeoJSONソースはsetData()でデータ更新する。
      // defのフィールド（type/cluster/clusterRadius等）はそのまま保持し、
      // setData(data)はmap._lastGeoJSONに記録する。
      addSource(id, def) {
        const source = {
          ...def,
          setData(data) { this._ownerMap._lastGeoJSON = { id, data }; return this },
        }
        source._ownerMap = this
        this._sources.set(id, source)
        return this
      },
      getSource(id) { return this._sources.has(id) ? this._sources.get(id) : null },
      removeSource(id) { this._sources.delete(id); return this },
      addLayer(layer) { this._layers.push(layer); return this },
      removeLayer(id) { this._layers = this._layers.filter((l) => l.id !== id); return this },
      querySourceFeatures(id, query) {
        const fn = state._querySourceFeatures || this._queryFeaturesFn
        return fn ? fn(id, query) : []
      },

      // 注: このオブジェクトのメソッドはthisを参照するため、
      // 矢印関数ではなく通常のメソッド定義を使うこと（new時の戻り値がオブジェクトのため）
      setView(...a) { return this._record('setView', a) },
      fitBounds(...a) { return this._record('fitBounds', a) },
      panTo(...a) { return this._record('panTo', a) },
      easeTo(...a) { return this._record('easeTo', a) },
      jumpTo(...a) { return this._record('jumpTo', a) },
      getBounds() { return bounds },
      getZoom() { return options.zoom ?? 12 },
      // 実MapLibreのgetCenter()はLngLatオブジェクト（.lat/.lngプロパティ付き）を返す
      getCenter() { return options.center || { lat: (bbox.south + bbox.north) / 2, lng: (bbox.west + bbox.east) / 2 } },
      getCanvas() { return { style: {} } },
      addControl() { return this },
      removeControl() { return this },
      addMarker(m) { this._markers.push(m); return this },
      removeMarker(m) { this._markers = this._markers.filter((x) => x !== m); return this },
      resize() { return this._record('resize') },
      remove() { this._removed = true },
    }
    state.maps.push(map)

    // style loadの擬似再現: 実際のMapLibreは非同期で'load'を発火する
    // （デフォルトでマイクロタスクとして自動発火。制御したい場合は
    //   createMapLibreMock({ autoLoad: false }) で無効化し、テストが
    //   map.fire('load') で明示的に発火する）
    if (options.autoLoad !== false) {
      queueMicrotask(() => {
        if (!map._removed) map.fire('load')
      })
    }
    return map
  }

  // `new maplibregl.Map(opts)` → オブジェクトを返す関数（new時の戻り値）
  // 注: 関数名をMapにするとモジュール内でグローバルMapをシャドウし、
  // makeMap内の `new Map()`（_sources）が再帰するためMapMockとする
  function MapMock(mapOptions) {
    return makeMap(mapOptions)
  }

  function Marker(markerOptions = {}) {
    const marker = {
      _options: markerOptions,
      _element: markerOptions.element || null,
      _lngLat: null,
      _popup: null,
      _map: null,
      _removed: false,
      setLngLat(ll) { this._lngLat = ll; return this },
      addTo(m) { this._map = m; if (m && m.addMarker) m.addMarker(this); return this },
      remove() { this._removed = true; if (this._map && this._map.removeMarker) this._map.removeMarker(this); return this },
      setPopup(p) { this._popup = p; return this },
      getPopup() { return this._popup },
    }
    state.markers.push(marker)
    return marker
  }

  function Popup(popupOptions = {}) {
    const popup = {
      _options: popupOptions,
      _lngLat: null,
      _element: null,
      _text: null,
      _map: null,
      _opened: false,
      _removed: false,
      setLngLat(ll) { this._lngLat = ll; return this },
      setDOMElement(el) { this._element = el; return this },
      setText(t) { this._text = t; return this },
      addTo(m) { this._map = m; this._opened = true; return this },
      open() { this._opened = true; return this },
      close() { this._opened = false; return this },
      remove() { this._removed = true; this._opened = false; return this },
    }
    state.popups.push(popup)
    return popup
  }

  function NavigationControl(controlOptions) {
    const control = {
      _options: controlOptions || {},
      addTo: () => control,
      remove: () => control,
    }
    return control
  }

  function LngLatBounds() {
    return bounds
  }

  return {
    Map: MapMock,
    Marker,
    Popup,
    NavigationControl,
    LngLatBounds,
    // テストから querySourceFeatures の戻り値を動的に設定できる
    setQuerySourceFeatures(fn) {
      state._querySourceFeatures = fn
    },
    // テスト間でモック状態をリセットする（beforeEachで呼ぶ）
    resetState() {
      state.maps.length = 0
      state.markers.length = 0
      state.popups.length = 0
      state._querySourceFeatures = null
    },
    _state: state,
  }
}
