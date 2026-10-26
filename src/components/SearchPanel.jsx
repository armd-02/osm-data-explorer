import React, { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { useSearch } from '../hooks/useSearch'
import { checkBboxSize } from '../utils/geo'
import { getMapInstance } from '../hooks/useMapRef'
import SimpleSearch from './SimpleSearch'
import AdvancedSearch from './AdvancedSearch'

function SearchPanel() {
  const { state, dispatch } = useApp()
  const { search, cancel } = useSearch()
  const { searchMode, bbox } = state

  const bboxWarning = useMemo(() => {
    if (!bbox) return null
    return checkBboxSize(bbox).tooLarge ? checkBboxSize(bbox) : null
  }, [bbox])

  /**
   * (#41) 検索実行: 地図の表示範囲をBBOXとして使用する
   * 地図が表示されていれば map.getBounds() から取得、
   * なければ最後に確定した state.bbox を使用する。
   */
  const handleSearch = () => {
    const map = getMapInstance()
    if (map) {
      const bounds = map.getBounds()
      const mapBbox = {
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast()
      }
      search(mapBbox)
    } else {
      // 地図非表示時は state.bbox（前回検索範囲）を使用
      if (state.bbox) {
        search(state.bbox)
      } else {
        search(null) // useSearch内でエラー案内
      }
    }
  }

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

      {/* BBOX info (#41: 「前回検索範囲」と明記) */}
      <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
        <h3 className="text-xs font-medium text-slate-500 mb-1">前回検索範囲</h3>
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
            地図を移動・拡大して検索したい範囲を表示し、「検索する」を押してください。
          </p>
        )}
      </div>

      {/* Search button */}
      <div className="flex gap-2">
        <button
          onClick={handleSearch}
          disabled={state.status === 'loading'}
          className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {state.status === 'loading' ? '検索中...' : '検索する'}
        </button>
        {state.status === 'loading' && (
          <button
            onClick={cancel}
            className="px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            中止
          </button>
        )}
      </div>
    </div>
  )
}

export default SearchPanel
