import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/shared/components/ui/button'

interface BizTypeSelectBoxProps {
  sectors: string[]
  selectedSectors: string[]
  onConfirm: (selected: string[]) => void
  onClose?: () => void
}

export function BizTypeSelectBox({ sectors, selectedSectors, onConfirm, onClose }: BizTypeSelectBoxProps) {
  const [temp, setTemp] = useState<string[]>(selectedSectors)
  const [search, setSearch] = useState('')

  useEffect(() => { setTemp(selectedSectors) }, [selectedSectors])

  const sorted = useMemo(
    () => [...sectors].sort((a, b) => a.localeCompare(b, 'ko-KR')),
    [sectors]
  )

  const filtered = useMemo(
    () => search.trim() ? sorted.filter(s => s.includes(search.trim())) : sorted,
    [sorted, search]
  )

  const toggle = (s: string) =>
    setTemp(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])

  const allSelected = temp.length === sectors.length

  return (
    <div className="p-1 min-w-[380px]">
      <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-100">
        <h3 className="font-semibold text-gray-700">업종 선택</h3>
        <button
          onClick={() => setTemp(allSelected ? [] : sorted)}
          className="text-xs text-blue-600 hover:underline"
        >
          {allSelected ? '전체 해제' : '전체 선택'}
        </button>
      </div>

      <input
        type="text"
        placeholder="업종 검색..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full mb-2 px-2 py-1 text-xs border rounded outline-none focus:border-blue-400"
      />

      <div className="grid grid-cols-3 gap-y-1 gap-x-3 max-h-[280px] overflow-y-auto pr-1">
        {filtered.map(sector => (
          <div
            key={sector}
            className="flex items-center gap-2 hover:bg-gray-50 p-1 rounded cursor-pointer"
            onClick={() => toggle(sector)}
          >
            <input
              type="checkbox"
              className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
              checked={temp.includes(sector)}
              readOnly
            />
            <span className="text-[12px] text-gray-600 truncate" title={sector}>{sector}</span>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center mt-3 pt-2 border-t border-gray-100">
        <span className="text-xs text-gray-400">{temp.length}개 선택</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onClose}>취소</Button>
          <Button size="sm" className="h-8 text-xs" onClick={() => onConfirm(temp)}>확인</Button>
        </div>
      </div>
    </div>
  )
}
