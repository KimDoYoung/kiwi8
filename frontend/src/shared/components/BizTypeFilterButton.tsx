import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover'
import { BizTypeSelectBox } from '@/shared/components/BizTypeSelectBox'

interface BizTypeFilterButtonProps {
  sectors: string[]
  selectedSectors: string[]
  onFilterChange: (sectors: string[]) => void
}

export function BizTypeFilterButton({ sectors, selectedSectors, onFilterChange }: BizTypeFilterButtonProps) {
  const [open, setOpen] = useState(false)
  const count = selectedSectors.length

  return (
    <div className="flex items-center">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className={`
          px-2.5 py-1 text-xs rounded border transition-colors flex items-center gap-1
          ${count > 0
            ? 'bg-teal-600 text-white border-teal-500 hover:bg-teal-700'
            : 'bg-teal-50 text-teal-600 border-teal-200 hover:bg-teal-100'}
        `}>
          업종선택 {count > 0 && `(${count})`}
        </PopoverTrigger>

        <PopoverContent align="start" className="w-auto p-3">
          <BizTypeSelectBox
            sectors={sectors}
            selectedSectors={selectedSectors}
            onConfirm={(s) => { onFilterChange(s); setOpen(false) }}
            onClose={() => setOpen(false)}
          />
        </PopoverContent>
      </Popover>

      {count > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onFilterChange([]) }}
          className="ml-1 p-1 text-teal-600 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
          title="업종 필터 초기화"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      )}
    </div>
  )
}
