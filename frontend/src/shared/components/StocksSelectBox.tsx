import { useState, useEffect } from 'react'
import { Button } from '@/shared/components/ui/button'

export interface StockOption {
  stk_cd: string
  stk_nm: string
}

interface StocksSelectBoxProps {
  stocks: StockOption[]
  selectedCodes: string[]
  onConfirm: (selectedCodes: string[]) => void
  onClose?: () => void
}

export function StocksSelectBox({ stocks, selectedCodes, onConfirm, onClose }: StocksSelectBoxProps) {
  const [tempSelected, setTempSelected] = useState<string[]>(selectedCodes)

  useEffect(() => {
    setTempSelected(selectedCodes)
  }, [selectedCodes])

  const toggleStock = (code: string) => {
    setTempSelected(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    )
  }

  const handleSelectAll = () => {
    if (tempSelected.length === stocks.length) {
      setTempSelected([])
    } else {
      setTempSelected(stocks.map(s => s.stk_cd))
    }
  }

  return (
    <div className="p-1 min-w-[360px]">
      <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-100">
        <h3 className="font-semibold text-gray-700">종목 필터 선택</h3>
        <button 
          onClick={handleSelectAll}
          className="text-xs text-blue-600 hover:underline"
        >
          {tempSelected.length === stocks.length ? '전체 해제' : '전체 선택'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-y-1 gap-x-3 max-h-[300px] overflow-y-auto pr-1">
        {stocks.map(stock => (
          <div 
            key={stock.stk_cd} 
            className="flex items-center gap-2 hover:bg-gray-50 p-1 rounded cursor-pointer" 
            onClick={() => toggleStock(stock.stk_cd)}
          >
            <input 
              type="checkbox" 
              className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
              checked={tempSelected.includes(stock.stk_cd)}
              readOnly
            />
            <span className="text-[13px] text-gray-600 truncate" title={stock.stk_nm}>
              {stock.stk_nm}
            </span>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2 mt-3 pt-2 border-t border-gray-100">
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onClose}>
          취소
        </Button>
        <Button size="sm" className="h-8 text-xs" onClick={() => onConfirm(tempSelected)}>
          확인
        </Button>
      </div>
    </div>
  )
}
