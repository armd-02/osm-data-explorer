import React, { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'

// 共通タグキーと値候補
const TAG_SUGGESTIONS = {
  amenity: ['cafe', 'restaurant', 'fast_food', 'bar', 'pub', 'pharmacy', 'hospital', 'bank', 'atm', 'toilets', 'fuel', 'parking', 'school', 'kindergarten', 'university', 'library', 'post_office', 'police', 'fire_station', 'townhall', 'place_of_worship', 'theatre', 'cinema'],
  shop: ['convenience', 'supermarket', 'bakery', 'butcher', 'greengrocer', 'clothes', 'shoes', 'department_store', 'gift', 'stationery', 'drugstore', 'florist', 'jewelry', 'hairdresser', 'beauty', 'car', 'bicycle', 'sports', 'toys', 'books', 'music', 'newsagent', 'alcohol', 'variety_store', 'hardware', 'furniture', 'computer', 'pet'],
  cuisine: ['japanese', 'ramen', 'sushi', 'izakaya', 'chinese', 'korean', 'italian', 'french', 'american', 'indian', 'thai', 'vietnamese', 'mexican', 'greek', 'pizza', 'burger', 'sweets', 'ice_cream', 'coffee', 'tea'],
  building: ['house', 'apartments', 'commercial', 'industrial', 'hospital', 'school', 'university', 'church', 'temple', 'shrine', 'hotel', 'office', 'retail', 'civic', 'residential', 'public', 'yes', 'no'],
  leisure: ['park', 'playground', 'garden', 'pitch', 'sports_centre', 'stadium', 'swimming_pool', 'golf_course', 'tennis_court', 'common', 'track'],
  tourism: ['hotel', 'hostel', 'motel', 'guest_house', 'apartment', 'museum', 'art_gallery', 'viewpoint', 'information', 'trail', 'picnic_site', 'wilderness'],
  highway: ['residential', 'unclassified', 'tertiary', 'secondary', 'primary', 'motorway', 'trunk', 'footway', 'path', 'cycleway', 'steps', 'track', 'bus_stop', 'platform'],
  sport: ['football', 'basketball', 'tennis', 'swimming', 'golf', 'baseball', 'volleyball', 'badminton', 'climbing', 'cycling', 'running', 'skateboarding', 'multi'],
  railway: ['station', 'subway', 'tram', 'railway', 'light_rail', 'station', 'subway_entry', 'tram_stop'],
  office: ['government', 'municipality', 'company', 'lawyer', 'financial', 'educational', 'religious', 'medical', 'tourism', 'ngo', 'political', 'diplomatic', 'telecommunication', 'research', 'it', 'marketing', 'accounting'],
  natural: ['wood', 'scrub', 'heath', 'grassland', 'wetland', 'water', 'rock', 'sand', 'earth', 'bare_rock', 'bog', 'mud', 'swamp', 'marsh', 'salt_marsh'],
  landuse: ['residential', 'commercial', 'industrial', 'retail', 'agricultural', 'forest', 'meadow', 'grass', 'grassland', 'waste_disposal', 'landfill', 'railway', 'traffic_square', 'urban', 'vacant', 'brownfield', 'greenfield', 'common', 'cemetery', 'park', 'school', 'hospital', 'military']
}

// 条件プレビュー生成
function buildConditionPreview(tags, useAnd) {
  if (!tags || tags.length === 0) return ''
  
  const conditions = tags.map((tag) => {
    if (tag.mode === 'equals') {
      if (!tag.value) return `${tag.key}=?`
      return `${tag.key}=${tag.value}`
    }
    if (tag.mode === 'exists') return `${tag.key}=*（存在）`
    if (tag.mode === 'not_exists') return `!${tag.key}（欠損）`
    return ''
  }).filter(Boolean)

  const joiner = useAnd ? ' AND ' : ' OR '
  return conditions.join(joiner)
}

function AdvancedSearch() {
  const { state, dispatch } = useApp()
  const { tags, keyword, useAnd } = state.advancedSearch
  const [newTagKey, setNewTagKey] = useState('')
  const [newTagValue, setNewTagValue] = useState('')
  const [tagMode, setTagMode] = useState('equals')
  const [error, setError] = useState(null)

  const updateTags = (newTags) => {
    dispatch({ type: 'SET_ADVANCED_SEARCH', payload: { tags: newTags } })
  }

  const addTag = () => {
    const key = newTagKey.trim()
    const value = newTagValue.trim()

    // バリデーション
    if (!key) {
      setError('キーを入力してください')
      return
    }
    if (tagMode === 'equals' && !value) {
      setError('「値が等しい」モードでは値を入力してください')
      return
    }
    if (key.includes('=') || key.includes('[') || key.includes(']') || key.includes('(') || key.includes(')')) {
      setError('キーに = [ ] ( ) を含めることはできません')
      return
    }

    const tag = { key, value: tagMode === 'equals' ? value : '', mode: tagMode }
    updateTags([...tags, tag])
    setNewTagKey('')
    setNewTagValue('')
    setTagMode('equals')
    setError(null)
  }

  const removeTag = (index) => {
    updateTags(tags.filter((_, i) => i !== index))
  }

  const moveTag = (index, direction) => {
    const newTags = [...tags]
    const target = index + direction
    if (target < 0 || target >= newTags.length) return
    ;[newTags[index], newTags[target]] = [newTags[target], newTags[index]]
    updateTags(newTags)
  }

  const updateKeyword = (value) => {
    dispatch({ type: 'SET_ADVANCED_SEARCH', payload: { keyword: value } })
  }

  const toggleUseAnd = () => {
    dispatch({ type: 'SET_ADVANCED_SEARCH', payload: { useAnd: !useAnd } })
  }

  // 値候補
  const valueSuggestions = useMemo(() => {
    return TAG_SUGGESTIONS[newTagKey.toLowerCase()] || []
  }, [newTagKey])

  // 条件プレビュー
  const preview = useMemo(() => buildConditionPreview(tags, useAnd), [tags, useAnd])

  return (
    <div className="space-y-3">
      {/* 条件プレビュー */}
      {tags.length > 0 && (
        <div className="bg-primary-50 border border-primary-100 rounded-md px-3 py-2">
          <p className="text-[11px] text-primary-800 font-medium mb-0.5">実行条件</p>
          <code className="text-xs text-primary-700 break-all">{preview}</code>
          <p className="text-[10px] text-slate-400 mt-1">
            {useAnd ? 'AND（全ての条件を満たす要素）' : 'OR（いずれかの条件を満たす要素）'}
          </p>
        </div>
      )}

      {/* Tag conditions */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          OSMタグ条件
        </label>

        {/* Existing tags */}
        {tags.length > 0 && (
          <div className="space-y-1.5 mb-2">
            {tags.map((tag, i) => (
              <div key={i} className="flex items-center gap-1 bg-slate-50 rounded-md px-2 py-1.5 group">
                <code className="text-xs text-slate-700 flex-1">
                  {tag.mode === 'exists' && `${tag.key}=*`}
                  {tag.mode === 'not_exists' && `!${tag.key}`}
                  {tag.mode === 'equals' && `${tag.key}=${tag.value}`}
                </code>
                <span className="text-[9px] text-slate-400 w-8 text-center">
                  {tag.mode === 'equals' ? '=' : tag.mode === 'exists' ? '存在' : '欠損'}
                </span>
                <button
                  onClick={() => moveTag(i, -1)}
                  disabled={i === 0}
                  className="text-slate-300 hover:text-slate-500 disabled:opacity-30 text-xs"
                  title="上へ"
                >↑</button>
                <button
                  onClick={() => moveTag(i, 1)}
                  disabled={i === tags.length - 1}
                  className="text-slate-300 hover:text-slate-500 disabled:opacity-30 text-xs"
                  title="下へ"
                >↓</button>
                <button
                  onClick={() => removeTag(i)}
                  className="text-slate-400 hover:text-red-500 text-xs"
                  title="削除"
                >×</button>
              </div>
            ))}
          </div>
        )}

        {/* Add new tag */}
        <div className="space-y-1.5">
          <select
            value={tagMode}
            onChange={(e) => setTagMode(e.target.value)}
            className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="equals">値が等しい (=)</option>
            <option value="exists">存在する (*)</option>
            <option value="not_exists">存在しない (!)</option>
          </select>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={newTagKey}
              onChange={(e) => { setNewTagKey(e.target.value); setError(null) }}
              onKeyDown={(e) => e.key === 'Enter' && addTag()}
              placeholder="キー (例: amenity)"
              list="tag-key-suggestions"
              className="flex-1 px-2 py-1.5 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <datalist id="tag-key-suggestions">
              {Object.keys(TAG_SUGGESTIONS).map((key) => (
                <option key={key} value={key}>{key}</option>
              ))}
            </datalist>
            {tagMode === 'equals' && (
              <input
                type="text"
                value={newTagValue}
                onChange={(e) => { setNewTagValue(e.target.value); setError(null) }}
                onKeyDown={(e) => e.key === 'Enter' && addTag()}
                placeholder="値"
                list="tag-value-suggestions"
                className="flex-1 px-2 py-1.5 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            )}
            {tagMode === 'equals' && valueSuggestions.length > 0 && (
              <datalist id="tag-value-suggestions">
                {valueSuggestions.map((v) => <option key={v} value={v}>{v}</option>)}
              </datalist>
            )}
            <button
              onClick={addTag}
              className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs rounded-md shrink-0"
            >
              追加
            </button>
          </div>
          {error && (
            <p className="text-[11px] text-red-600">⚠️ {error}</p>
          )}
        </div>

        {/* 複数値ORのヒント */}
        {tags.length > 0 && (
          <p className="mt-1 text-[11px] text-slate-400">
            同一キーの複数値をORで検索するには、同じキーで複数の条件を追加し、AND→ORに切り替えてください。
          </p>
        )}
      </div>

      {/* AND/OR toggle */}
      {tags.length > 1 && (
        <div className="flex items-center gap-3 bg-slate-50 rounded-md px-3 py-2">
          <label className="flex items-center gap-1.5 text-xs">
            <input type="radio" checked={useAnd} onChange={toggleUseAnd} className="rounded" />
            <span className={useAnd ? 'text-primary-700 font-medium' : 'text-slate-500'}>AND</span>
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <input type="radio" checked={!useAnd} onChange={toggleUseAnd} className="rounded" />
            <span className={!useAnd ? 'text-primary-700 font-medium' : 'text-slate-500'}>OR</span>
          </label>
          <span className="text-[10px] text-slate-400 ml-auto">
            {useAnd ? '全て一致' : 'いずれか一致'}
          </span>
        </div>
      )}

      {/* Keyword */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          名前キーワード（任意）
        </label>
        <input
          type="text"
          value={keyword}
          onChange={(e) => updateKeyword(e.target.value)}
          placeholder="例: 珈琲"
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
        <p className="mt-1 text-[11px] text-slate-400">
          タグ条件に名前キーワードを追加して絞り込みます
        </p>
      </div>
    </div>
  )
}

export default AdvancedSearch
