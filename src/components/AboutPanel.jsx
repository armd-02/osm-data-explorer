import React, { useState } from 'react'
import { useApp } from '../context/AppContext'
import { OVERPASS_ENDPOINTS, APP_CONFIG, FALLBACK_ENDPOINT_ORDER } from '../config'

/**
 * データ品質・出典・利用上の注意
 */
function AboutPanel() {
  const [section, setSection] = useState('overview')
  const { state } = useApp()

  const sections = [
    { id: 'overview', label: '概要' },
    { id: 'quality', label: 'データ品質' },
    { id: 'attribution', label: '出典・ライセンス' },
    { id: 'limitations', label: 'API制約' }
  ]

  return (
    <div className="h-full flex flex-col">
      {/* セクションタブ */}
      <div className="flex items-center gap-1 px-3 py-1.5 bg-slate-50 border-b border-slate-200 shrink-0 overflow-x-auto">
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`px-2.5 py-1 text-[11px] rounded transition-colors whitespace-nowrap ${
              section === s.id ? 'bg-primary-100 text-primary-700 font-medium' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto p-4 text-xs text-slate-700 space-y-3">
        {section === 'overview' && (
          <>
            <h3 className="text-sm font-medium text-slate-800">OSM Data Explorerとは</h3>
            <p>
              OpenStreetMapのデータを、地図・日本語カテゴリ・店舗名から検索し、
              一覧確認・集計・CSV/GeoJSONダウンロードができるWebツールです。
            </p>
            <p>
              OSMのタグ構造やOverpass QLの知識がなくても使えるように設計されています。
            </p>
            <div className="bg-slate-50 rounded p-2.5 mt-2">
              <p className="font-medium text-slate-600 mb-1">現在の設定</p>
              <ul className="space-y-0.5 text-[11px] text-slate-500">
                <li>Overpass: {OVERPASS_ENDPOINTS[APP_CONFIG.overpassEndpoint]?.label || APP_CONFIG.overpassEndpoint}</li>
                <li>最大結果: {APP_CONFIG.maxResults.toLocaleString()}件</li>
                <li>タイムアウト: 試行ごとに {APP_CONFIG.perAttemptTimeoutMs / 1000}秒 / 全体 {APP_CONFIG.totalTimeoutMs / 1000}秒</li>
                <li>BBOX上限: {APP_CONFIG.maxBboxAreaKm2.toLocaleString()} km²</li>
                <li>キャッシュ: {APP_CONFIG.cacheEnabled ? `有効（${APP_CONFIG.cacheMaxEntries}件）` : '無効'}</li>
              </ul>
            </div>
          </>
        )}

        {section === 'quality' && (
          <>
            <h3 className="text-sm font-medium text-slate-800">データ品質について</h3>
            <div className="space-y-2">
              <div className="bg-amber-50 border border-amber-200 rounded p-2.5">
                <p className="font-medium text-amber-800 mb-1">⏰ データの鮮度</p>
                <p className="text-[11px]">
                  OSMデータは常時更新されています。表示されるのは<b>取得時点のデータ</b>であり、
                  実際の現地状態と異なる場合があります。
                </p>
                {state.fetchMeta?.fetchedAt && (
                  <p className="text-[11px] mt-1 text-amber-700">
                    今回取得: {new Date(state.fetchMeta.fetchedAt).toLocaleString('ja-JP')}
                  </p>
                )}
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded p-2.5">
                <p className="font-medium text-blue-800 mb-1">🔍 「見つからない」の意味</p>
                <p className="text-[11px]">
                  検索結果が0件でも、<b>OSMに未登録とは限りません</b>。
                  以下の可能性があります：
                </p>
                <ul className="text-[11px] mt-1 list-disc list-inside space-y-0.5">
                  <li>表記の違い（例: 「薬局」vs「ドラッグストア」）</li>
                  <li>別名タグ（alt_name）でのみ登録されている</li>
                  <li>範囲が狭すぎる</li>
                  <li>OSMに実際に未登録</li>
                </ul>
              </div>

              <div className="bg-purple-50 border border-purple-200 rounded p-2.5">
                <p className="font-medium text-purple-800 mb-1">📊 属性の不完全性</p>
                <p className="text-[11px]">
                  OSMデータはボランティアによって維持されており、
                  電話番号・営業時間・ウェブサイト等の情報が欠けている場合があります。
                  「集計」タブで属性欠損率を確認できます。
                </p>
              </div>
            </div>
          </>
        )}

        {section === 'attribution' && (
          <>
            <h3 className="text-sm font-medium text-slate-800">出典・ライセンス</h3>
            <div className="space-y-2">
              <div className="bg-slate-50 rounded p-2.5">
                <p className="font-medium text-slate-700 mb-1">OpenStreetMapデータ</p>
                <p className="text-[11px]">
                  本ツールで表示・出力するデータは、OpenStreetMap contributorsによって作成されました。
                </p>
                <p className="text-[11px] mt-1">
                  ライセンス: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" className="text-primary-600 hover:underline">
                    Open Database License (ODbL)
                  </a>
                </p>
                <p className="text-[11px] mt-1 text-slate-500">
                  データを再利用・再配布する際は、ODbLの条件（帰属表示・シェアアルイク）に従ってください。
                </p>
              </div>

              <div className="bg-slate-50 rounded p-2.5">
                <p className="font-medium text-slate-700 mb-1">出力ファイルへの帰属</p>
                <p className="text-[11px]">
                  CSV・GeoJSONの出力ファイルには、自動的に以下が含まれます：
                </p>
                <ul className="text-[11px] mt-1 list-disc list-inside space-y-0.5">
                  <li>取得日時</li>
                  <li>使用したOverpass APIエンドポイント</li>
                  <li>© OpenStreetMap contributors 帰属</li>
                  <li>ODbLライセンスURL</li>
                </ul>
              </div>
            </div>
          </>
        )}

        {section === 'limitations' && (
          <>
            <h3 className="text-sm font-medium text-slate-800">API制約・既知の問題</h3>
            <div className="space-y-2">
              <div className="bg-red-50 border border-red-200 rounded p-2.5">
                <p className="font-medium text-red-800 mb-1">⚡ Overpass APIの制約</p>
                <ul className="text-[11px] space-y-0.5">
                  <li>• レート制限: 連続クエリは1秒間隔以上</li>
                  <li>• タイムアウト: 試行ごとに {APP_CONFIG.perAttemptTimeoutMs / 1000}秒、全体 {APP_CONFIG.totalTimeoutMs / 1000}秒</li>
                  <li>• 失敗時は自動で別エンドポイントにフォールバック（{FALLBACK_ENDPOINT_ORDER.join(' → ')}）</li>
                  <li>• BBOX面積上限: {APP_CONFIG.maxBboxAreaKm2.toLocaleString()} km²</li>
                  <li>• 結果上限: {APP_CONFIG.maxResults.toLocaleString()}件</li>
                  <li>• サーバー負荷により一時的に利用不可の場合あり</li>
                </ul>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded p-2.5">
                <p className="font-medium text-amber-800 mb-1">⚠️ 部分取得の可能性</p>
                <p className="text-[11px]">
                  大量の結果や複雑なクエリでは、タイムアウトにより<b>結果が不完全な場合</b>があります。
                  その場合はエラーとして明示し、「全件取得できた」とは表示しません。
                </p>
              </div>

              <div className="bg-slate-50 rounded p-2.5">
                <p className="font-medium text-slate-700 mb-1">🔀 エンドポイント切替</p>
                <p className="text-[11px]">
                  現在のエンドポイント: {OVERPASS_ENDPOINTS[APP_CONFIG.overpassEndpoint]?.label}
                </p>
                <p className="text-[11px] mt-1">
                  利用が混雑している場合は、設定ファイル（src/config.js）で
                  別エンドポイントに切替できます。
                </p>
                <ul className="text-[11px] mt-1 space-y-0.5">
                  {Object.entries(OVERPASS_ENDPOINTS).map(([key, ep]) => (
                    <li key={key}>
                      {ep.label} ({ep.url}) {key === APP_CONFIG.overpassEndpoint && '← 現在'}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default AboutPanel
