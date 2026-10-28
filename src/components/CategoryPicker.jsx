import React, { useState } from 'react'
import { CATEGORY_GROUPS, getCategoriesForPurpose, getCategoryById, getPurposeOfCategory } from '../data/categories'

/**
 * (#44 生活者目線UI) カテゴリピッカー
 *
 * variant='pc'    : 従来どおりのグループ付き <select>（PC検索パネル用）
 * variant='mobile': 目的ベースのアイコンチップ（食べる／買う／遊ぶ／暮らす／学ぶ／その他）
 *                  → タップするとその目的の具体カテゴリチップが展開する
 *                  （段階的開示 = progressive disclosure）
 */

export default function CategoryPicker({ value, onChange, variant = 'pc' }) {
  if (variant === 'pc') {
    return <PcSelect value={value} onChange={onChange} />
  }
  return <MobileChips value={value} onChange={onChange} />
}

// ===== PC: グループ付きセレクト =====

function PcSelect({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
    >
      <option value="">選択してください（任意）</option>
      {CATEGORY_GROUPS.map((g) => (
        <optgroup key={g.name} label={`${g.icon} ${g.name}`}>
          {getCategoriesForPurpose(g.name).map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

// ===== モバイル: 目的アイコンチップ + 段階的開示 =====

function MobileChips({ value, onChange }) {
  const [openPurpose, setOpenPurpose] = useState(null)

  const selectedCat = value ? getCategoryById(value) : null
  const openCategories = openPurpose ? getCategoriesForPurpose(openPurpose) : []

  const purposeOf = (id) => getPurposeOfCategory(id)
  const iconOf = (id) => {
    const g = CATEGORY_GROUPS.find((g) => g.name === purposeOf(id))
    return g ? g.icon : ''
  }

  const tapPurpose = (name) => {
    setOpenPurpose((cur) => (cur === name ? null : name))
  }

  const tapCategory = (catId) => {
    if (value === catId) {
      onChange('') // 再タップで選択解除
      setOpenPurpose(null)
      return
    }
    onChange(catId)
    setOpenPurpose(null)
  }

  return (
    <div>
      {/* 目的チップ */}
      <div className="grid grid-cols-3 gap-1.5">
        {CATEGORY_GROUPS.map((g) => {
          const isSel = selectedCat && purposeOf(selectedCat.id) === g.name
          const isOpen = openPurpose === g.name
          return (
            <button
              key={g.name}
              type="button"
              onClick={() => tapPurpose(g.name)}
              aria-expanded={isOpen}
              aria-pressed={!!isSel}
              className={`min-h-[48px] rounded-xl border px-1 py-1.5 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isSel
                  ? 'bg-primary-50 border-primary-400 text-primary-700'
                  : isOpen
                    ? 'bg-primary-50 border-primary-300'
                    : 'bg-white border-slate-200 text-slate-600 active:bg-slate-50'
              }`}
            >
              <span className="text-lg leading-none" aria-hidden="true">{g.icon}</span>
              <span className="text-xs font-medium">{g.name}</span>
            </button>
          )
        })}
      </div>

      {/* 展開された具体カテゴリチップ */}
      {openPurpose && openCategories.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {openCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => tapCategory(cat.id)}
              aria-pressed={value === cat.id}
              className={`min-h-[44px] rounded-full border px-3 text-sm transition-colors ${
                value === cat.id
                  ? 'bg-primary-600 border-primary-600 text-white'
                  : 'bg-white border-slate-200 text-slate-700 active:bg-slate-50'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* 選択中カテゴリの表示・解除 */}
      {selectedCat && (
        <div className="mt-1.5 flex items-center gap-2 bg-primary-50 border border-primary-100 rounded-lg px-2.5 py-1.5">
          <span className="text-sm text-primary-800">
            {iconOf(selectedCat.id)} {selectedCat.label}
          </span>
          <button
            type="button"
            onClick={() => onChange('')}
            className="ml-auto text-xs text-primary-700 underline min-h-[24px] px-1"
          >
            解除
          </button>
        </div>
      )}
    </div>
  )
}
