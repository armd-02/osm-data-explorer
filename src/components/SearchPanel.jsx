import React, { useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { checkBboxSize } from '../utils/geo'
import SimpleSearch from './SimpleSearch'
import AdvancedSearch from './AdvancedSearch'
import MunicipalitySearch from './MunicipalitySearch'

function SearchPanel() {
  const { state, dispatch } = useApp()
  const { searchMode, bbox, searchSource } = state

  /**
   * (#44/#47) 検索ソース切替
   * 地図モードへ切替時は選択済み自治体をクリアし、
   * 旧モードの自治体BBOX・カテゴリを誤用しないようにする。
   */
  const switchSource = (source) => {
    if (source === 'map') {
      dispatch({ type: 'SET_SEARCH_SOURCE', payload: 'map' })
      dispatch({ type: 'SET_MUNICIPALITY', payload: null })
    } else {
      dispatch({ type: 'SET_SEARCH_SOURCE', payload: 'municipality' })
    }
  }

  const bboxWarning = useMemo(() => {
    if (!bbox) return null
    return checkBboxSize(bbox).tooLarge ? checkBboxSize(bbox) : null
  }, [bbox])

  return (
    <div className="p-4 space-y-4">
      {/* (#44) 検索ソース切替 */}
      <div className="flex rounded-lg bg-slate-100 p-1">
        <button
          onClick={() => switchSource('municipality')}
          className={`flex-1 py-1.5 text-sm rounded-md transition-all ${
            searchSource === 'municipality'
              ? 'bg-white text-slate-800 shadow-sm font-medium'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          自治体で検索
        </button>
        <button
          onClick={() => switchSource('map')}
          className={`flex-1 py-1.5 text-sm rounded-md transition-all ${
            searchSource === 'map'
              ? 'bg-white text-slate-800 shadow-sm font-medium'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          地図範囲で検索
        </button>
      </div>

      {searchSource === 'municipality' ? (
        /* (#44) 自治体モード */
        <MunicipalitySearch />
      ) : (
        /* 地図モード（既存） */
        <>
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
        </>
      )}
    </div>
  )
}

export default SearchPanel
