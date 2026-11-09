import { describe, it, expect } from 'vitest'
import { buildBarrierFreeQuery, parseBarrierFreeElements, barrierFreeLabel } from '../barrierFree'

const testBbox = { south: 34.700000, west: 135.480000, north: 34.710000, east: 135.490000 }

// ===== buildBarrierFreeQuery =====

describe('buildBarrierFreeQuery (#62)', () => {
  it('bbox 値が6桁小数でエンコードされる', () => {
    const query = buildBarrierFreeQuery(testBbox)
    expect(query).toContain('34.700000,135.480000,34.710000,135.490000')
  })

  it('タイムアウトが25秒で設定される', () => {
    const query = buildBarrierFreeQuery(testBbox)
    expect(query).toContain('[out:json][timeout:25]')
  })

  it('歩道ウェイ（footway・path）が out geom で取得される', () => {
    const query = buildBarrierFreeQuery(testBbox)
    expect(query).toContain('way[highway=footway]')
    expect(query).toContain('way[highway=path]')
    expect(query).toContain('out geom')
  })

  it('縁石ノード（barrier=kerb / kerb）が out body で取得される', () => {
    const query = buildBarrierFreeQuery(testBbox)
    expect(query).toContain('node[barrier=kerb]')
    expect(query).toContain('node[kerb]')
    expect(query).toContain('out body')
  })

  it('音声案内ノード（sound / vibration）が out body で取得される', () => {
    const query = buildBarrierFreeQuery(testBbox)
    expect(query).toContain('node["traffic_signals:sound"]')
    expect(query).toContain('node["traffic_signals:vibration"]')
  })

  it('生成クエリが正しい Overpass QL 文法構造である（全体構造の完全一致）', () => {
    const query = buildBarrierFreeQuery(testBbox)
    // クエリ全体を完全一致で固定:
    // - union（forブロック）は `);` で閉じ、`out geom;` / `out body;` は独立した文
    // - コロンを含むタグキーはダブルクォートで囲む
    expect(query).toBe(`[out:json][timeout:25];
(
  way[highway=footway](34.700000,135.480000,34.710000,135.490000);
  way[highway=path](34.700000,135.480000,34.710000,135.490000);
);
out geom;
(
  node[barrier=kerb](34.700000,135.480000,34.710000,135.490000);
  node[kerb](34.700000,135.480000,34.710000,135.490000);
  node["traffic_signals:sound"](34.700000,135.480000,34.710000,135.490000);
  node["traffic_signals:vibration"](34.700000,135.480000,34.710000,135.490000);
);
out body;
`)
    // 不正な並び `) out`（閉じ括弧の直後に out）が存在しない
    expect(query).not.toContain(') out')
    // out 文は `);` の直後に来る
    expect(query).toContain(');\nout geom;')
    expect(query).toContain(');\nout body;')
    // コロン付きキーがダブルクォートで囲まれている
    expect(query).toContain('node["traffic_signals:sound"]')
    expect(query).toContain('node["traffic_signals:vibration"]')
  })
})

// ===== parseBarrierFreeElements =====

