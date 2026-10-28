import React from 'react'

/**
 * (#59) モバイル施設カード
 *
 * タップで施設詳細（ボトムシート）を開く。
 * 未登録の情報を捏造せず、OSM タグに登録済みの情報だけを表示する。
 * OSM ID は補助情報として小さく表示する。
 */

const KEY_TAG_ORDER = [
  'amenity', 'shop', 'tourism', 'leisure', 'railway',
  'highway', 'sport', 'office', 'building', 'cuisine',
]

export function facilityName(result) {
  const name = result.name || (result.tags && result.tags['name:ja'])
  return name || '名前のない要素'
}

export function formatAddress(tags) {
  if (!tags) return ''
  return [
    tags['addr:city'],
    tags['addr:suburb'],
    tags['addr:street'],
    tags['addr:housenumber'],
  ]
    .filter(Boolean)
    .join(' ')
}

export function safeWebsite(tags) {
  if (!tags) return null
  const url = tags.website || tags.official_website
  return url && /^https?:\/\//.test(url) ? url : null
}

function keyTagEntries(tags, max = 3) {
  if (!tags) return []
  const out = []
  for (const key of KEY_TAG_ORDER) {
    if (tags[key]) out.push([key, tags[key]])
    if (out.length >= max) break
  }
  return out
}

export default function MobileFacilityCard({ result, onOpen }) {
  const tags = result.tags || {}
  const name = facilityName(result)
  const address = formatAddress(tags)
  const keyTags = keyTagEntries(tags)

  return (
    <button
      type="button"
      onClick={() => onOpen(result)}
      className="w-full text-left bg-white border border-slate-200 rounded-xl p-3 space-y-1.5 active:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800 min-w-0 break-words">{name}</h3>
        <span className="shrink-0 text-[10px] text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">
          {result.type}
        </span>
      </div>

      {keyTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {keyTags.map(([k, v]) => (
            <span key={k} className="text-[11px] text-primary-700 bg-primary-50 rounded-md px-1.5 py-0.5">
              {v}
            </span>
          ))}
        </div>
      )}

      {address && <p className="text-xs text-slate-600">📍 {address}</p>}

      <p className="text-[10px] text-slate-400 font-mono">{result.type}/{result.id}</p>
    </button>
  )
}
