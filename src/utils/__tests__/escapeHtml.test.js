/**
 * HTMLエスケープの回帰テスト（Issue #19: XSS対策）
 */
import { describe, it, expect } from 'vitest'

// escapeHtml は MapView.jsx 内で定義されているため、
// ここでは同じロジックをテストする
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

describe('escapeHtml（Issue #19: XSS対策）', () => {
  it('scriptタグを無害化する', () => {
    const input = '<script>alert("xss")</script>'
    const output = escapeHtml(input)
    expect(output).not.toContain('<script>')
    expect(output).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
  })

  it('ampersandを最初にエスケープする（二重エスケープ防止）', () => {
    const input = 'Tom & Jerry'
    const output = escapeHtml(input)
    expect(output).toBe('Tom &amp; Jerry')
    // &amp; がさらにエスケープされない
    expect(output).not.toContain('&amp;amp;')
  })

  it('onclick属性注入を防ぐ', () => {
    const input = '"><script>alert(1)</script>'
    const output = escapeHtml(input)
    expect(output).toBe('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(output).not.toContain('"><script>')
  })

  it('単一引用符をエスケープする', () => {
    const input = "Cafe 'Montmartre'"
    const output = escapeHtml(input)
    expect(output).toBe("Cafe &#39;Montmartre&#39;")
  })

  it('null/undefinedは空文字列', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })

  it('特殊文字なしの値はそのまま', () => {
    expect(escapeHtml('ラーメン屋 田中')).toBe('ラーメン屋 田中')
  })

  it('数値は文字列化して処理', () => {
    expect(escapeHtml(42)).toBe('42')
  })

  it('複数の特殊文字を含む値', () => {
    const input = 'A&B <test> "quoted" \'single\''
    const output = escapeHtml(input)
    expect(output).toBe('A&amp;B &lt;test&gt; &quot;quoted&quot; &#39;single&#39;')
  })
})