describe('parseBarrierFreeElements (#62)', () => {
  // --- ウェイ ---

  it('ウェイを整形する: kind, osmId, geometry, tags, tactile, lengthM', () => {
    const elements = [{
      type: 'way',
      id: 123456,
      tags: { highway: 'footway', tactile_paving: 'yes' },
      geometry: [
        { lat: 34.700, lon: 135.480 },
        { lat: 34.701, lon: 135.481 },
        { lat: 34.702, lon: 135.482 },
      ],
    }]
    const result = parseBarrierFreeElements(elements)
    expect(result).toHaveLength(1)
    const w = result[0]
    expect(w.kind).toBe('way')
    expect(w.osmId).toBe('way/123456')
    expect(w.geometry).toEqual([
      [135.480, 34.700],
      [135.481, 34.701],
      [135.482, 34.702],
    ])
    expect(w.tags).toEqual({ highway: 'footway', tactile_paving: 'yes' })
    expect(w.tactile).toBe('yes')
    expect(w.lengthM).toBeGreaterThan(0)
  })

  it('tactile_paving が未設定の場合は null', () => {
    const elements = [{
      type: 'way',
      id: 1,
      tags: { highway: 'footway' },
      geometry: [
        { lat: 34.7, lon: 135.48 },
        { lat: 34.71, lon: 135.49 },
      ],
    }]
    const result = parseBarrierFreeElements(elements)
    expect(result[0].tactile).toBeNull()
  })

  it('tactile_paving が yes/no 以外の値の場合は null', () => {
    const elements = [{
      type: 'way',
      id: 1,
      tags: { highway: 'footway', tactile_paving: 'designated' },
      geometry: [
        { lat: 34.7, lon: 135.48 },
        { lat: 34.71, lon: 135.49 },
      ],
    }]
    const result = parseBarrierFreeElements(elements)
    expect(result[0].tactile).toBeNull()
  })

  it('geometry の無いウェイは除外される', () => {
    const elements = [
      { type: 'way', id: 1, tags: { highway: 'footway' }, geometry: [] },
      { type: 'way', id: 2, tags: { highway: 'path' }, geometry: [
        { lat: 34.7, lon: 135.48 },
        { lat: 34.71, lon: 135.49 },
      ]},
    ]
    const result = parseBarrierFreeElements(elements)
    expect(result).toHaveLength(1)
    expect(result[0].osmId).toBe('way/2')
  })

  it('lengthM が概算で計算される（正の値）', () => {
    // 約 100m 程度の短いウェイ
    const elements = [{
      type: 'way',
      id: 1,
      tags: { highway: 'footway' },
      geometry: [
        { lat: 34.7000, lon: 135.4800 },
        { lat: 34.7009, lon: 135.4800 }, // 約100m北
      ],
    }]
    const result = parseBarrierFreeElements(elements)
    expect(result[0].lengthM).toBeGreaterThan(90)
    expect(result[0].lengthM).toBeLessThan(110)
  })

  // --- ノード ---

  it('ノードを整形する: kind, osmId, geometry, tags, kerb, hasSound, hasVibration, tactile', () => {
    const elements = [{
      type: 'node',
      id: 789,
      lat: 34.705,
      lon: 135.485,
      tags: { barrier: 'kerb', kerb: 'lifted', 'traffic_signals:sound': 'yes' },
    }]
    const result = parseBarrierFreeElements(elements)
    expect(result).toHaveLength(1)
    const n = result[0]
    expect(n.kind).toBe('node')
    expect(n.osmId).toBe('node/789')
    expect(n.geometry).toEqual([135.485, 34.705])
    expect(n.kerb).toBe('lifted')
    expect(n.hasSound).toBe(true)
    expect(n.hasVibration).toBe(false)
    expect(n.tactile).toBeNull()
  })

  it('barrier=kerb のみで kerb タグがない場合: kerb は null', () => {
    const elements = [{
      type: 'node',
      id: 1,
      lat: 34.7,
      lon: 135.48,
      tags: { barrier: 'kerb' },
    }]
    const result = parseBarrierFreeElements(elements)
    expect(result[0].kerb).toBeNull()
  })

  it('lat/lon の無いノードは除外される', () => {
    const elements = [
      { type: 'node', id: 1, tags: { barrier: 'kerb' } }, // lat/lon なし
      { type: 'node', id: 2, lat: 34.7, lon: 135.48, tags: { kerb: 'low' } },
    ]
    const result = parseBarrierFreeElements(elements)
    expect(result).toHaveLength(1)
    expect(result[0].osmId).toBe('node/2')
  })

  // --- 重複排除 ---

  it('同一ノードが複数条件に該当しても1件にまとまる', () => {
    // 同じノードが barrier=kerb と traffic_signals:sound の両方から取得された場合
    const elements = [
      {
        type: 'node', id: 42, lat: 34.7, lon: 135.48,
        tags: { barrier: 'kerb', kerb: 'lowered', 'traffic_signals:sound': 'yes' },
      },
      {
        // 同一ノードの重複（Overpassが複数セレクタで返すケース）
        type: 'node', id: 42, lat: 34.7, lon: 135.48,
        tags: { barrier: 'kerb', kerb: 'lowered', 'traffic_signals:sound': 'yes' },
      },
    ]
    const result = parseBarrierFreeElements(elements)
    expect(result).toHaveLength(1)
    expect(result[0].osmId).toBe('node/42')
    expect(result[0].kerb).toBe('lowered')
    expect(result[0].hasSound).toBe(true)
    expect(result[0].hasVibration).toBe(false)
  })

  it('異なるノードはそれぞれ独立した項目になる', () => {
    const elements = [
      { type: 'node', id: 1, lat: 34.7, lon: 135.48, tags: { barrier: 'kerb' } },
      { type: 'node', id: 2, lat: 34.71, lon: 135.49, tags: { 'traffic_signals:vibration': 'yes' } },
    ]
    const result = parseBarrierFreeElements(elements)
    expect(result).toHaveLength(2)
    expect(result[0].osmId).toBe('node/1')
    expect(result[1].osmId).toBe('node/2')
  })

  // --- 混合 ---

  it('ウェイとノードが混在する配列も正しく処理される', () => {
    const elements = [
      {
        type: 'way', id: 100, tags: { highway: 'footway' },
        geometry: [{ lat: 34.7, lon: 135.48 }, { lat: 34.71, lon: 135.49 }],
      },
      {
        type: 'node', id: 200, lat: 34.7, lon: 135.48, tags: { barrier: 'kerb' },
      },
    ]
    const result = parseBarrierFreeElements(elements)
    expect(result).toHaveLength(2)
    expect(result[0].kind).toBe('way')
    expect(result[1].kind).toBe('node')
  })

  // --- エッジケース ---

  it('空配列を渡すと空配列を返す', () => {
    expect(parseBarrierFreeElements([])).toEqual([])
  })

  it('null/undefined を渡すと空配列を返す', () => {
    expect(parseBarrierFreeElements(null)).toEqual([])
    expect(parseBarrierFreeElements(undefined)).toEqual([])
  })

  it('tags が未定義の要素も処理できる', () => {
    const elements = [
      { type: 'node', id: 1, lat: 34.7, lon: 135.48 },
    ]
    const result = parseBarrierFreeElements(elements)
    expect(result).toHaveLength(1)
    expect(result[0].tags).toEqual({})
    expect(result[0].kerb).toBeNull()
    expect(result[0].hasSound).toBe(false)
    expect(result[0].hasVibration).toBe(false)
  })
})

