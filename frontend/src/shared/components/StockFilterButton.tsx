/**
 * StockFilterButton 컴포넌트
 * 
 * 용도: 주식 종목을 필터링하기 위한 버튼 컴포넌트입니다.
 * 사용자가 종목을 선택하여 목록을 필터링할 수 있는 UI를 제공합니다.
 * Popover를 통해 StocksSelectBox를 표시하여 다중 선택을 지원합니다.
 * 
 * 사용법:
 * - uniqueStocks: 필터링 가능한 모든 종목 옵션 배열 (StockOption 타입)
 * - filterCodes: 현재 선택된 종목 코드 배열 (string[])
 * - onFilterChange: 필터 변경 시 호출되는 콜백 함수 (선택된 코드 배열을 인자로 받음)
 * 
 * 특징:
 * - 선택된 종목 수를 버튼에 표시 (예: "종목선택 (3)")
 * - 필터가 적용된 경우 X 버튼으로 초기화 가능
 * - Popover를 사용하여 공간을 효율적으로 사용
 * 
 * 예시:
 * <StockFilterButton
 *   uniqueStocks={stocks}
 *   filterCodes={selectedCodes}
 *   onFilterChange={setSelectedCodes}
 * />
 */

import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover'
import { StocksSelectBox, type StockOption } from '@/shared/components/StocksSelectBox'

interface StockFilterButtonProps {
    uniqueStocks: StockOption[];
    filterCodes: string[];
    onFilterChange: (codes: string[]) => void;
}

export function StockFilterButton({ uniqueStocks, filterCodes, onFilterChange }: StockFilterButtonProps) {
    const [isSelectBoxOpen, setIsSelectBoxOpen] = useState(false)

    return (
        <div className="flex items-center">
            <Popover open={isSelectBoxOpen} onOpenChange={setIsSelectBoxOpen}>
                <PopoverTrigger className={`
                    px-2.5 py-1 text-xs rounded border transition-colors flex items-center gap-1
                    ${filterCodes.length > 0 
                        ? 'bg-indigo-600 text-white border-indigo-500 hover:bg-indigo-600' 
                        : 'bg-indigo-50 text-indigo-500 border-indigo-200 hover:bg-indigo-100'}
                `}>
                    종목선택 {filterCodes.length > 0 && `(${filterCodes.length})`}
                </PopoverTrigger>
                
                <PopoverContent align="end" className="w-auto p-3">
                    <StocksSelectBox 
                        stocks={uniqueStocks} 
                        selectedCodes={filterCodes} 
                        onConfirm={(codes) => {
                            onFilterChange(codes)
                            setIsSelectBoxOpen(false)
                        }}
                        onClose={() => setIsSelectBoxOpen(false)}
                    />
                </PopoverContent>
            </Popover>

            {/* 필터 초기화(X) 버튼: 필터가 걸려있을 때만 표시 */}
            {filterCodes.length > 0 && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onFilterChange([]);
                    }}
                    className="ml-1 p-1 text-indigo-600 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                    title="필터 초기화"
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
