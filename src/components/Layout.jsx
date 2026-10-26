import React from 'react'

function Layout({ children }) {
  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-2 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 21l-6-6m0 0l6-6m-6 6h18M9 9l6 6m-6-6h12" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-800">OSMデータ検索</h1>
            <p className="text-xs text-slate-500 hidden sm:block">
              OpenStreetMapのデータを検索・集計・ダウンロード
            </p>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 min-h-0 overflow-hidden">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 px-4 py-1.5 shrink-0">
        <p className="text-xs text-slate-400 text-center">
          データの出典: OpenStreetMap contributors (ODbL)
        </p>
      </footer>
    </div>
  )
}

export default Layout
