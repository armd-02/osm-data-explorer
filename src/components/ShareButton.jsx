import React, { useState } from 'react'
import { useApp } from '../context/AppContext'
import { generateShareURL } from '../utils/urlState'

/**
 * 検索条件の共有ボタン
 */
function ShareButton() {
  const { state } = useApp()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const url = generateShareURL(state)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // フォールバック: プロンプトで表示
      window.prompt('URLをコピーしてください:', url)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handleCopy}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
          copied ? 'bg-green-100 text-green-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
        }`}
        title="検索条件をURLで共有"
      >
        {copied ? '✓ コピーしました' : '📎 共有URL'}
      </button>
      
      {/* トゥールチップ */}
      {!copied && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-slate-800 text-white text-[10px] rounded px-2 py-1.5 opacity-0 pointer-events-none transition-opacity hover:opacity-100 group-hover:opacity-100">
          現在の検索条件をURLにエンコードします。
          <br/>※ 共有URLを開いても同じ条件で検索できますが、
          <br/>OSMデータは常時更新されるため結果は異なる場合があります。
        </div>
      )}
    </div>
  )
}

export default ShareButton
