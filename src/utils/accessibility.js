/**
 * (#61) OSMバリアフリータグの解釈 → 日本語表示アイテム
 *
 * 解釈対象（OSMに登録済みのタグのみ表示。未登録は出さない・捏造しない）:
 *   wheelchair                 車椅子（yes / no / limited / designated）
 *   wheelchair:description     補足説明（:ja > 本体 > :en の優先順）
 *   toilets:wheelchair         バリアフリートイレ
 *   capacity:disabled          バリアフリー駐車台数
 *   elevator (+elevator:count) エレベーター
 *   tactile_paving             点字ブロック
 *   hearing_loop               ヒアリングループ
 *   stroller                   ベビーカー
 *
 * 利用箇所:
 *   - MobileFacilityDetail（詳細シートの「バリアフリー情報」セクション）
 *   - MobileFacilityCard（車椅子バッジ）
 *   - ResultsPanel（PC一覧表の「バリアフリー」列）
 *   - MapView（マーカーポップアップ）
 */

const TONE_CLASSES = {
  yes: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  no: 'text-rose-700 bg-rose-50 border-rose-200',
  limited: 'text-amber-700 bg-amber-50 border-amber-200',
  designated: 'text-sky-700 bg-sky-50 border-sky-200',
  unknown: 'text-slate-600 bg-slate-50 border-slate-200'
}

const TONE_LABELS = {
  yes: 'あり',
  no: 'なし',
  limited: '一部利用可',
  designated: '専用あり',
  unknown: ''
}

/** 値 → トーン（yes/no/limited/designated/unknown） */
export function toneOf(value) {
  const v = String(value).toLowerCase()
  if (v === 'yes' || v === 'full' || v === '1') return 'yes'
  if (v === 'no' || v === 'none' || v === '0') return 'no'
  if (v === 'limited' || v === 'partial') return 'limited'
  if (v === 'designated') return 'designated'
  return 'unknown'
}

/**
 * 地域言語付き値の選択: `${key}:ja` → `${key}` → `${key}:en` の優先順
 * @returns {string} 該当がなければ ''
 */
export function pickLocalized(tags, baseKey) {
  if (!tags) return ''
  return tags[`${baseKey}:ja`] || tags[baseKey] || tags[`${baseKey}:en`] || ''
}

const WC_LABELS = {
  yes: '車椅子対応',
  no: '車椅子非対応',
  limited: '車椅子一部対応',
  designated: '車椅子専用スペースあり',
  unknown: ''
}

/**
 * タグからバリアフリー情報を解析する
 * @param {object|null} tags OSMタグ
 * @returns {Array<{key:string, icon:string, label:string, status:string, tone:string, cls:string, note:string}>}
 *          該当タグがなければ空配列
 */
export function parseAccessibility(tags) {
  if (!tags) return []
  const items = []

  const push = (key, icon, label, value, note = '') => {
    const tone = toneOf(value)
    items.push({
      key,
      icon,
      label,
      status: tone === 'unknown' ? String(value) : TONE_LABELS[tone],
      tone,
      cls: TONE_CLASSES[tone],
      note
    })
  }

  // 車椅子（主情報。unknown値は生の値をそのまま表示）
  if (tags.wheelchair) {
    const tone = toneOf(tags.wheelchair)
    items.push({
      key: 'wheelchair',
      icon: '♿',
      label: '車椅子',
      status: WC_LABELS[tone] || String(tags.wheelchair),
      tone,
      cls: TONE_CLASSES[tone],
      note: pickLocalized(tags, 'wheelchair:description')
    })
  }

  if (tags['toilets:wheelchair']) {
    push('toilets:wheelchair', '🚻', 'バリアフリートイレ', tags['toilets:wheelchair'])
  }

  if (tags['capacity:disabled']) {
    items.push({
      key: 'capacity:disabled',
      icon: '🅿️',
      label: 'バリアフリー駐車',
      status: `${tags['capacity:disabled']}台`,
      tone: 'yes',
      cls: TONE_CLASSES.yes,
      note: ''
    })
  }

  if (tags.elevator) {
    push('elevator', '🛗', 'エレベーター', tags.elevator,
      tags['elevator:count'] ? `${tags['elevator:count']}基` : '')
  }

  // 点字ブロック: separate（別設置）は「あり」系として扱う
  if (tags.tactile_paving) {
    if (tags.tactile_paving === 'separate') {
      items.push({
        key: 'tactile_paving', icon: '🦯', label: '点字ブロック',
        status: '別設置（誘導線等）', tone: 'yes', cls: TONE_CLASSES.yes, note: ''
      })
    } else {
      push('tactile_paving', '🦯', '点字ブロック', tags.tactile_paving)
    }
  }

  if (tags.hearing_loop) push('hearing_loop', '🎧', 'ヒアリングループ', tags.hearing_loop)
  if (tags.stroller) push('stroller', '🚼', 'ベビーカー', tags.stroller)

  return items
}

/**
 * カード・一覧表用: 車椅子情報のコンパクトバッジ
 * @returns {{text:string, cls:string}|null} wheelchairタグがなければnull
 */
export function wheelchairBadge(tags) {
  if (!tags || !tags.wheelchair) return null
  const tone = toneOf(tags.wheelchair)
  return {
    text: WC_LABELS[tone] || `♿ ${tags.wheelchair}`,
    cls: TONE_CLASSES[tone]
  }
}
