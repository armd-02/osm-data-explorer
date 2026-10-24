import { useRef } from 'react'

/**
 * 共有の地図リファレンス
 * MapViewがsetし、他のコンポーネントがgetする
 */
const sharedMapRef = { current: null }

export function useMapRef() {
  return sharedMapRef
}

export function setMapInstance(map) {
  sharedMapRef.current = map
}

export function getMapInstance() {
  return sharedMapRef.current
}