// ===== barrierFreeLabel (#62 仕様4) =====

/** 整形済みウェイ要素（parseBarrierFreeElements の出力形状）を生成 */
function wayEl(tags, opts = {}) {
  const t = tags.tactile_paving
  return {
    kind: 'way',
    osmId: 'way/1',
    geometry: [[135.0, 34.0], [135.01, 34.0]],
    tags,
    tactile: t === 'yes' || t === 'no' ? t : null,
    lengthM: 100,
    ...opts
  }
}

/** 整形済みノード要素（parseBarrierFreeElements の出力形状）を生成 */
function nodeEl(tags) {
  const t = tags.tactile_paving
  return {
    kind: 'node',
    osmId: 'node/1',
    geometry: [135.0, 34.0],
    tags,
    kerb: tags.kerb ?? null,
    hasSound: 'traffic_signals:sound' in tags,
    hasVibration: 'traffic_signals:vibration' in tags,
    tactile: t === 'yes' || t === 'no' ? t : null
  }
}

/** 標準結果形状（bf フィールド付き）に変換（barrierFreeLabel が両形状を受け取ることを確認） */
function standardResult(el) {
  return {
    type: el.kind,
    id: 1,
    tags: el.tags,
    lat: 34.0,
    lon: 135.0,
    name: el.tags.name || null,
    osmId: el.osmId,
    bf: {
      kind: el.kind,
      tactile: el.tactile ?? null,
      lengthM: el.lengthM ?? null,
      kerb: el.kerb ?? null,
      hasSound: !!el.hasSound,
      hasVibration: !!el.hasVibration,
      geometry: el.geometry
    }
  }
}

