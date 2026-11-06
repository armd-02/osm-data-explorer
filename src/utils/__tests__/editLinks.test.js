/**
 * (B3) OSM/iD編集導線URL生成のテスト
 */
import { describe, it, expect } from 'vitest'
import {
  buildIdElementUrl,
  buildIdMapUrl,
  buildNoteUrl,
  buildOsmElementUrl
} from '../editLinks'

describe('buildIdElementUrl (B3)', () => {
  it('要素ディープリンクを生成する（node）', () => {
    expect(buildIdElementUrl({ type: 'node', id: 1001 })).toBe(
      'https://www.openstreetmap.org/edit?node=node%2F1001'
    )
  })

  it('要素ディープリンクを生成する（way）', () => {
    expect(buildIdElementUrl({ type: 'way', id: 456 })).toBe(
      'https://www.openstreetmap.org/edit?node=way%2F456'
    )
  })

  it('type/idが未取得なら座標のmapリンクにフォールバックする', () => {
    expect(buildIdElementUrl({ lat: 34.85, lon: 135.5 })).toBe(
      'https://www.openstreetmap.org/edit?node=map%2F16%2F135.500000%2F34.850000'
    )
  })

  it('情報が一切ない場合はベースのedit URLを返す', () => {
    expect(buildIdElementUrl({})).toBe('https://www.openstreetmap.org/edit')
  })
})

describe('buildIdMapUrl / buildNoteUrl / buildOsmElementUrl', () => {
  it('buildIdMapUrl は map/z/lon/lat 形式（#12 方式と同一）', () => {
    expect(buildIdMapUrl(34.85, 135.5, 17)).toBe(
      'https://www.openstreetmap.org/edit?node=map%2F17%2F135.500000%2F34.850000'
    )
  })

  it('buildNoteUrl は座標付き notes/new URL', () => {
    expect(buildNoteUrl(34.85, 135.5)).toBe(
      'https://www.openstreetmap.org/notes/new?lat=34.850000&lon=135.500000'
    )
  })

  it('buildOsmElementUrl は要素ページURL', () => {
    expect(buildOsmElementUrl({ type: 'node', id: 1001 })).toBe(
      'https://www.openstreetmap.org/node/1001'
    )
  })
})
