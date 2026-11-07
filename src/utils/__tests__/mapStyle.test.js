/**
 * OSMラスタベースマップスタイル（mapStyle.js）のテスト
 *
 * - community_mapmaker（tile.openstreetmap.jp / OSMFJ）と同一のサーバー指定か
 * - MapLibreのスタイル検証（validateStyleMin）に通過するか
 *   → glyphs URLに {fontstack}/{range} トークンを必須とする検証が、
 *     旧OpenMapTiles形式（{font}/{font}-{range}）のglyphsで地図が描画され
 *     なかった根本原因。ここで回帰テストする。
 * - 実際のサーバーがタイル・グリフを返すか（ネットワーク統合テスト）
 */
import { describe, it, expect } from 'vitest'
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import { OSM_RASTER_STYLE } from '../mapStyle'

const TILE_URL = 'https://tile.openstreetmap.jp/{z}/{x}/{y}.png'
const GLYPHS_URL = 'https://tile.openstreetmap.jp/fonts/{fontstack}/{range}.pbf'

// MapViewのクラスタ件数テキストが使うフォント（textFont: ['Noto Sans Regular']）
const CLUSTER_FONTSTACK = 'Noto Sans Regular'

describe('OSM_RASTER_STYLE 指定', () => {
  it('タイルはtile.openstreetmap.jpの単一URL（community_mapmakerと同一）', () => {
    expect(OSM_RASTER_STYLE.sources.osm.tiles).toEqual([TILE_URL])
    expect(OSM_RASTER_STYLE.sources.osm.type).toBe('raster')
    expect(OSM_RASTER_STYLE.sources.osm.tileSize).toBe(256)
  })

  it('glyphsはcommunity_mapmakerと同一の {fontstack}/{range}.pbf 形式', () => {
    expect(OSM_RASTER_STYLE.glyphs).toBe(GLYPHS_URL)
  })
})

describe('MapLibre スタイル検証（地図が描画されるための条件）', () => {
  it('現在のスタイルはvalidateStyleMinにエラーなしで通過する', () => {
    const errors = validateStyleMin(OSM_RASTER_STYLE)
    expect(errors.map((e) => e.message)).toEqual([])
  })

  it('旧OpenMapTiles形式（{font}/{font}-{range}）のglyphsは検証エラーになる（根因の再現）', () => {
    const broken = {
      ...OSM_RASTER_STYLE,
      glyphs: 'https://tiles.openmaptiles.org/fonts/{font}/{font}-{range}.pbf'
    }
    const errors = validateStyleMin(broken)
    expect(errors.some((e) => e.message.includes('{fontstack}'))).toBe(true)
  })
})

describe('実サーバーへの疎通（統合テスト）', () => {
  it('ラスタタイルが取得できる（z0/x0/y0 → 200, image/png, PNG署名）', async () => {
    const url = TILE_URL.replace('{z}', '0').replace('{x}', '0').replace('{y}', '0')
    const res = await fetch(url)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/png')
    const buf = new Uint8Array(await res.arrayBuffer())
    expect(buf.length).toBeGreaterThan(1000)
    // PNGシグネチャ (\x89PNG)
    expect([buf[0], buf[1], buf[2], buf[3]]).toEqual([0x89, 0x50, 0x4e, 0x47])
  }, 30000)

  it('グリフが取得できる（クラスタテキスト用フォント Noto Sans Regular / 0-255）', async () => {
    const url = GLYPHS_URL
      .replace('{fontstack}', CLUSTER_FONTSTACK)
      .replace('{range}', '0-255')
    const res = await fetch(url)
    expect(res.status).toBe(200)
    const buf = new Uint8Array(await res.arrayBuffer())
    expect(buf.length).toBeGreaterThan(100)
  }, 30000)
})
