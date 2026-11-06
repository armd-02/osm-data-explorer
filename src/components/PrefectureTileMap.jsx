import React, { useMemo } from 'react'

/**
 * 都道府県ブロック地図（タイルグリッド）
 *
 * 47都道府県を正方形タイルで並べた、一般的な日本タイル地図レイアウト
 * （上=北・左=西）の SVG コンポーネント。タイルをクリック/タップで
 * 都道府県を選択する。
 *
 * アクセシビリティ:
 *  - タイルは role="button" + tabIndex=0 によりキーボードでフォーカス可能
 *  - Enter / Space キーで選択
 *  - aria-pressed で選択状態をスクリーンリーダーに伝える
 *  - aria-label で都道府県名を伝える
 *
 * データは public/data/municipalities.json の prefCode/prefecture から
 * 派生した PREFECTURES（MunicipalitySearch 側で生成）をそのまま使用。
 * 新規の外部データは導入しない。
 */

// 一般的な日本タイル地図レイアウト: prefCode → [row, col]
export const TILE_GRID = {
  '01': [0, 3],  // 北海道
  '02': [1, 3],  // 青森県
  '03': [2, 3],  // 岩手県
  '04': [3, 3],  // 宮城県
  '05': [2, 2],  // 秋田県
  '06': [3, 2],  // 山形県
  '07': [3, 4],  // 福島県
  '08': [4, 4],  // 茨城県
  '09': [4, 3],  // 栃木県
  '10': [4, 2],  // 群馬県
  '11': [5, 3],  // 埼玉県
  '12': [4, 5],  // 千葉県
  '13': [5, 4],  // 東京都
  '14': [6, 4],  // 神奈川県
  '15': [5, 1],  // 新潟県
  '16': [6, 1],  // 富山県
  '17': [7, 1],  // 石川県
  '18': [7, 2],  // 福井県
  '19': [5, 2],  // 山梨県
  '20': [6, 3],  // 長野県
  '21': [6, 2],  // 岐阜県
  '22': [6, 5],  // 静岡県
  '23': [7, 3],  // 愛知県
  '24': [8, 2],  // 三重県
  '25': [7, 4],  // 滋賀県
  '26': [8, 3],  // 京都府
  '27': [8, 4],  // 大阪府
  '28': [8, 5],  // 兵庫県
  '29': [9, 3],  // 奈良県
  '30': [9, 4],  // 和歌山県
  '31': [8, 1],  // 鳥取県
  '32': [8, 0],  // 島根県
  '33': [9, 1],  // 岡山県
  '34': [9, 2],  // 広島県
  '35': [10, 1], // 山口県
  '36': [10, 4], // 徳島県
  '37': [10, 3], // 香川県
  '38': [11, 2], // 愛媛県
  '39': [11, 3], // 高知県
  '40': [9, 0],  // 福岡県
  '41': [10, 0], // 佐賀県
  '42': [11, 0], // 長崎県
  '43': [10, 2], // 熊本県
  '44': [11, 4], // 大分県
  '45': [12, 3], // 宮崎県
  '46': [12, 2], // 鹿児島県
  '47': [13, 0]  // 沖縄県（島なので隅に配置）
}

const CELL = 56
const GAP = 6
const STEP = CELL + GAP

const COLORS = {
  baseFill: '#f1f5f9',   // slate-100
  baseStroke: '#cbd5e1', // slate-300
  baseText: '#334155',   // slate-700
  selFill: '#2563eb',    // primary-600
  selStroke: '#1e40af',  // primary-800
  selText: '#ffffff'
}

/**
 * @param {Array<{code: string, name: string}>} prefectures 都道府県リスト
 * @param {string} value 選択中のprefCode（'' = 未選択）
 * @param {function(string): void} onSelect タイル選択時のコールバック
 * @param {'pc'|'mobile'} variant レイアウト変種（mobileはスクロール可能コンテナ内表示）
 * @param {string} ariaLabel SVGグループ全体のアクセシブル名
 */
export default function PrefectureTileMap({
  prefectures,
  value = '',
  onSelect,
  variant = 'pc',
  ariaLabel = '都道府県選択（ブロック地図）'
}) {
  // レイアウトに配置済みコードのタイルのみを生成（重複コードは除外）
  const tiles = useMemo(() => {
    const seen = new Set()
    const list = []
    for (const p of prefectures) {
      const pos = TILE_GRID[p.code]
      if (!pos || seen.has(p.code)) continue
      seen.add(p.code)
      list.push({ code: p.code, name: p.name, row: pos[0], col: pos[1] })
    }
    return list
  }, [prefectures])

  const { width, height } = useMemo(() => {
    let maxRow = 0
    let maxCol = 0
    for (const t of tiles) {
      if (t.row > maxRow) maxRow = t.row
      if (t.col > maxCol) maxCol = t.col
    }
    return { width: (maxCol + 1) * STEP, height: (maxRow + 1) * STEP }
  }, [tiles])

  const handleActivate = (code) => {
    if (code) onSelect(code)
  }

  // (#) キーボード操作: Enter / Space で選択（ボタンと同等の挙動）
  const handleKeyDown = (e, code) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleActivate(code)
    }
  }

  const renderSvg = (className, style) => (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="group"
      aria-label={ariaLabel}
      className={className}
      style={style}
      focusable="false"
    >
      {tiles.map((t) => {
        const x = t.col * STEP
        const y = t.row * STEP
        const selected = t.code === value
        return (
          <g
            key={t.code}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            aria-label={t.name}
            className={selected ? 'pref-tile pref-tile--selected' : 'pref-tile'}
            onClick={() => handleActivate(t.code)}
            onKeyDown={(e) => handleKeyDown(e, t.code)}
          >
            <title>{t.name}</title>
            <rect
              x={x}
              y={y}
              width={CELL}
              height={CELL}
              rx={8}
              fill={selected ? COLORS.selFill : COLORS.baseFill}
              stroke={selected ? COLORS.selStroke : COLORS.baseStroke}
              strokeWidth={selected ? 2 : 1}
            />
            <text
              x={x + CELL / 2}
              y={y + CELL / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={11}
              fontWeight={selected ? 700 : 400}
              fill={selected ? COLORS.selText : COLORS.baseText}
            >
              {t.name}
            </text>
          </g>
        )
      })}
    </svg>
  )

  // モバイル: タップサイズを確保するため固定幅で描き、コンテナ内スクロール表示
  if (variant === 'mobile') {
    return (
      <div className="overflow-auto max-h-[380px] rounded-lg border border-slate-200 bg-slate-50">
        {renderSvg('block', { width: 520 })}
      </div>
    )
  }

  return renderSvg('w-full h-auto', undefined)
}
