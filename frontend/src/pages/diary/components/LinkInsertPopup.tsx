/**
 * 링크 삽입 팝업. 커서(캐럿) 좌표 근처에 뜬다.
 */
import { useState } from 'react'
import CaretAnchoredPopup from './CaretAnchoredPopup'
import { Input } from '@/shared/components/ui/input'

interface Props {
  position: { x: number; y: number }
  initialUrl: string
  canRemove: boolean
  onApply: (url: string) => void
  onRemove: () => void
  onClose: () => void
}

export default function LinkInsertPopup({ position, initialUrl, canRemove, onApply, onRemove, onClose }: Props) {
  const [url, setUrl] = useState(initialUrl)

  function apply() {
    onApply(url.trim())
  }

  return (
    <CaretAnchoredPopup
      position={position}
      onClose={onClose}
      className="bg-white rounded-lg shadow-xl border border-gray-200 w-64 p-2"
    >
      <div className="flex flex-col gap-2">
        <Input
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
          className="text-sm"
          autoFocus
        />
        <div className="flex justify-end gap-1">
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="px-2 py-1 text-xs rounded text-red-500 hover:bg-red-50"
            >
              링크 해제
            </button>
          )}
          <button
            type="button"
            onClick={apply}
            className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            적용
          </button>
        </div>
      </div>
    </CaretAnchoredPopup>
  )
}
