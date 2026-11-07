/**
 * OSMラスタタイルベースマップスタイル（MapLibre GL用）
 *
 * タイルサーバーは community_mapmaker と同じく OpenStreetMap Japan
 * （OSMFJ）の tile.openstreetmap.jp を使用する（ラスタタイル単一URL）。
 * © OpenStreetMap contributors 表記（attributionフィールドと
 * MapLibre標準のAttributionControlで表示）。
 *
 * glyphsはクラスタ件数テキスト（symbolレイヤ）のために必要。
 * community_mapmaker と同じ {fontstack}/{range}.pbf 形式を用いる。
 *
 * 注意: MapLibreはスタイルのglyphs URLに {fontstack} と {range} トークンを
 * 必須とする（@maplibre/maplibre-gl-style-spec のvalidateGlyphsUrl）。旧OpenMapTiles
 * の {font}/{font}-{range} 形式は検証エラーとなり、スタイルがロードされず地図が
 * 描画されない原因になる（mapStyle.test.js で回帰テストしている）。
 */
export const OSM_RASTER_STYLE = {
  version: 8,
  glyphs: 'https://tile.openstreetmap.jp/fonts/{fontstack}/{range}.pbf',
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.jp/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors'
    }
  },
  layers: [
    { id: 'osm-tiles', type: 'raster', source: 'osm' }
  ]
}

export default OSM_RASTER_STYLE
