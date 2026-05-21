import { useEffect } from 'react'

type HotkeyMap = Partial<Record<string, (e: KeyboardEvent) => void>>

export function useGlobalHotkeys(map: HotkeyMap) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const fn = map[e.key]
      if (fn) fn(e)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [map])
}
