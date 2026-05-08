import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/shared/components/ui/button'

/**
 * StocksSelectBox
 *
 * 용도:
 * - 사용자가 종목 목록에서 다중 선택 필터를 편리하게 조정하도록 돕는 팝업/드롭다운용 선택 박스입니다.
 * - 주로 종목별 필터링, 관심 종목 선택, 또는 보고서/차트에 표시할 종목을 고르는 UI로 사용됩니다.
 *
 * 사용법:
 * 1. `stocks`에 선택 가능한 종목 목록을 전달합니다.
 * 2. `selectedCodes`에 초기 선택 상태(종목코드 배열)를 전달합니다.
 * 3. 사용자가 확인 버튼을 누르면 `onConfirm` 콜백에 최종 선택된 코드 배열이 전달됩니다.
 * 4. `onClose`가 제공되면 취소 버튼 또는 닫기 동작에 사용할 수 있습니다.
 *
 * 예시:
 * <StocksSelectBox
 *   stocks={[{ stk_cd: '005930', stk_nm: '삼성전자' }]}
 *   selectedCodes={['005930']}
 *   onConfirm={(codes) => setSelectedStocks(codes)}
 *   onClose={() => setIsOpen(false)}
 * />
 */
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

  const sortedStocks = useMemo(
    () => [...stocks].sort((a, b) => a.stk_nm.localeCompare(b.stk_nm, 'ko-KR')),
    [stocks],
  )

  const toggleStock = (code: string) => {
    setTempSelected(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    )
  }

  const handleSelectAll = () => {
    if (tempSelected.length === stocks.length) {
      setTempSelected([])
    } else {
      setTempSelected(sortedStocks.map(s => s.stk_cd))
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
        {sortedStocks.map(stock => (
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