describe('barrierFreeLabel (#62 仕様4)', () => {
  // --- way: 歩道・通路（tactile_paving の有無） ---

  it('footway + tactile_paving=yes → 歩道（点字ブロックあり）', () => {
    expect(barrierFreeLabel(wayEl({ highway: 'footway', tactile_paving: 'yes' }))).toBe('歩道（点字ブロックあり）')
  })

  it('footway + tactile_paving=no → 歩道（点字ブロックなし）', () => {
    expect(barrierFreeLabel(wayEl({ highway: 'footway', tactile_paving: 'no' }))).toBe('歩道（点字ブロックなし）')
  })

  it('footway かつ tactile_paving 未設定 → 歩道（点字ブロック未記録）', () => {
    expect(barrierFreeLabel(wayEl({ highway: 'footway' }))).toBe('歩道（点字ブロック未記録）')
  })

  it('path → 歩行者用通路（点字ブロックあり）', () => {
    expect(barrierFreeLabel(wayEl({ highway: 'path', tactile_paving: 'yes' }))).toBe('歩行者用通路（点字ブロックあり）')
  })

  it('他の highway 値 → 通路(値) として表示', () => {
    expect(barrierFreeLabel(wayEl({ highway: 'steps' }))).toBe('通路(steps)（点字ブロック未記録）')
  })

  // --- node: 縁石（kerb 値） ---

  it('barrier=kerb のみ（kerb 値未記録）→ 縁石（未記録）', () => {
    expect(barrierFreeLabel(nodeEl({ barrier: 'kerb' }))).toBe('縁石（未記録）')
  })

  it('kerb=low → 縁石（低縁石）', () => {
    expect(barrierFreeLabel(nodeEl({ barrier: 'kerb', kerb: 'low' }))).toBe('縁石（低縁石）')
  })

  it('kerb=none → 縁石（段差なし）', () => {
    expect(barrierFreeLabel(nodeEl({ kerb: 'none' }))).toBe('縁石（段差なし）')
  })

  it('kerb=cut → 縁石（段差下がり）', () => {
    expect(barrierFreeLabel(nodeEl({ kerb: 'cut' }))).toBe('縁石（段差下がり）')
  })

  it('マッピングされていない kerb 値はそのまま表示', () => {
    expect(barrierFreeLabel(nodeEl({ kerb: 'weird' }))).toBe('縁石（weird）')
  })

  // --- node: 音声/振動案内信号 ---

  it('traffic_signals:sound のみ → 音声案内信号', () => {
    expect(barrierFreeLabel(nodeEl({ 'traffic_signals:sound': 'yes' }))).toBe('音声案内信号')
  })

  it('traffic_signals:vibration のみ → 振動案内信号', () => {
    expect(barrierFreeLabel(nodeEl({ 'traffic_signals:vibration': 'yes' }))).toBe('振動案内信号')
  })

  it('sound + vibration → 音・振動案内信号', () => {
    expect(barrierFreeLabel(nodeEl({ 'traffic_signals:sound': 'yes', 'traffic_signals:vibration': 'yes' }))).toBe('音・振動案内信号')
  })

  it('案内信号が優先される（kerb と sound が両方ある場合）', () => {
    expect(barrierFreeLabel(nodeEl({ barrier: 'kerb', kerb: 'low', 'traffic_signals:sound': 'yes' }))).toBe('音声案内信号')
  })

  it('該当タグの無いノード → バリアフリー要素', () => {
    expect(barrierFreeLabel(nodeEl({ traffic_signals: 'traffic_signals' }))).toBe('バリアフリー要素')
  })

  // --- 標準結果形状（bf フィールド付き）でも同じラベル ---

  it('標準結果形状も受け取る（縁石）', () => {
    expect(barrierFreeLabel(standardResult(nodeEl({ barrier: 'kerb' })))).toBe('縁石（未記録）')
  })

  it('標準結果形状も受け取る（音声案内信号）', () => {
    expect(barrierFreeLabel(standardResult(nodeEl({ 'traffic_signals:sound': 'yes' })))).toBe('音声案内信号')
  })

  it('標準結果形状も受け取る（歩道）', () => {
    expect(barrierFreeLabel(standardResult(wayEl({ highway: 'footway', tactile_paving: 'yes' })))).toBe('歩道（点字ブロックあり）')
  })

  it('null/undefined → バリアフリー要素', () => {
    expect(barrierFreeLabel(null)).toBe('バリアフリー要素')
    expect(barrierFreeLabel(undefined)).toBe('バリアフリー要素')
  })
})
