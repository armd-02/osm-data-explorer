import React, { useState } from 'react'
import { useApp } from '../context/AppContext'

const COMMON_TAGS = [
  { key: 'amenity', label: '施設種別 (amenity)' },
  { key: 'shop', label: '店舗種別 (shop)' },
  { key: 'cuisine', label: '料理ジャンル (cuisine)' },
  { key: 'building', label: '建物種別 (building)' },
  { key: 'leisure', label: 'レジャー (leisure)' },
  { key: 'tourism', label: '観光 (tourism)' },
  { key: 'highway', label: '道路 (highway)' },
  { key: 'sport', label: 'スポーツ (sport)' },
]

function AdvancedSearch() {
  const { state, dispatch } = useApp()
  const { tags, keyword, useAnd } = state.advancedSearch
  const [newTagKey, setNewTagKey] = useState('')
  const [newTagValue, setNewTagValue] = useState('')
  const [tagMode, setTagMode] = useState('exists') // 'equals' | 'exists' | 'not_exists'

  const updateTags = (newTags) => {
    dispatch({ type: 'SET_ADVANCED_SEARCH', payload: { tags: newTags } })
  }

  const addTag = () => {
    if (!newTagKey) return
    const tag = {
      key: newTagKey,
      value: newTagValue,
      mode: tagMode
    }
    updateTags([...tags, tag])
    setNewTagKey('')
    setNewTagValue('')
    setTagMode('equals')
  }

  const removeTag = (index) => {
    updateTags(tags.filter((_, i) => i !== index))
  }

  const updateKeyword = (value) => {
    dispatch({ type: 'SET_ADVANCED_SEARCH', payload: { keyword: value } })
  }

  const toggleUseAnd = () => {
    dispatch({ type: 'SET_ADVANCED_SEARCH', payload: { useAnd: !useAnd } })
  }

  return (
    <div className="space-y-3">
      {/* Tag conditions */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          OSMタグ条件
        </label>

        {/* Existing tags */}
        {tags.length > 0 && (
          <div className="space-y-1.5 mb-2">
            {tags.map((tag, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-slate-50 rounded-md px-2 py-1.5">
                <code className="text-xs text-slate-700 flex-1">
                  {tag.mode === 'exists' && `${tag.key}=*`}
                  {tag.mode === 'not_exists' && `!${tag.key}`}
                  {tag.mode === 'equals' && `${tag.key}=${tag.value}`}
                </code>
                <button
                  onClick={() => removeTag(i)}
                  className="text-slate-400 hover:text-red-500 text-xs"
                >
                  ×
                </button>
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
              onChange={(e) => setNewTagKey(e.target.value)}
              placeholder="キー (例: amenity)"
              list="tag-key-suggestions"
              className="flex-1 px-2 py-1.5 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <datalist id="tag-key-suggestions">
              {COMMON_TAGS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </datalist>
            {tagMode === 'equals' && (
              <input
                type="text"
                value={newTagValue}
                onChange={(e) => setNewTagValue(e.target.value)}
                placeholder="値 (例: cafe)"
                className="flex-1 px-2 py-1.5 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            )}
            <button
              onClick={addTag}
              className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs rounded-md"
            >
              追加
            </button>
          </div>
        </div>
      </div>

      {/* AND/OR toggle */}
      {tags.length > 1 && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useAnd}
            onChange={toggleUseAnd}
            className="rounded border-slate-300"
          />
          <span className="text-slate-600">
            条件を AND（全て一致）で結合
          </span>
        </label>
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
      </div>
    </div>
  )
}

export default AdvancedSearch
