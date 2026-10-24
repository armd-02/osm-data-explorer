import React, { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { useSearch } from '../hooks/useSearch'
import { checkBboxSize } from '../utils/geo'
import SimpleSearch from './SimpleSearch'
import AdvancedSearch from './AdvancedSearch'

function SearchPanel() {
  const { state, dispatch } = useApp()
  const { search } = useSearch()
  const { searchMode, bbox } = state

  const bboxWarning = useMemo(() => {
    if (!bbox) return null
    return checkBboxSize(bbox).tooLarge ? checkBboxSize(bbox) : null
  }, [bbox])

  return (
    <div className="p-4 space-y-4">
      {/* Mode tabs */}
      <div className="flex rounded-lg bg-slate-100 p-1">
        <button
          onClick={() => dispatch({ type: 'SET_SEARCH_MODE', payload: 'simple' })}
          className={`flex-1 py-1.5 text-sm rounded-md transition-all ${
            searchMode === 'simple'
              ? 'bg-white text-slate-800 shadow-sm font-medium'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          かんたん検索
        </button>
        <button
          onClick={() => dispatch({ type: 'SET_SEARCH_MODE', payload: 'advanced' })}
          className={`flex-1 py-1.5 text-sm rounded-md transition-all ${
            searchMode === 'advanced'
              ? 'bg-white text-slate-800 shadow-sm font-medium'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          詳細検索
        </button>
      </div>

      {/* Search form */}
      {searchMode === 'simple' ? <SimpleSearch /> : <AdvancedSearch />}

      {/* BBOX info */}
      <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
        <h3 className="text-xs font-medium text-slate-500 mb-1">検索範囲</h3>
        {state.bbox ? (
          <>
            <p className="text-xs text-slate-600 font-mono">
              北: {state.bbox.north.toFixed(6)}°
              <br />
              南: {state.bbox.south.toFixed(6)}°
              <br />
              東: {state.bbox.east.toFixed(6)}°
              <br />
              西: {state.bbox.west.toFixed(6)}°
            </p>
            {bboxWarning && (
              <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
                ⚠️ {bboxWarning.message}
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-slate-400">
            地図の表示範囲が検索範囲になります。地図を移動・ズームして範囲を設定してください。
          </p>
        )}
      </div>

      {/* Search button */}
      <button
        onClick={search}
        disabled={state.status === 'loading'}
        className="w-full py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
      >
        {state.status === 'loading' ? '検索中...' : '検索する'}
      </button>
    </div>
  )
}

export default SearchPanel
