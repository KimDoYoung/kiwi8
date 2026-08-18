/**
 * 이모지/특수문자 선택 팝업 (고정 팔레트, 백엔드 없음).
 * 커서(캐럿) 좌표 근처에 뜬다.
 *
 * 사용법:
 *   <EmojiPickerPopup kind="EMOJI" position={{ x: 100, y: 200 }} onSelect={(v) => insert(v)} onClose={() => setOpen(false)} />
 *   position은 viewport 기준 고정 좌표(px).
 */
import { useEffect, useState } from 'react'
import CaretAnchoredPopup from './CaretAnchoredPopup'
import { EMOJI_PALETTE, SYMBOL_PALETTE } from './emojiPalette'

interface Props {
  kind: 'EMOJI' | 'SYMBOL'
  position: { x: number; y: number }
  onSelect: (value: string) => void
  onClose: () => void
}

export default function EmojiPickerPopup({ kind, position, onSelect, onClose }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const COLS = 10

  const items = kind === 'EMOJI' ? EMOJI_PALETTE : SYMBOL_PALETTE

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation()
        if (items[activeIndex]) onSelect(items[activeIndex])
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault(); e.stopPropagation()
        setActiveIndex((i) => Math.min(i + 1, items.length - 1))
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault(); e.stopPropagation()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'ArrowDown') {
        e.preventDefault(); e.stopPropagation()
        setActiveIndex((i) => Math.min(i + COLS, items.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation()
        setActiveIndex((i) => Math.max(i - COLS, 0))
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [items, activeIndex, onSelect])

  return (
    <CaretAnchoredPopup
      position={position}
      onClose={onClose}
      className="bg-white rounded-lg shadow-xl border border-gray-200 p-2 w-96 max-h-64 overflow-y-auto"
    >
      <div className="grid grid-cols-10 gap-1">
        {items.map((value, idx) => (
          <button
            key={`${value}-${idx}`}
            type="button"
            onMouseEnter={() => setActiveIndex(idx)}
            onClick={() => onSelect(value)}
            className={`flex items-center justify-center h-8 w-8 text-lg rounded transition-colors ${
              idx === activeIndex ? 'bg-blue-100' : 'hover:bg-gray-100'
            }`}
          >
            {value}
          </button>
        ))}
      </div>
    </CaretAnchoredPopup>
  )
}
