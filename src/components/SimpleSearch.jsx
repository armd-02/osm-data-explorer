import React, { useState } from 'react'
import { useApp } from '../context/AppContext'
import { CATEGORIES } from '../data/categories'

function SimpleSearch() {
  const { state, dispatch } = useApp()
  const { category, keyword, location } = state.simpleSearch

  const update = (field, value) => {
    dispatch({ type: 'SET_SIMPLE_SEARCH', payload: { [field]: value } })
  }

  return (
    <div className="space-y-3">
      {/* Category selection */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          探したいカテゴリ
        </label>
        <select
          value={category}
          onChange={(e) => update('category', e.target.value)}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        >
          <option value="">選択してください（任意）</option>
          {CATEGORIES.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.label}</option>
          ))}
        </select>
      </div>

      {/* Keyword search */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          名前やキーワード
        </label>
        <input
          type="text"
          value={keyword}
          onChange={(e) => update('keyword', e.target.value)}
          placeholder="例: 珈琲、ラーメン"
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
        <p className="mt-1 text-xs text-slate-400">
          店舗名や施設名の一部で検索できます
        </p>
      </div>

      {/* Location */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          場所（地名）
        </label>
        <input
          type="text"
          value={location}
          onChange={(e) => update('location', e.target.value)}
          placeholder="例: 大阪市北区、十三"
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
        <p className="mt-1 text-xs text-slate-400">
          地名を入力すると地図がその場所へ移動します
        </p>
      </div>
    </div>
  )
}

export default SimpleSearch
