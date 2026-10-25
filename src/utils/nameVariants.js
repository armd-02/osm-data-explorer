/**
 * 店舗名の緩やかな表記揺れ照合用キー。
 *
 * `normalizeText` の通常の完全一致とは分離して使用する。
 * このキーでのみ一致した場合は「類似候補」として提示し、
 * OSM ID を自動的に確認済みにしてはならない。
 */
import { normalizeText } from './overpass'

// 読みを使った一般的な漢字変換は誤一致が多いため、確認済みの語だけを登録する。
// 「渋」単独の置換はしない（他の店舗名への影響を避ける）。
const LEXICAL_VARIANTS = [
  { pattern: /柿(?:しぶ|シブ)/g, canonical: '柿渋' }
]

// 漢字で書かれた語と語の間の「の」を省略可能な接続助詞として扱う。
// 短い店名では誤一致しやすいため、このキー単独による照合には最小長を設ける。
const LINKING_NO = /(?<=\p{Script=Han})の(?=\p{Script=Han})/gu

export function normalizeNameForFuzzyMatch(name) {
  let normalized = normalizeText(name)
  for (const { pattern, canonical } of LEXICAL_VARIANTS) {
    normalized = normalized.replace(pattern, canonical)
  }
  return normalized.replace(LINKING_NO, '')
}
